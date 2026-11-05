import { describe, expect, it } from 'vitest';
import { finishIfSynced, loadLink, qwcFor, stepsFor } from '../src/lib/connect';
import { CONNECT_LINK_TTL_MS } from '../src/lib/bridge';
import { QbwcSimulator, FakeCompanyFile } from '../tools/simulate-qbwc/simulator';
import { BASE, SECRET, harness } from './helpers/harness';
import { derivePassword } from '../src/lib/connect';

const tokenOf = (url: string) => url.split('/connect/')[1]!;

async function newLink(h: ReturnType<typeof harness>, externalId = 'acme-42', companyName = 'Acme Builders') {
  const r = await h.call('POST', '/v1/connect-links', { body: { externalId, companyName }, user: null });
  return r;
}

/** the Web Connector as the end user's computer would run it */
async function simFor(h: ReturnType<typeof harness>, endUserId: string) {
  const u = (await h.bridge.users.get(endUserId))!;
  return new QbwcSimulator(h.post, { user: u.qbwcUsername, pass: await derivePassword(SECRET, u.id) }, new FakeCompanyFile());
}

describe('connect link lifecycle', () => {
  it('POST /v1/connect-links creates the end user and a 24 h link; only the token hash is stored', async () => {
    const h = harness();
    const r = await newLink(h);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ object: 'connect_link', externalId: 'acme-42' });
    expect(r.json.url).toMatch(/^https:\/\/wirebook\.test\/connect\/[A-Za-z0-9_-]{30,}$/);
    expect(new Date(r.json.expiresAt).getTime() - h.clock.now.getTime()).toBe(CONNECT_LINK_TTL_MS);
    const token = tokenOf(r.json.url);
    const stored = (await h.bridge.links.getByTokenHash('x'))?.tokenHash;
    expect(stored).toBeUndefined();
    const l = await loadLink(h.bridge, token, h.clock.now);
    expect(l.state).toBe('ok');
    expect(l.link!.tokenHash).not.toContain(token);
    expect(l.user).toMatchObject({ externalId: 'acme-42', status: 'pending', companyName: 'Acme Builders' });
    expect(await h.bridge.queue.queuedCount(r.json.endUserId)).toBe(1); // the first-sync probe
  });

  it('validates input and needs a key', async () => {
    const h = harness();
    expect((await h.call('POST', '/v1/connect-links', { body: {}, user: null })).json.error).toMatchObject({ code: 'invalid_request', path: 'externalId' });
    expect((await h.call('POST', '/v1/connect-links', { body: { externalId: 'a', colour: 1 }, user: null })).json.error.path).toBe('colour');
    expect((await h.call('POST', '/v1/connect-links', { body: { externalId: 'a' }, user: null, auth: null })).status).toBe(401);
  });

  it('two end users never share an OwnerID, FileID or username; the same external id reuses its end user', async () => {
    const h = harness();
    const a = await newLink(h, 'one');
    const b = await newLink(h, 'two');
    const again = await newLink(h, 'one');
    expect(again.json.endUserId).toBe(a.json.endUserId);
    const [ua, ub] = await Promise.all([h.bridge.users.get(a.json.endUserId), h.bridge.users.get(b.json.endUserId)]);
    expect(ua!.ownerGuid).not.toBe(ub!.ownerGuid);
    expect(ua!.fileGuid).not.toBe(ub!.fileGuid);
    expect(ua!.qbwcUsername).not.toBe(ub!.qbwcUsername);
    await expect(h.bridge.users.create({ ...ub!, id: 'end_dup', externalId: 'zzz', qbwcUsername: 'wb_dup' })).rejects.toThrow(/duplicate/); // same guids
    // the same external id in another environment is a different end user
    const prod = await h.call('POST', '/v1/connect-links', { body: { externalId: 'one' }, user: null, auth: h.key('production') });
    expect(prod.json.endUserId).not.toBe(a.json.endUserId);
  });

  it('each step turns green only when the server observed it', async () => {
    const h = harness();
    const r = await newLink(h);
    const token = tokenOf(r.json.url);
    const get = async () => stepsFor((await loadLink(h.bridge, token, h.clock.now)).user!).map((s) => s.done);
    expect(await get()).toEqual([false, false, false, false]);

    // step 1: the .qwc is served
    const l = await loadLink(h.bridge, token, h.clock.now);
    await h.bridge.users.update(l.user!.id, { qwcDownloadedAt: h.clock.now });
    expect(await get()).toEqual([true, false, false, false]);

    // step 2: a poll with the username reaches us, even with a wrong password
    const wrong = new QbwcSimulator(h.post, { user: l.user!.qbwcUsername, pass: 'wrong' });
    expect((await wrong.runSession()).ended).toBe('badauth');
    expect(await get()).toEqual([true, true, false, false]);

    // steps 3 and 4: authorised (sendRequestXML) then first sync (a successful response)
    const sim = await simFor(h, l.user!.id);
    const rep = await sim.runSession();
    expect(rep.exchanges).toBe(1);
    expect(await get()).toEqual([true, true, true, true]);
    expect((await h.bridge.users.get(l.user!.id))!.status).toBe('connected');
  });

  it('is single use: closed after the first sync, and a used or expired or unknown token is refused', async () => {
    const h = harness();
    const r = await newLink(h);
    const token = tokenOf(r.json.url);
    await (await simFor(h, r.json.endUserId)).runSession();
    const live = await loadLink(h.bridge, token, h.clock.now);
    expect(live.state).toBe('ok');
    await finishIfSynced(h.bridge, live, h.clock.now);
    expect((await loadLink(h.bridge, token, h.clock.now)).state).toBe('used');
    // a new link for an already connected file is refused
    expect((await newLink(h)).json.error.code).toBe('already_connected');

    const h2 = harness();
    const r2 = await newLink(h2);
    h2.clock.now = new Date(h2.clock.now.getTime() + CONNECT_LINK_TTL_MS + 1000);
    expect((await loadLink(h2.bridge, tokenOf(r2.json.url), h2.clock.now)).state).toBe('expired');
    expect((await loadLink(h2.bridge, 'nope', h2.clock.now)).state).toBe('unknown');
    expect((await loadLink(h2.bridge, 'A'.repeat(32), h2.clock.now)).state).toBe('unknown');
  });
});

describe('.qwc output', () => {
  it('carries the end user\'s own username, OwnerID and FileID and points at /qbwc over https', async () => {
    const h = harness();
    const r = await newLink(h);
    const u = (await h.bridge.users.get(r.json.endUserId))!;
    const qwc = qwcFor(u, BASE);
    expect(qwc).toContain('<?xml version="1.0"?>');
    expect(qwc).toContain('<QBWCXML>');
    expect(qwc).toContain(`<AppURL>${BASE}/qbwc</AppURL>`);
    expect(qwc).toContain(`<UserName>${u.qbwcUsername}</UserName>`);
    expect(qwc).toContain(`<OwnerID>{${u.ownerGuid}}</OwnerID>`);
    expect(qwc).toContain(`<FileID>{${u.fileGuid}}</FileID>`);
    expect(qwc).toContain('<AppName>Wirebook Acme Builders</AppName>');
    expect(qwc).toContain('<QBType>QBFS</QBType>');
    expect(qwc).toContain('<RunEveryNSeconds>60</RunEveryNSeconds>');
    expect(qwc).not.toContain(await derivePassword(SECRET, u.id)); // the password is never in the file
    expect(() => qwcFor(u, 'http://wirebook.test')).toThrow(/https/);
    expect(qwcFor(u, 'http://localhost:3000')).toContain('http://localhost:3000/qbwc');
  });

  it('escapes hostile company names', async () => {
    const h = harness();
    const r = await newLink(h, 'x', 'A & B <script>"\'');
    const u = (await h.bridge.users.get(r.json.endUserId))!;
    const qwc = qwcFor(u, BASE);
    expect(qwc).not.toContain('<script>');
    expect(qwc).toMatch(/<AppName>Wirebook A B script<\/AppName>/);
  });
});
