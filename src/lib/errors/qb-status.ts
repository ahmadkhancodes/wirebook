/** Deterministic mapping of QuickBooks status codes and Web Connector HRESULTs to Wirebook errors. Core subset; the full 30 code catalogue lands in M3. */
export interface QbError {
  code: string;
  type: 'invalid_request' | 'quickbooks' | 'connection';
  httpStatusCode: number;
  retryable: boolean;
  message: string;
  userFacingMessage: string;
  guideUrl: string;
}

const g = (slug: string) => `/errors/${slug}`;

const STATUS: Record<number, QbError> = {
  3100: { code: 'edition_not_supported', type: 'quickbooks', httpStatusCode: 422, retryable: false, message: 'This request is not supported by the QuickBooks edition or version on this company file (3100).', userFacingMessage: 'Your version of QuickBooks does not support this action.', guideUrl: g('3100') },
  3140: { code: 'invalid_reference', type: 'quickbooks', httpStatusCode: 422, retryable: false, message: 'A referenced list item does not exist in this company file (3140).', userFacingMessage: 'A name or item in this request was not found in QuickBooks.', guideUrl: g('3140') },
  3200: { code: 'revision_conflict', type: 'quickbooks', httpStatusCode: 409, retryable: false, message: 'The revisionNumber is out of date; the record changed in QuickBooks (3200).', userFacingMessage: 'This record changed in QuickBooks. Reload it and try again.', guideUrl: g('3200') },
};

const HRESULT: Record<string, QbError> = {
  '0x80040408': { code: 'quickbooks_could_not_start', type: 'connection', httpStatusCode: 502, retryable: true, message: 'QuickBooks is closed and could not be started on this computer (0x80040408).', userFacingMessage: "We couldn't reach QuickBooks on your computer. Open QuickBooks, sign in to your company file, then click Retry.", guideUrl: g('qb-could-not-start') },
};

const FALLBACK: QbError = { code: 'quickbooks_error', type: 'quickbooks', httpStatusCode: 502, retryable: false, message: 'QuickBooks returned an error.', userFacingMessage: 'QuickBooks returned an error. Please try again or contact support.', guideUrl: g('quickbooks-error') };

/** statusCode 0 = ok, 1 = no matching objects (empty OK). Returns null for success. */
export function fromStatusCode(statusCode: number, statusMessage = ''): QbError | null {
  if (statusCode === 0 || statusCode === 1) return null;
  const hit = STATUS[statusCode];
  if (hit) return hit;
  return { ...FALLBACK, message: `QuickBooks returned status ${statusCode}: ${statusMessage}`.trim() };
}

export function fromHresult(hresult: string): QbError {
  const key = hresult.toLowerCase();
  return HRESULT[key] ?? { ...FALLBACK, type: 'connection', retryable: true, message: `Web Connector reported ${hresult}.` };
}
