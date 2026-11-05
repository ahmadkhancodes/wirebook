import { describe, expect, it } from 'vitest';
import { GET, POST } from '../src/app/qbwc/route';
import { getBridge } from '../src/lib/bridge';
import { hashPassword } from '../src/lib/qbwc';
import { FakeCompanyFile, QbwcSimulator } from '../tools/simulate-qbwc/simulator';

/** The Next route handler itself (SOAP over HTTP), on the memory driver. */
describe('/qbwc route', () => {
  const post = async (xml: string) => {
    const r = await POST(new Request('https://wirebook.test/qbwc', { method: 'POST', headers: { 'content-type': 'text/xml' }, body: xml }));
    return { status: r.status, body: await r.text() };
  };

  it('serves a WSDL with all 8 operations on GET ?wsdl', async () => {
    const r = await GET(new Request('https://wirebook.test/qbwc?wsdl'));
    expect(r.headers.get('content-type')).toContain('xml');
    const xml = await r.text();
    for (const op of ['authenticate', 'clientVersion', 'serverVersion', 'sendRequestXML', 'receiveResponseXML', 'connectionError', 'getLastError', 'closeConnection']) {
      expect(xml, op).toContain(`<wsdl:operation name="${op}">`);
    }
    expect(xml).toContain('soap:address location=');
    expect(await (await GET(new Request('https://wirebook.test/qbwc'))).text()).toContain('POST SOAP');
  });

  it('runs a full Web Connector session through the route and the shared bridge store', async () => {
    const bridge = await getBridge();
    await bridge.users.create({ id: 'end_route', projectId: 'p__test', qbwcUsername: 'wb_route', qbwcPasswordHash: hashPassword('pw'), ownerGuid: crypto.randomUUID(), fileGuid: crypto.randomUUID(), status: 'pending', failedAuth: { count: 0, windowStart: new Date() } });
    const job = await bridge.queue.enqueue({ endUserId: 'end_route', op: 'customer.query', body: {}, meta: { projectId: 'p__test', method: 'GET', path: '/v1/qbd/customers', objectType: 'customers' } });
    const sim = new QbwcSimulator(post, { user: 'wb_route', pass: 'pw' }, new FakeCompanyFile());
    sim.qb.seedCustomer('Route Co');
    expect(await sim.runSession()).toMatchObject({ exchanges: 1, ended: 'done' });
    expect((await bridge.queue.get(job.id))?.state).toBe('succeeded');
    expect((await bridge.users.get('end_route'))?.status).toBe('connected');
  });

  it('answers bad credentials with nvu and a malformed envelope with 400', async () => {
    expect((await new QbwcSimulator(post, { user: 'wb_route', pass: 'wrong' }).runSession()).ended).toBe('badauth');
    const bad = await post('<not soap');
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('Fault');
  });
});
