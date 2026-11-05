export interface ErrorBody {
  error?: {
    code?: string;
    type?: string;
    message?: string;
    userFacingMessage?: string;
    guideUrl?: string;
    retryable?: boolean;
    path?: string;
    requestId?: string;
  };
}

export interface WirebookErrorInit {
  message: string;
  code?: string;
  type?: string;
  status?: number;
  requestId?: string;
  guideUrl?: string;
  retryable?: boolean;
  path?: string;
  userFacingMessage?: string;
}

/** Base class of every error the SDK throws. */
export class WirebookError extends Error {
  readonly code: string | undefined;
  readonly type: string | undefined;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly guideUrl: string | undefined;
  readonly retryable: boolean;
  readonly path: string | undefined;
  readonly userFacingMessage: string | undefined;

  constructor(init: WirebookErrorInit) {
    super(init.message);
    this.name = new.target.name;
    this.code = init.code;
    this.type = init.type;
    this.status = init.status;
    this.requestId = init.requestId;
    this.guideUrl = init.guideUrl;
    this.retryable = init.retryable ?? false;
    this.path = init.path;
    this.userFacingMessage = init.userFacingMessage;
  }
}

export class AuthenticationError extends WirebookError {}
export class InvalidRequestError extends WirebookError {}
export class NotFoundError extends WirebookError {}
/** Idempotency key reuse (idempotency_conflict) and stale revisionNumber (revision_conflict). */
export class ConflictError extends WirebookError {}
export class RateLimitError extends WirebookError {
  /** seconds, from the Retry-After header */
  readonly retryAfter: number | undefined;
  constructor(init: WirebookErrorInit, retryAfter?: number) {
    super(init);
    this.retryAfter = retryAfter;
  }
}
/** QuickBooks answered with an error (duplicate_name, invalid_reference, quickbooks_error, ...). */
export class QuickBooksError extends WirebookError {}
/** The Web Connector or QuickBooks was unreachable, or the network failed before an answer arrived. */
export class ConnectionError extends WirebookError {}
export class ServerError extends WirebookError {}

/** Maps a unified error body (and the HTTP status) to a typed error. */
export function errorFrom(statusIn: number | undefined, body: ErrorBody | null, retryAfter?: number, fallbackMessage?: string): WirebookError {
  const e = body?.error;
  const status = statusIn ?? 0;
  const init: WirebookErrorInit = {
    message: e?.message ?? fallbackMessage ?? `HTTP ${status}`,
    ...(e?.code !== undefined ? { code: e.code } : {}),
    ...(e?.type !== undefined ? { type: e.type } : {}),
    ...(statusIn !== undefined ? { status } : {}),
    ...(e?.requestId !== undefined ? { requestId: e.requestId } : {}),
    ...(e?.guideUrl !== undefined ? { guideUrl: e.guideUrl } : {}),
    retryable: e?.retryable ?? (status === 429 || status >= 500),
    ...(e?.path !== undefined ? { path: e.path } : {}),
    ...(e?.userFacingMessage !== undefined ? { userFacingMessage: e.userFacingMessage } : {}),
  };
  if (e?.code === 'revision_conflict' || e?.type === 'conflict') return new ConflictError(init);
  switch (e?.type) {
    case 'invalid_request': return new InvalidRequestError(init);
    case 'authentication': return new AuthenticationError(init);
    case 'not_found': return new NotFoundError(init);
    case 'rate_limit': return new RateLimitError(init, retryAfter);
    case 'quickbooks': return new QuickBooksError(init);
    case 'connection': return new ConnectionError(init);
    case 'server': return new ServerError(init);
  }
  if (status === 401) return new AuthenticationError(init);
  if (status === 404) return new NotFoundError(init);
  if (status === 409) return new ConflictError(init);
  if (status === 429) return new RateLimitError(init, retryAfter);
  if (status >= 500) return new ServerError(init);
  if (status >= 400) return new InvalidRequestError(init);
  return new WirebookError(init);
}
