import { getBridge } from '@/lib/bridge';
import { getDb } from '@/lib/db';
import { appUrl, env } from '@/lib/env';
import { authApiKey } from '@/lib/auth/session';
import { HttpError } from '@/lib/http';
import { canActivateFile } from '@/lib/billing/metering';
import { rateLimit, RULES } from '@/lib/security/ratelimit';
import { apiError } from './errors';
import type { Environment, V1Deps } from './engine';

/** Secret behind the derived Web Connector passwords. */
export const connectSecret = () => env().BETTER_AUTH_SECRET ?? 'wirebook-dev-secret';

/** Hobby caps functions at 60 s, so the sync wait is 55 s; set SYNC_WAIT_MS=90000 on Pro. */
export const syncWaitMs = () => Number(process.env.SYNC_WAIT_MS) || 55_000;

/** Production wiring: Better Auth org keys (key metadata.environment picks test or production), kit rate limiter, the Mongo or memory bridge. */
export async function defaultDeps(req: Request): Promise<V1Deps & { secret: string }> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return {
    bridge: await getBridge(),
    baseUrl: appUrl(),
    waitMs: syncWaitMs(),
    secret: connectSecret(),
    async checkFile(auth, endUserId) {
      if (!(await canActivateFile(await getDb(), `${auth.orgId}__${auth.environment}`, endUserId))) throw apiError('file_limit_reached');
    },
    async authenticate(r) {
      const db = await getDb();
      const raw = r.headers.get('x-api-key') ?? r.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      if (!raw) throw apiError('missing_api_key');
      let key;
      try {
        key = await authApiKey(r);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        // 10 bad keys from one address -> 429 for the rest of the minute
        const bad = await rateLimit(`badkey:${ip}`, { limit: 10, windowMs: 60_000 }, db);
        if (!bad.ok) throw apiError('rate_limited', { headers: { 'retry-after': '60' } });
        throw apiError('invalid_api_key');
      }
      const rl = await rateLimit(`api:${key.keyId}`, RULES.api, db);
      if (!rl.ok) throw apiError('rate_limited', { headers: { 'retry-after': '60' } });
      return { orgId: key.orgId, keyId: key.keyId, environment: key.environment };
    },
  };
}

export type { Environment };

/** Route helper: builds the production deps, runs the handler, maps errors to the unified error object. */
export async function withV1(req: Request, fn: (deps: V1Deps & { secret: string }) => Promise<Response>): Promise<Response> {
  const { v1 } = await import('./engine');
  const { errorResponse } = await import('./errors');
  const { errorFor } = await import('@/lib/errors/catalogue');
  let deps;
  try { deps = await defaultDeps(req); } catch { return errorResponse(errorFor('server_error'), appUrl()); }
  return v1(req, deps, () => fn(deps));
}
