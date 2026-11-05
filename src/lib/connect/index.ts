import { randomUUID } from 'node:crypto';
import { CONNECT_LINK_TTL_MS, type Bridge, type ConnectLink } from '@/lib/bridge';
import { hmacSha256Hex, randomToken, sha256 } from '@/lib/ids';
import { generateQwc, hashPassword, type EndUser } from '@/lib/qbwc';
import { apiError } from '@/lib/v1/errors';
import { newId, projectIdOf, readBody, v1, type V1Deps } from '@/lib/v1/engine';

/** The Web Connector password is derived, not stored in clear: the page can show it again while the link is valid, the DB only holds the scrypt hash. */
export async function derivePassword(secret: string, endUserId: string): Promise<string> {
  return (await hmacSha256Hex(secret, `qbwc-password:${endUserId}`)).slice(0, 20);
}

export interface Step { id: 'download' | 'add' | 'authorise' | 'sync'; label: string; done: boolean; at: string | null }

/** Each step is green only when the server has seen it happen. */
export function stepsFor(u: Pick<EndUser, 'qwcDownloadedAt' | 'firstAuthAt' | 'firstSessionAt' | 'firstSyncAt'>): Step[] {
  const s = (id: Step['id'], label: string, at?: Date): Step => ({ id, label, done: !!at, at: at ? at.toISOString() : null });
  return [
    s('download', 'Download the .qwc file', u.qwcDownloadedAt),
    s('add', 'Add it in the Web Connector', u.firstAuthAt),
    s('authorise', 'Authorise it in QuickBooks', u.firstSessionAt),
    s('sync', 'First sync', u.firstSyncAt),
  ];
}

export type LinkState = 'ok' | 'unknown' | 'expired' | 'used';
export interface LoadedLink { state: LinkState; link?: ConnectLink; user?: EndUser }

/** Resolve a token. Marks the link used once the first sync has been observed (single use). */
export async function loadLink(bridge: Bridge, token: string, now = new Date()): Promise<LoadedLink> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: 'unknown' };
  const link = await bridge.links.getByTokenHash(await sha256(token));
  if (!link) return { state: 'unknown' };
  if (link.usedAt) return { state: 'used', link };
  if (link.expiresAt <= now) return { state: 'expired', link };
  const user = await bridge.users.get(link.endUserId);
  if (!user) return { state: 'unknown' };
  return { state: 'ok', link, user };
}

export async function finishIfSynced(bridge: Bridge, l: LoadedLink, now = new Date()) {
  if (l.state === 'ok' && l.user?.firstSyncAt && l.link) await bridge.links.markUsed(l.link.id, now);
}

export function qwcFor(user: EndUser, baseUrl: string): string {
  const label = (user.companyName || user.externalId || user.id).replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return generateQwc({
    appName: `Wirebook ${label}`.trim(),
    appUrl: `${baseUrl}/qbwc`,
    appDescription: 'Connects this QuickBooks company file to the app that sent you here, through Wirebook.',
    appSupport: `${baseUrl}/docs/connect-flow`,
    username: user.qbwcUsername,
    ownerGuid: user.ownerGuid,
    fileGuid: user.fileGuid,
  });
}

export interface CreateLinkInput { externalId: string; companyName?: string }

function parseInput(body: Record<string, unknown>): CreateLinkInput {
  const { externalId, companyName } = body;
  if (typeof externalId !== 'string' || externalId.length < 1 || externalId.length > 100) throw apiError('invalid_request', { path: 'externalId' }, { message: 'externalId: is required, 1 to 100 characters' });
  if (companyName !== undefined && (typeof companyName !== 'string' || companyName.length > 100)) throw apiError('invalid_request', { path: 'companyName' }, { message: 'companyName: must be a string of at most 100 characters' });
  for (const k of Object.keys(body)) if (k !== 'externalId' && k !== 'companyName') throw apiError('invalid_request', { path: k }, { message: `${k}: unknown field` });
  return { externalId, ...(companyName ? { companyName } : {}) };
}

/** POST /v1/connect-links: creates the end user if needed (unique OwnerID and FileID), queues the first-sync probe, returns a single use 24 h link. */
export async function createConnectLink(deps: V1Deps & { secret: string }, req: Request): Promise<Response> {
  return v1(req, deps, async () => {
    const auth = await deps.authenticate(req);
    const input = parseInput(await readBody(req));
    const projectId = projectIdOf(auth);
    const now = (deps.now ?? (() => new Date()))();
    let user = await deps.bridge.users.getByExternalId(projectId, input.externalId);
    if (user?.firstSyncAt) throw apiError('already_connected');
    if (!user) {
      const id = newId('end');
      user = {
        id, projectId, externalId: input.externalId, ...(input.companyName ? { companyName: input.companyName } : {}), createdAt: now,
        qbwcUsername: `wb_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        qbwcPasswordHash: hashPassword(await derivePassword(deps.secret, id)),
        ownerGuid: randomUUID(), fileGuid: randomUUID(), status: 'pending', failedAuth: { count: 0, windowStart: now },
      };
      await deps.bridge.users.create(user);
    }
    // the first sync is a real, cheap request: it proves the file answers
    if ((await deps.bridge.queue.queuedCount(user.id)) === 0 && !(await deps.bridge.queue.inFlight(user.id))) {
      await deps.bridge.queue.enqueue({ endUserId: user.id, op: 'customer.query', body: { maxReturned: 1 }, meta: { projectId, method: 'POST', path: '/v1/connect-links', objectType: 'connection' } });
    }
    const token = randomToken(24);
    const link: ConnectLink = { id: newId('lnk'), tokenHash: await sha256(token), projectId, endUserId: user.id, createdAt: now, expiresAt: new Date(now.getTime() + CONNECT_LINK_TTL_MS) };
    await deps.bridge.links.create(link);
    return new Response(JSON.stringify({ id: link.id, object: 'connect_link', url: `${deps.baseUrl}/connect/${token}`, expiresAt: link.expiresAt.toISOString(), endUserId: user.id, externalId: input.externalId }), {
      status: 201, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  });
}
