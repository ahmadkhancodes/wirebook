import { buildRequest, negotiateVersion, parseResponse, QbxmlParseError, QbxmlValidationError } from '../qbxml';
import { fromHresult, fromStatusCode } from '../errors/qb-status';
import { errorFor, type QbError } from '../errors/catalogue';
import { newTicket } from './memory';
import { verifyPassword } from './password';
import { arrayResponse, faultResponse, parseSoap, simpleResponse } from './soap';
import type { EndUserRepo, JobQueue, SessionStore } from './types';

export interface BridgeDeps {
  queue: JobQueue;
  users: EndUserRepo;
  sessions: SessionStore;
  now?: () => Date;
  /** Long poll: how long sendRequestXML may wait for a new job. 0 disables. */
  holdMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** session lifetime */
  sessionTtlMs?: number;
}

export const SERVER_VERSION = 'wirebook-qbwc/0.1';
const LOCKOUT_LIMIT = 20;
const LOCKOUT_WINDOW_MS = 60 * 60 * 1000;
const SOAP_HEADERS = { 'content-type': 'text/xml; charset=utf-8' };

export interface SoapResult { status: number; headers: Record<string, string>; body: string }
const ok = (body: string): SoapResult => ({ status: 200, headers: SOAP_HEADERS, body });

const invalidRequest = (e: QbxmlValidationError): QbError => errorFor('invalid_request', { message: e.message });

/** Stateless Web Connector bridge: everything lives in the injected stores. Returns a SOAP 1.1 response. */
export async function handleSoap(xml: string, deps: BridgeDeps): Promise<SoapResult> {
  const now = deps.now ?? (() => new Date());
  const call = parseSoap(xml);
  if (!call) return { status: 400, headers: SOAP_HEADERS, body: faultResponse('Malformed SOAP envelope') };
  const { op, args } = call;

  switch (op) {
    case 'clientVersion': return ok(simpleResponse(op, ''));
    case 'serverVersion': return ok(simpleResponse(op, SERVER_VERSION));

    case 'authenticate': {
      const user = await deps.users.findByUsername(args.strUserName ?? '');
      if (!user) return ok(arrayResponse(op, ['', 'nvu']));
      const t = now();
      // Connect flow step 2: a poll with this username proves the .qwc was added to the Web Connector
      if (!user.firstAuthAt) await deps.users.update(user.id, { firstAuthAt: t });
      const win = t.getTime() - user.failedAuth.windowStart.getTime() > LOCKOUT_WINDOW_MS
        ? { count: 0, windowStart: t } : user.failedAuth;
      if (win.count >= LOCKOUT_LIMIT) return ok(arrayResponse(op, ['', 'nvu']));
      if (!verifyPassword(args.strPassword ?? '', user.qbwcPasswordHash)) {
        await deps.users.update(user.id, { failedAuth: { count: win.count + 1, windowStart: win.windowStart } });
        return ok(arrayResponse(op, ['', 'nvu']));
      }
      const recovered = user.status === 'asleep' || user.status === 'broken';
      await deps.users.update(user.id, {
        failedAuth: { count: 0, windowStart: t }, lastPollAt: t,
        ...(recovered ? { status: 'connected' as const, lastError: undefined } : {}),
      });
      const ticket = newTicket();
      await deps.sessions.create({ ticket, endUserId: user.id, qbxmlVersion: '16.0', expiresAt: new Date(t.getTime() + (deps.sessionTtlMs ?? 30 * 60_000)) });
      const work = (await deps.queue.queuedCount(user.id)) > 0;
      // "" = use the company file that is open; "NONE" = nothing to do
      return ok(arrayResponse(op, [ticket, work ? '' : 'NONE']));
    }

    case 'sendRequestXML': {
      const s = await deps.sessions.get(args.ticket ?? '');
      if (!s) return ok(simpleResponse(op, '')); // unknown ticket ends the session, never a fault
      const version = negotiateVersion(args.qbXMLMajorVers ?? '', args.qbXMLMinorVers ?? '0');
      await deps.sessions.update(s.ticket, { qbxmlVersion: version });
      // Connect flow step 3: the Web Connector reached QuickBooks and the app is authorised
      const who = await deps.users.get(s.endUserId);
      if (who && !who.firstSessionAt) await deps.users.update(who.id, { firstSessionAt: now() });
      const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
      const deadline = now().getTime() + (deps.holdMs ?? 0);
      for (;;) {
        const job = await deps.queue.claim(s.endUserId, now());
        if (job) {
          try {
            if (job.op === 'raw') return ok(simpleResponse(op, String((job.body as { qbxml?: string }).qbxml ?? '')));
            return ok(simpleResponse(op, buildRequest(job.op, job.body, { requestId: job.id, version, ...(job.iterator ? { iterator: job.iterator } : {}) })));
          } catch (e) {
            if (!(e instanceof QbxmlValidationError)) throw e;
            await deps.queue.complete(job.id, { state: 'failed', error: invalidRequest(e) }, now());
            continue; // a bad request never blocks the file
          }
        }
        if (await deps.queue.inFlight(s.endUserId)) return ok(simpleResponse(op, '')); // serial per file
        if (now().getTime() >= deadline) return ok(simpleResponse(op, ''));
        await sleep(250);
      }
    }

    case 'receiveResponseXML': {
      const s = await deps.sessions.get(args.ticket ?? '');
      if (!s) return ok(simpleResponse(op, '100'));
      const job = await deps.queue.inFlight(s.endUserId);
      const t = now();
      if ((args.hresult ?? '') !== '') {
        const err = fromHresult(args.hresult ?? '');
        if (job) await deps.queue.complete(job.id, { state: 'failed', error: err }, t);
        await deps.sessions.update(s.ticket, { lastError: args.message || err.message });
        return ok(simpleResponse(op, '-1')); // QBWC then calls getLastError
      }
      if (job) {
        try {
          const r = parseResponse(args.response ?? '');
          const err = fromStatusCode(r.statusCode, r.message);
          const extra = {
            ...(job.op === 'raw' ? { rawResponse: args.response ?? '' } : {}),
            ...(r.iteratorRemaining !== undefined ? { iteratorResult: { ...(r.iteratorId ? { id: r.iteratorId } : {}), remaining: r.iteratorRemaining } } : {}),
          };
          await deps.queue.complete(job.id, err
            ? { state: 'failed', qbStatusCode: r.statusCode, error: err, ...extra }
            : { state: 'succeeded', qbStatusCode: r.statusCode, result: r.rows, ...extra }, t);
          if (!err) {
            const who = await deps.users.get(s.endUserId);
            await deps.users.update(s.endUserId, { status: 'connected', lastSuccessAt: t, ...(who && !who.firstSyncAt ? { firstSyncAt: t } : {}) });
          }
        } catch (e) {
          if (!(e instanceof QbxmlParseError)) throw e;
          await deps.queue.complete(job.id, { state: 'failed', error: errorFor('invalid_response', { message: e.message }) }, t);
        }
      }
      const remaining = await deps.queue.queuedCount(s.endUserId);
      return ok(simpleResponse(op, remaining > 0 ? '50' : '100'));
    }

    case 'connectionError': {
      const s = await deps.sessions.get(args.ticket ?? '');
      if (!s) return ok(simpleResponse(op, 'done'));
      const err = fromHresult(args.hresult ?? '');
      const job = await deps.queue.inFlight(s.endUserId);
      if (job) await deps.queue.complete(job.id, { state: 'failed', error: err }, now());
      await deps.users.update(s.endUserId, { status: 'broken', lastError: `${args.hresult ?? ''} ${args.message ?? ''}`.trim() });
      await deps.sessions.update(s.ticket, { lastError: args.message ?? err.message });
      return ok(simpleResponse(op, 'done')); // end the session cleanly
    }

    case 'getLastError': {
      const s = await deps.sessions.get(args.ticket ?? '');
      return ok(simpleResponse(op, s?.lastError ?? ''));
    }

    case 'closeConnection': {
      if (args.ticket) await deps.sessions.delete(args.ticket);
      return ok(simpleResponse(op, 'OK'));
    }

    default:
      return { status: 500, headers: SOAP_HEADERS, body: faultResponse(`Unknown operation ${op}`) };
  }
}
