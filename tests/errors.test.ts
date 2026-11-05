import { describe, expect, it } from 'vitest';
import { CATALOGUE, entryBySlug, errorFor, guideUrlFor } from '../src/lib/errors/catalogue';
import { fromHresult, fromStatusCode } from '../src/lib/errors/qb-status';
import { errorBody } from '../src/lib/v1/errors';
import { generateStaticParams } from '../src/app/(marketing)/errors/[slug]/page';

describe('error catalogue', () => {
  it('has unique codes and slugs, and every entry is complete', () => {
    expect(new Set(CATALOGUE.map((c) => c.code)).size).toBe(CATALOGUE.length);
    expect(new Set(CATALOGUE.map((c) => c.slug)).size).toBe(CATALOGUE.length);
    for (const c of CATALOGUE) {
      expect(c.title, c.code).not.toBe('');
      expect(c.message, c.code).not.toBe('');
      expect(c.userFacingMessage, c.code).not.toBe('');
      expect(c.cause, c.code).not.toBe('');
      expect(c.fix, c.code).not.toBe('');
      expect(c.httpStatusCode, c.code).toBeGreaterThanOrEqual(400);
      expect(c.slug, c.code).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('has a guide page for every code, so every guideUrl resolves', () => {
    const slugs = new Set(generateStaticParams().map((p) => p.slug));
    for (const c of CATALOGUE) {
      expect(slugs.has(c.slug), c.code).toBe(true);
      expect(errorFor(c.code).guideUrl).toBe(guideUrlFor(c.slug));
      expect(entryBySlug(c.slug)?.code).toBe(c.code);
    }
  });

  it('maps QuickBooks status codes and HRESULTs deterministically, and every mapped guideUrl is in the catalogue', () => {
    expect(fromStatusCode(0)).toBeNull();
    expect(fromStatusCode(1)).toBeNull();
    const cases: [number, string][] = [[3100, 'duplicate_name'], [3140, 'invalid_reference'], [3200, 'revision_conflict'], [3250, 'edition_not_supported'], [9999, 'quickbooks_error']];
    for (const [n, code] of cases) {
      const e = fromStatusCode(n, 'x')!;
      expect(e.code).toBe(code);
      expect(fromStatusCode(n, 'x')).toEqual(e); // same input, same message
      expect(entryBySlug(e.guideUrl.replace('/errors/', ''))).toBeTruthy();
    }
    expect(fromStatusCode(9999, 'boom')!.message).toBe('QuickBooks returned status 9999: boom');
    expect(fromHresult('0x80040408').code).toBe('quickbooks_could_not_start');
    expect(fromHresult('0X80040408').code).toBe('quickbooks_could_not_start');
    expect(fromHresult('0x80040400')).toMatchObject({ code: 'connection_error', type: 'connection', retryable: true });
  });

  it('unified error object: stable shape, absolute guideUrl, optional path and requestId', () => {
    const body = errorBody(errorFor('invalid_request', { message: 'name: is required' }), 'https://wirebook.test', { path: 'name', requestId: 'req_1' });
    expect(body).toEqual({
      error: {
        code: 'invalid_request', type: 'invalid_request', message: 'name: is required',
        userFacingMessage: 'The request could not be sent to QuickBooks.', guideUrl: 'https://wirebook.test/errors/invalid-request',
        retryable: false, path: 'name', requestId: 'req_1',
      },
    });
    expect(errorFor('no_such_code').code).toBe('server_error');
  });
});
