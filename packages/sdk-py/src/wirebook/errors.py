"""Typed exceptions. Every error the SDK raises derives from WirebookError."""
from __future__ import annotations

from typing import Any, Dict, Optional


class WirebookError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        type: Optional[str] = None,
        status: Optional[int] = None,
        request_id: Optional[str] = None,
        guide_url: Optional[str] = None,
        retryable: bool = False,
        path: Optional[str] = None,
        user_facing_message: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.type = type
        self.status = status
        self.request_id = request_id
        self.guide_url = guide_url
        self.retryable = retryable
        self.path = path
        self.user_facing_message = user_facing_message


class AuthenticationError(WirebookError):
    pass


class InvalidRequestError(WirebookError):
    pass


class NotFoundError(WirebookError):
    pass


class ConflictError(WirebookError):
    """Idempotency key reuse (idempotency_conflict) and stale revisionNumber (revision_conflict)."""


class RateLimitError(WirebookError):
    def __init__(self, message: str, *, retry_after: Optional[float] = None, **kw: Any) -> None:
        super().__init__(message, **kw)
        self.retry_after = retry_after


class QuickBooksError(WirebookError):
    pass


class ConnectionError(WirebookError):  # noqa: A001 - mirrors the TS SDK name
    """Web Connector or QuickBooks unreachable, or the network failed before an answer arrived."""


class ServerError(WirebookError):
    pass


def error_from(status: Optional[int], body: Optional[Dict[str, Any]], retry_after: Optional[float] = None, fallback: Optional[str] = None) -> WirebookError:
    e: Dict[str, Any] = (body or {}).get("error") or {}
    s = status or 0
    kw: Dict[str, Any] = dict(
        code=e.get("code"),
        type=e.get("type"),
        status=status,
        request_id=e.get("requestId"),
        guide_url=e.get("guideUrl"),
        retryable=bool(e.get("retryable", s == 429 or s >= 500)),
        path=e.get("path"),
        user_facing_message=e.get("userFacingMessage"),
    )
    msg = e.get("message") or fallback or f"HTTP {s}"
    t = e.get("type")
    if e.get("code") == "revision_conflict" or t == "conflict":
        return ConflictError(msg, **kw)
    by_type = {
        "invalid_request": InvalidRequestError,
        "authentication": AuthenticationError,
        "not_found": NotFoundError,
        "quickbooks": QuickBooksError,
        "connection": ConnectionError,
        "server": ServerError,
    }
    if t == "rate_limit":
        return RateLimitError(msg, retry_after=retry_after, **kw)
    if t in by_type:
        return by_type[t](msg, **kw)  # type: ignore[no-any-return]
    if s == 401:
        return AuthenticationError(msg, **kw)
    if s == 404:
        return NotFoundError(msg, **kw)
    if s == 409:
        return ConflictError(msg, **kw)
    if s == 429:
        return RateLimitError(msg, retry_after=retry_after, **kw)
    if s >= 500:
        return ServerError(msg, **kw)
    if s >= 400:
        return InvalidRequestError(msg, **kw)
    return WirebookError(msg, **kw)
