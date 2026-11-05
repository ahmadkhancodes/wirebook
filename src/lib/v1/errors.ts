import { errorFor, type QbError } from '@/lib/errors/catalogue';

/** A catalogue error plus optional detail fields. Thrown inside handlers, turned into the unified error object at the edge. */
export class ApiError extends Error {
  constructor(public readonly err: QbError, public readonly extra: { path?: string; requestId?: string; cursorExpiresAt?: string; headers?: Record<string, string> } = {}) {
    super(err.message);
  }
}

export const apiError = (code: string, extra: ApiError['extra'] = {}, overrides: Parameters<typeof errorFor>[1] = {}) => new ApiError(errorFor(code, overrides), extra);

/** Unified error body: { error: { code, type, message, userFacingMessage, guideUrl, retryable, path?, requestId? } } */
export function errorBody(err: QbError, baseUrl: string, extra: ApiError['extra'] = {}) {
  return {
    error: {
      code: err.code,
      type: err.type,
      message: err.message,
      userFacingMessage: err.userFacingMessage,
      guideUrl: `${baseUrl}${err.guideUrl}`,
      retryable: err.retryable,
      ...(extra.path ? { path: extra.path } : {}),
      ...(extra.requestId ? { requestId: extra.requestId } : {}),
      ...(extra.cursorExpiresAt ? { cursorExpiresAt: extra.cursorExpiresAt } : {}),
    },
  };
}

export function errorResponse(err: QbError, baseUrl: string, extra: ApiError['extra'] = {}): Response {
  return new Response(JSON.stringify(errorBody(err, baseUrl, extra)), {
    status: err.httpStatusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(extra.requestId ? { 'x-request-id': extra.requestId } : {}), ...(extra.headers ?? {}) },
  });
}
