/**
 * The error catalogue: one entry per error code Wirebook can return. Every entry has a guide page at
 * /errors/<slug> (src/app/(marketing)/errors), and `guideUrl` in API responses is built from the slug.
 * Messages are fixed strings so the same input always yields the same message.
 */
export type ErrorType = 'invalid_request' | 'authentication' | 'not_found' | 'conflict' | 'rate_limit' | 'quickbooks' | 'connection' | 'server';

export interface QbError {
  code: string;
  type: ErrorType;
  httpStatusCode: number;
  retryable: boolean;
  message: string;
  userFacingMessage: string;
  guideUrl: string;
}

export interface CatalogueEntry extends Omit<QbError, 'guideUrl'> {
  slug: string;
  title: string;
  cause: string;
  fix: string;
}

const e = (slug: string, code: string, type: ErrorType, httpStatusCode: number, retryable: boolean, title: string, message: string, userFacingMessage: string, cause: string, fix: string): CatalogueEntry =>
  ({ slug, code, type, httpStatusCode, retryable, title, message, userFacingMessage, cause, fix });

export const CATALOGUE: readonly CatalogueEntry[] = [
  // request and API errors
  e('invalid-request', 'invalid_request', 'invalid_request', 400, false, 'Invalid request', 'The request is not valid. See path for the field.', 'The request could not be sent to QuickBooks.', 'A field is missing, has the wrong type, is too long or is not known for this object. The error carries the JSON path of the first problem.', 'Fix the field named in `path` and send the request again. Unknown fields are rejected rather than ignored.'),
  e('invalid-qbxml', 'invalid_qbxml', 'invalid_request', 400, false, 'Invalid qbXML', 'The qbXML is not well formed or is not a single request message.', 'The qbXML could not be read.', 'The body of /v1/qbd/raw is not well formed XML, has no QBXML/QBXMLMsgsRq element, or contains more than one request.', 'Send exactly one request inside QBXMLMsgsRq. The error carries the line and column of the first XML problem.'),
  e('invalid-json', 'invalid_json', 'invalid_request', 400, false, 'Invalid JSON', 'The request body is not valid JSON.', 'The request body could not be read.', 'The body is empty where one is required, or it is not valid JSON.', 'Send a JSON object with Content-Type: application/json.'),
  e('payload-too-large', 'payload_too_large', 'invalid_request', 413, false, 'Payload too large', 'The request body is larger than 1 MB.', 'The request is too large.', 'The body is over the 1 MB limit.', 'Split the work into several requests, for example one invoice per request.'),
  e('invalid-cursor', 'invalid_cursor', 'invalid_request', 400, false, 'Invalid cursor', 'The cursor is not valid for this request.', 'The page link is not valid.', 'The cursor was edited, or it was issued for another object or company file.', 'Pass the nextCursor value from the previous page unchanged, on the same object and the same end user.'),
  e('cursor-expired', 'cursor_expired', 'invalid_request', 410, false, 'Cursor expired', 'The cursor has expired. Start again without a cursor.', 'This page link has expired.', 'Cursors are valid for 10 minutes because QuickBooks drops its iterator after that.', 'Request the first page again, without a cursor, and page through faster.'),
  e('missing-api-key', 'missing_api_key', 'authentication', 401, false, 'Missing API key', 'No API key was sent.', 'This request is missing an API key.', 'There is no Authorization: Bearer header and no x-api-key header.', 'Send your secret key as Authorization: Bearer sk_test_... from your server.'),
  e('invalid-api-key', 'invalid_api_key', 'authentication', 401, false, 'Invalid API key', 'The API key is not valid, or it was revoked.', 'This API key is not valid.', 'The key is mistyped, deleted or revoked.', 'Create a new key in the dashboard under API keys.'),
  e('end-user-required', 'end_user_required', 'invalid_request', 400, false, 'End user required', 'Send X-End-User-Id with the id or the external id of the end user.', 'No company file was chosen for this request.', 'Every QuickBooks call runs against one end user\'s company file, and the header that names it is missing.', 'Add the X-End-User-Id header. Create the end user with POST /v1/connect-links first.'),
  e('end-user-not-found', 'end_user_not_found', 'not_found', 404, false, 'End user not found', 'No end user matches X-End-User-Id in this environment.', 'We could not find this company file.', 'The id is wrong, or the end user was created in the other environment (test and production are separate).', 'Check the id and the key environment. Create the end user with POST /v1/connect-links.'),
  e('not-found', 'not_found', 'not_found', 404, false, 'Not found', 'No such object, or no such route.', 'We could not find that record.', 'The id does not exist in this company file, or the route is not part of the API.', 'Check the id. List the object to see what exists.'),
  e('not-supported', 'not_supported', 'invalid_request', 405, false, 'Not supported yet', 'This operation is not available for this object yet.', 'This action is not available yet.', 'The object exists, but this operation is not part of the API yet.', 'See the API reference for the operations each object supports.'),
  e('idempotency-conflict', 'idempotency_conflict', 'conflict', 409, false, 'Idempotency key reused', 'This Idempotency-Key was already used with a different request.', 'This request conflicts with an earlier one.', 'The same Idempotency-Key was sent with a different method, path or body within 7 days.', 'Use a new key for a new request. Send the same key only to retry the identical request.'),
  e('rate-limited', 'rate_limited', 'rate_limit', 429, true, 'Rate limited', 'Too many requests. Retry after the time in Retry-After.', 'Too many requests. Try again in a moment.', 'The key sent more requests than its limit allows, or too many bad keys came from one address.', 'Wait for Retry-After seconds, then retry. Spread bursts out or batch them.'),
  e('daily-cap-reached', 'daily_cap_reached', 'rate_limit', 429, true, 'Daily request cap reached', 'This organization used its daily request allowance. It resets at 00:00 UTC; see Retry-After.', 'This app has made as many requests as its plan allows today. Try again tomorrow.', 'Each plan has a fair-use cap on API requests per organization and UTC day, counted across test and production keys.', 'Wait for Retry-After seconds, cache reads on your side, or move to a plan with a higher cap (see Limits in the docs).'),
  e('org-suspended', 'org_suspended', 'authentication', 403, false, 'Organization suspended', 'This organization is suspended. Contact support.', 'This app is suspended. Contact its owner.', 'We suspended the organization, for example after abuse, a chargeback or a breach of the acceptable use policy.', 'Write to support. We reply within one business day and say why.'),
  e('key-suspended', 'key_suspended', 'authentication', 403, false, 'API key suspended', 'This API key is suspended. Use another key or contact support.', 'This API key is suspended.', 'We suspended this key, for example after it leaked or sent abusive traffic.', 'Create a new key in the dashboard under API keys, and rotate anywhere the old one was used.'),
  e('file-limit-reached', 'file_limit_reached', 'invalid_request', 402, false, 'Company file limit reached', 'This organization is on a plan that does not include another active company file this month.', 'This app has reached its company file limit. Ask its owner to upgrade the plan.', 'The Developer plan includes 3 active production files a month. A new production file would be the 4th.', 'Choose a paid plan under Billing in the dashboard, or use test environment keys and sample company files, which are free and unlimited.'),
  e('connect-link-expired', 'connect_link_expired', 'invalid_request', 410, false, 'Connect link expired', 'The connect link has expired.', 'This connect link has expired. Ask for a new one.', 'Connect links are valid for 24 hours.', 'Create a new link with POST /v1/connect-links.'),
  e('connect-link-used', 'connect_link_used', 'invalid_request', 410, false, 'Connect link already used', 'The connect link was already used to finish a connection.', 'This connect link was already used.', 'A link is single use. The first sync closed it.', 'Create a new link if this company file needs to be connected again.'),
  e('already-connected', 'already_connected', 'conflict', 409, false, 'End user already connected', 'This end user has already completed a first sync.', 'This company file is already connected.', 'A connect link was requested for an end user whose company file already synced once.', 'Use the existing connection. If the file is Asleep or Broken you can create a new link for it, from the API or with Send reconnect link in the dashboard.'),
  e('server-error', 'server_error', 'server', 500, true, 'Server error', 'Something went wrong on our side.', 'Something went wrong. Please try again.', 'An unexpected failure inside Wirebook.', 'Retry with the same Idempotency-Key. If it keeps failing, contact support with the request id.'),
  // QuickBooks status codes
  e('3100', 'duplicate_name', 'quickbooks', 409, false, 'QuickBooks status 3100: name already in use', 'The name is already in use by another list element in this company file (3100).', 'That name is already used in QuickBooks. Use the existing record or pick a new name.', 'Customers, vendors, items and accounts share a name space per list. Another record already has this name.', 'Query for the existing record and use it, or choose a different name.'),
  e('3140', 'invalid_reference', 'quickbooks', 422, false, 'QuickBooks status 3140: invalid reference', 'A referenced list item does not exist in this company file (3140).', 'A name or item in this request was not found in QuickBooks.', 'A customer, vendor, item or account named in a ref field is not in the company file.', 'Create the referenced record first, or use the ListID or FullName of an existing one.'),
  e('3200', 'revision_conflict', 'quickbooks', 409, false, 'QuickBooks status 3200: revisionNumber out of date', 'The revisionNumber is out of date; the record changed in QuickBooks (3200).', 'This record changed in QuickBooks. Reload it and try again.', 'Someone edited the record after you read it, so its EditSequence moved on.', 'Read the record again, apply your change to the fresh copy and send the new revisionNumber.'),
  e('3250', 'edition_not_supported', 'quickbooks', 422, false, 'QuickBooks status 3250: not supported by this edition', 'This request is not supported by the QuickBooks edition or version on this company file (3250).', 'Your version of QuickBooks does not support this action.', 'The feature is off, or not part of the edition or the qbXML version this file supports.', 'Check the edition and enable the feature in QuickBooks preferences.'),
  e('quickbooks-error', 'quickbooks_error', 'quickbooks', 502, false, 'QuickBooks returned an error', 'QuickBooks returned an error.', 'QuickBooks returned an error. Please try again or contact support.', 'QuickBooks answered with a status code Wirebook does not have a specific entry for. The message carries the code and the QuickBooks text.', 'Read the QuickBooks message in the error, fix the data and retry. Contact support with the request id if it is unclear.'),
  e('invalid-response', 'invalid_response', 'quickbooks', 502, true, 'Unreadable QuickBooks reply', 'QuickBooks sent a reply that could not be parsed.', 'QuickBooks sent a reply we could not read.', 'The qbXML response was cut off or is not well formed.', 'Retry. If it repeats, send the request id to support.'),
  // Web Connector and connection errors
  e('qb-could-not-start', 'quickbooks_could_not_start', 'connection', 502, true, 'HRESULT 0x80040408: QuickBooks could not be started', 'QuickBooks is closed and could not be started on this computer (0x80040408).', "We couldn't reach QuickBooks on your computer. Open QuickBooks, sign in to your company file, then click Retry.", 'The Web Connector could not launch QuickBooks, usually because the company file is not open, or a dialog is waiting.', 'Open QuickBooks and the company file, dismiss any dialog, then run the Web Connector again.'),
  e('connection-error', 'connection_error', 'connection', 502, true, 'Web Connector reported an error', 'The Web Connector reported an error before the request could finish.', 'The connection to QuickBooks failed. Check that QuickBooks and the Web Connector are running.', 'The Web Connector sent a connection error (an HRESULT) that has no specific entry.', 'Open the Web Connector window, read its message, and run the update again.'),
  e('outcome-unknown', 'outcome_unknown', 'connection', 502, false, 'Outcome unknown', 'The request was sent to QuickBooks but no answer came back. It may or may not have been applied.', 'We sent this to QuickBooks but never heard back. We will check before anything is retried.', 'The Web Connector stopped after receiving the request, for example the computer slept.', 'Do not send it again blindly. Query by RefNumber to see whether it was applied.'),
] as const;

const bySlug = new Map(CATALOGUE.map((c) => [c.slug, c]));
const byCode = new Map(CATALOGUE.map((c) => [c.code, c]));
export const guideUrlFor = (slug: string) => `/errors/${slug}`;
export const entryBySlug = (slug: string) => bySlug.get(slug);

/** Build the error object for a catalogue code. `message` can override the generic text with specifics (never user input unescaped). */
export function errorFor(code: string, overrides: Partial<Pick<QbError, 'message' | 'retryable'>> = {}): QbError {
  const c = byCode.get(code) ?? byCode.get('server_error')!;
  const { slug, title: _t, cause: _c, fix: _f, ...rest } = c;
  return { ...rest, ...overrides, guideUrl: guideUrlFor(slug) };
}
