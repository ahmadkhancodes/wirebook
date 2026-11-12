import { product } from '@/config/product';
import { getBridge } from '@/lib/bridge';
import { getDb } from '@/lib/db';
import { appUrl, env, secretOr } from '@/lib/env';
import { authApiKey } from '@/lib/auth/session';
import { clientIp, HttpError } from '@/lib/http';
import { canActivateFile, isBillableFile } from '@/lib/billing/metering';
import { enforceBadKeyLimit, enforceIpLimit, guardKey } from '@/lib/security/abuse';
import { apiError } from './errors';
import type { Environment, V1Deps } from './engine';

/** Secret behind the derived Web Connector passwords. */
export const connectSecret = () => secretOr(env().BETTER_AUTH_SECRET, 'wirebook-dev-secret', 'BETTER_AUTH_SECRET');

/** Hobby caps functions at 60 s, so the sync wait is 55 s; set SYNC_WAIT_MS=90000 on Pro. */
export const syncWaitMs = () => Number(process.env.SYNC_WAIT_MS) || product.abuse.syncWaitMs;

/** Production wiring: Better Auth org keys (key metadata.environment picks test or production), kit rate limiter, the Mongo or memory bridge. */
export async function defaultDeps(req: Request): Promise<V1Deps & { secret: string }> {
  const ip = clientIp(req);
  return {
    bridge: await getBridge(),
    baseUrl: appUrl(),
    waitMs: syncWaitMs(),
    secret: connectSecret(),
    async checkFile(auth, endUser) {
      const projectId = `${auth.orgId}__${auth.environment}`;
      const billable = endUser ? isBillableFile(endUser) : auth.environment === 'production';
      if (!(await canActivateFile(await getDb(), projectId, endUser?.id ?? null, new Date(), billable))) throw apiError('file_limit_reached');
    },
    async authenticate(r) {
      const db = await getDb();
      await enforceIpLimit(db, ip);
      const raw = r.headers.get('x-api-key') ?? r.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      if (!raw) throw apiError('missing_api_key');
      let key;
      try {
        key = await authApiKey(r);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        await enforceBadKeyLimit(db, ip);
        throw apiError('invalid_api_key');
      }
      await guardKey(db, { orgId: key.orgId, keyId: key.keyId });
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
