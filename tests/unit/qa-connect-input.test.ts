import { describe, expect, it } from 'vitest';
import { harness } from '../helpers/harness';

// QA: a blank or padded externalId used to create an end user nobody could address again.
describe('connect-links input hygiene', () => {
  it('refuses a blank or control-character externalId and trims padding', async () => {
    const h = harness();
    for (const externalId of ['', '   ', '\t', 'a\u0000b', 'a\nb']) {
      expect((await h.call('POST', '/v1/connect-links', { body: { externalId }, user: null })).status, JSON.stringify(externalId)).toBe(400);
    }
    expect((await h.call('POST', '/v1/connect-links', { body: { externalId: 'ok', companyName: 'bad\u0007name' }, user: null })).status).toBe(400);
    const a = await h.call('POST', '/v1/connect-links', { body: { externalId: '  acme-1  ', companyName: '   ' }, user: null });
    expect(a.status).toBe(201);
    expect((a.json as { externalId: string }).externalId).toBe('acme-1');
  });
});
