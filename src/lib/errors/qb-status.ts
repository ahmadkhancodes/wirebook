import { errorFor, type QbError } from './catalogue';

export type { QbError } from './catalogue';

/** Deterministic mapping of QuickBooks status codes and Web Connector HRESULTs to catalogue errors. */
const STATUS: Record<number, string> = {
  3100: 'duplicate_name',
  3140: 'invalid_reference',
  3200: 'revision_conflict',
  3250: 'edition_not_supported',
};
const HRESULT: Record<string, string> = { '0x80040408': 'quickbooks_could_not_start' };

/** statusCode 0 = ok, 1 = no matching objects (empty OK). Returns null for success. */
export function fromStatusCode(statusCode: number, statusMessage = ''): QbError | null {
  if (statusCode === 0 || statusCode === 1) return null;
  const code = STATUS[statusCode];
  if (code) return errorFor(code);
  return errorFor('quickbooks_error', { message: `QuickBooks returned status ${statusCode}: ${statusMessage}`.trim() });
}

export function fromHresult(hresult: string): QbError {
  const code = HRESULT[hresult.toLowerCase()];
  if (code) return errorFor(code);
  return errorFor('connection_error', { message: `Web Connector reported ${hresult}.` });
}
