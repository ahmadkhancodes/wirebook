import { describe, expect, it, vi } from 'vitest';
import { sendMailSafe } from '../../src/lib/mail';
import { resendTransport } from '../../src/lib/mail/transports';
import { revokeEndUser } from '../../src/lib/connect';
import { healthTick } from '../../src/lib/health';
import { harness } from '../helpers/harness';

/** Launch hardening regressions. */

describe('mail provider rejection', () => {
  it('sendMailSafe never throws when Resend rejects, and leaks nothing', async () => {
    const rejecting = resendTransport('re_x', (async () => new Response('{"message":"secret provider detail re_x"}', { status: 422 })) as typeof fetch);
    const r = await sendMailSafe({ to: 'bad address', subject: 's', text: 't' }, rejecting);
    expect(r.accepted).toBe(false);
    expect(JSON.stringify(r)).not.toContain('secret');
  });
  it('sendMailSafe survives a rate limit and a network failure', async () => {
    const limited = resendTransport('re_x', (async () => new Response('', { status: 429 })) as typeof fetch);
    expect((await sendMailSafe({ to: 'a@b.test', subject: 's', text: 't' }, limited)).accepted).toBe(false);
    const down = resendTransport('re_x', (async () => { throw new Error('ECONNRESET'); }) as typeof fetch);
    expect((await sendMailSafe({ to: 'a@b.test', subject: 's', text: 't' }, down)).accepted).toBe(false);
  });
  it('a failing mail send does not abort the health tick, and the incident is still marked notified', async () => {
    const h = harness();
    const { user } = await h.addUser('end_p', { projectId: 'org_1__production' });
    await h.bridge.users.update(user.id, { status: 'broken', lastError: 'x', lastPollAt: h.clock.now });
    const send = vi.fn(async () => { throw new Error('provider down'); });
    await healthTick({ bridge: h.bridge, ownerEmail: async () => 'o@x.test', send, baseUrl: 'https://w.test', now: () => h.clock.now } as never);
    expect(send).toHaveBeenCalled();
    expect((await h.bridge.users.get(user.id))?.brokenNotifiedAt).toBeTruthy();
  });
});

describe('company file revoke', () => {
  it('stops the Web Connector login and fails queued requests', async () => {
    const h = harness();
    const { user, sim } = await h.addUser('end_r');
    const queued = await h.bridge.queue.enqueue({ endUserId: 'end_r', op: 'customer.query', body: {} });
    const r = await revokeEndUser(h.bridge, (await h.bridge.users.get(user.id))!, h.clock.now);
    expect(r.failedJobs).toBe(1);
    expect((await h.bridge.queue.get(queued.id))?.state).toBe('failed');
    expect((await h.bridge.queue.get(queued.id))?.error?.code).toBe('end_user_revoked');
    expect((await sim.runSession()).authResult).toBe('nvu');
    expect(await revokeEndUser(h.bridge, (await h.bridge.users.get(user.id))!, h.clock.now)).toEqual({ failedJobs: 0 }); // idempotent
  });
});
