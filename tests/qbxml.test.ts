import { describe, expect, it } from 'vitest';
import { buildRequest, negotiateVersion, parseResponse, QbxmlParseError, QbxmlValidationError } from '../src/lib/qbxml';
import { fromStatusCode } from '../src/lib/errors/qb-status';

const head = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError">';
const tail = '</QBXMLMsgsRq></QBXML>';

describe('qbXML builder (golden fixtures)', () => {
  it('builds CustomerQuery in schema order regardless of key order in the input', () => {
    const xml = buildRequest('customer.query', { nameFilter: { name: 'Acme', matchCriterion: 'StartsWith' }, maxReturned: 10 }, { requestId: 'req_1' });
    expect(xml).toBe(`${head}<CustomerQueryRq requestID="req_1"><MaxReturned>10</MaxReturned><NameFilter><MatchCriterion>StartsWith</MatchCriterion><Name>Acme</Name></NameFilter></CustomerQueryRq>${tail}`);
  });

  it('builds InvoiceAdd with lines, ordered elements and formatted money', () => {
    const xml = buildRequest('invoice.add', {
      refNumber: 'INV-1042', txnDate: '2026-11-05',
      customerRef: { fullName: 'Acme Builders' },
      lines: [{ rate: 107.04, quantity: 12, itemRef: { fullName: 'Framing labour' }, desc: 'Framing' }],
    }, { requestId: 'req_2' });
    expect(xml).toBe(`${head}<InvoiceAddRq requestID="req_2"><InvoiceAdd><CustomerRef><FullName>Acme Builders</FullName></CustomerRef><TxnDate>2026-11-05</TxnDate><RefNumber>INV-1042</RefNumber><InvoiceLineAdd><ItemRef><FullName>Framing labour</FullName></ItemRef><Desc>Framing</Desc><Quantity>12</Quantity><Rate>107.04</Rate></InvoiceLineAdd></InvoiceAdd></InvoiceAddRq>${tail}`);
  });

  it('escapes user text instead of concatenating it', () => {
    const xml = buildRequest('customer.add', { name: 'A & B <Co> "x"' }, { requestId: 'r' });
    expect(xml).toContain('<Name>A &amp; B &lt;Co&gt; &quot;x&quot;</Name>');
    expect(xml).not.toContain('<Co>');
  });

  it('rejects unknown fields and reports the JSON path', () => {
    expect(() => buildRequest('invoice.add', { customerRef: { fullName: 'A' }, lines: [{ itemRef: { fullName: 'I' }, colour: 'red' }] }, { requestId: 'r' }))
      .toThrowError(new QbxmlValidationError('lines[0].colour', 'unknown field'));
  });

  it('reports missing required fields, wrong types, bad dates and over-long strings', () => {
    expect(() => buildRequest('invoice.add', {}, { requestId: 'r' })).toThrow(/customerRef: is required/);
    expect(() => buildRequest('customer.add', { name: 5 }, { requestId: 'r' })).toThrow(/name: must be a string/);
    expect(() => buildRequest('customer.add', { name: 'x'.repeat(42) }, { requestId: 'r' })).toThrow(/at most 41/);
    expect(() => buildRequest('invoice.add', { customerRef: { fullName: 'A' }, txnDate: '11/05/2026' }, { requestId: 'r' })).toThrow(/YYYY-MM-DD/);
  });

  it('requires revisionNumber (EditSequence) on Mod and emits it in order', () => {
    expect(() => buildRequest('customer.mod', { listId: 'L1', name: 'X' }, { requestId: 'r' })).toThrow(/revisionNumber: is required/);
    const xml = buildRequest('customer.mod', { name: 'New', revisionNumber: '1700000000', listId: 'L1' }, { requestId: 'r' });
    expect(xml).toContain('<CustomerMod><ListID>L1</ListID><EditSequence>1700000000</EditSequence><Name>New</Name></CustomerMod>');
  });

  it('negotiates min(16.0, reported version)', () => {
    expect(negotiateVersion('13', '0')).toBe('13.0');
    expect(negotiateVersion('16', '0')).toBe('16.0');
    expect(negotiateVersion('17', '0')).toBe('16.0');
    expect(negotiateVersion('', '')).toBe('16.0');
    expect(buildRequest('customer.query', {}, { requestId: 'r', version: '13.0' })).toContain('<?qbxml version="13.0"?>');
  });
});

describe('qbXML parser and status codes', () => {
  const ok = '<?xml version="1.0"?><QBXML><QBXMLMsgsRs><CustomerQueryRs requestID="req_1" statusCode="0" statusSeverity="Info" statusMessage="Status OK"><CustomerRet><ListID>L1</ListID><EditSequence>17</EditSequence><Name>Acme</Name></CustomerRet></CustomerQueryRs></QBXMLMsgsRs></QBXML>';
  it('parses rows with camelCase keys and exposes EditSequence as revisionNumber', () => {
    const r = parseResponse(ok);
    expect(r).toMatchObject({ requestId: 'req_1', statusCode: 0, rs: 'CustomerQueryRs' });
    expect(r.rows).toEqual([{ listId: 'L1', revisionNumber: '17', name: 'Acme' }]);
  });
  it('rejects malformed responses', () => {
    expect(() => parseResponse('<QBXML><nope/></QBXML>')).toThrow(QbxmlParseError);
    expect(() => parseResponse('<a><b></a>')).toThrow(QbxmlParseError);
  });
  it('treats 0 and 1 as success and maps 3100 / 3140 deterministically', () => {
    expect(fromStatusCode(0)).toBeNull();
    expect(fromStatusCode(1)).toBeNull();
    expect(fromStatusCode(3100)?.code).toBe('duplicate_name');
    expect(fromStatusCode(3140)?.code).toBe('invalid_reference');
    expect(fromStatusCode(3140)).toEqual(fromStatusCode(3140));
  });
});
