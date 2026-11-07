from __future__ import annotations

import asyncio
import json
import random
import re
import time
import uuid
from email.utils import parsedate_to_datetime
from typing import Any, AsyncIterator, Callable, Dict, Generic, Iterator, List, Mapping, Optional, Tuple, TypeVar, Union
from urllib.parse import quote, urlencode

from ._transport import HttpRequest, HttpResponse, Transport, TransportError, urllib_transport
from .errors import ConnectionError, WirebookError, error_from
from .models import (
    Account, AccountCreate, AccountUpdate, Bill, BillCreate, BillUpdate, CreditMemo, CreditMemoCreate, CreditMemoUpdate,
    Customer, CustomerCreate, CustomerUpdate, Employee, EmployeeCreate, EmployeeUpdate, Estimate, EstimateCreate, EstimateUpdate,
    Invoice, InvoiceCreate, InvoiceUpdate, Item, ItemCreate, ItemUpdate, NoUpdate, Payment, PaymentCreate, PurchaseOrder,
    PurchaseOrderCreate, PurchaseOrderUpdate, QbClass, QbClassCreate, QbClassUpdate, SalesOrder, SalesOrderCreate,
    SalesOrderUpdate, SalesReceipt, SalesReceiptCreate, SalesReceiptUpdate, Term, TermCreate, TermUpdate, Vendor,
    VendorCreate, VendorUpdate,
)

DEFAULT_BASE_URL = "https://wirebook.buffersoltech.com"
VERSION = "0.1.0"

Json = Dict[str, Any]

# row, create body and update body types of a Resource (see models.py)
R = TypeVar("R")
C = TypeVar("C", bound=Mapping[str, Any])
U = TypeVar("U", bound=Mapping[str, Any])

# python attribute -> URL segment
RESOURCES: Dict[str, str] = {
    "customers": "customers",
    "vendors": "vendors",
    "items": "items",
    "accounts": "accounts",
    "invoices": "invoices",
    "bills": "bills",
    "payments": "payments",
    "estimates": "estimates",
    "sales_orders": "sales-orders",
    "sales_receipts": "sales-receipts",
    "credit_memos": "credit-memos",
    "purchase_orders": "purchase-orders",
    "classes": "classes",
    "terms": "terms",
    "employees": "employees",
}


class Queued:
    """A 202: QuickBooks has not answered yet. Poll with `wb.requests.wait(queued)`."""

    state = "queued"

    def __init__(self, id: str) -> None:
        self.id = id

    def __repr__(self) -> str:
        return f"Queued(id={self.id!r})"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Queued) and other.id == self.id

    __hash__ = None  # type: ignore[assignment]


class Page:
    def __init__(self, body: Json, fetch_next: Callable[[str], "Page"]) -> None:
        self.data: List[Json] = body["data"]
        self.has_more: bool = bool(body.get("hasMore"))
        self.next_cursor: Optional[str] = body.get("nextCursor")
        self.cursor_expires_at: Optional[str] = body.get("cursorExpiresAt")
        self._fetch_next = fetch_next

    def next(self) -> Optional["Page"]:
        if self.has_more and self.next_cursor:
            return self._fetch_next(self.next_cursor)
        return None

    def __iter__(self) -> Iterator[Json]:
        return iter(self.data)


def _camel(k: str) -> str:
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), k)


def _retry_after(h: Optional[str]) -> Optional[float]:
    if not h:
        return None
    try:
        v = float(h)
        return v if v >= 0 else None
    except ValueError:
        try:
            return max(0.0, parsedate_to_datetime(h).timestamp() - time.time())
        except (TypeError, ValueError):
            return None


class _Core:
    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        max_retries: int = 2,
        timeout: float = 70.0,
        end_user: Optional[str] = None,
        transport: Optional[Transport] = None,
        sleep: Optional[Callable[[float], None]] = None,
    ) -> None:
        if not api_key:
            raise WirebookError("api_key is required", code="missing_api_key")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.timeout = timeout
        self.end_user = end_user
        self.transport: Transport = transport or urllib_transport
        self.sleep: Callable[[float], None] = sleep or time.sleep

    def _backoff(self, attempt: int) -> float:
        return min(8.0, 0.5 * 2**attempt) * (0.5 + random.random() * 0.5)

    def send(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        write: bool = False,
        end_user: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        async_: bool = False,
        max_retries: Optional[int] = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Tuple[int, Any, Dict[str, str]]:
        url = self.base_url + path
        if query:
            q = {_camel(k): ("true" if v is True else "false" if v is False else v) for k, v in query.items() if v is not None}
            if q:
                url += "?" + urlencode(q)
        h: Dict[str, str] = {
            "authorization": f"Bearer {self.api_key}",
            "accept": "application/json",
            "user-agent": f"wirebook-sdk-py/{VERSION}",
            **{k.lower(): v for k, v in (headers or {}).items()},
        }
        eu = end_user or self.end_user
        if eu:
            h["x-end-user-id"] = eu
        payload: Optional[bytes] = None
        if body is not None:
            payload = json.dumps(body).encode()
            h["content-type"] = "application/json"
        # one key for every attempt, so a retry after a lost response replays instead of repeating
        if write:
            h["idempotency-key"] = idempotency_key or str(uuid.uuid4())
        if async_:
            h["prefer"] = "respond-async"

        retries = self.max_retries if max_retries is None else max_retries
        attempt = 0
        while True:
            res: Optional[HttpResponse] = None
            net: Optional[Exception] = None
            try:
                res = self.transport(HttpRequest(method, url, h, payload, self.timeout))
            except TransportError as e:
                net = e
            if res is None:
                if attempt < retries:
                    self.sleep(self._backoff(attempt))
                    attempt += 1
                    continue
                raise ConnectionError(f"Could not reach Wirebook: {net}", code="network_error", retryable=True)

            text = res.body.decode("utf-8", "replace") if res.body else ""
            parsed: Any = None
            if text:
                try:
                    parsed = json.loads(text)
                except ValueError:
                    parsed = None
            if 200 <= res.status < 300:
                return res.status, parsed, res.headers

            ra = _retry_after(res.headers.get("retry-after"))
            err = error_from(res.status, parsed if isinstance(parsed, dict) else None, ra, text[:200] if text and parsed is None else None)
            if err.request_id is None:
                err.request_id = res.headers.get("x-request-id")
            retryable = res.status == 429 or res.status >= 500 or bool(
                isinstance(parsed, dict) and (parsed.get("error") or {}).get("retryable") is True
            )
            if retryable and attempt < retries:
                self.sleep(ra if ra is not None else self._backoff(attempt))
                attempt += 1
                continue
            raise err


class Resource(Generic[C, U, R]):
    def __init__(self, core: _Core, segment: str) -> None:
        self._c = core
        self.segment = segment
        self._base = f"/v1/qbd/{segment}"

    def list(self, *, end_user: Optional[str] = None, **params: Any) -> Page:
        """One page. Params: limit, cursor and the object's filters (snake_case ok)."""
        status, body, _ = self._c.send("GET", self._base, query=params, end_user=end_user)
        if status == 202:
            raise WirebookError("QuickBooks has not answered yet; retry the list call", code="request_pending", status=202, request_id=(body or {}).get("id"), retryable=True)
        return Page(body, lambda cur: self.list(end_user=end_user, **{**params, "cursor": cur}))

    def iterate(self, *, end_user: Optional[str] = None, **params: Any) -> Iterator[Json]:
        """Every row, following next_cursor. Cursors last 10 minutes."""
        page: Optional[Page] = self.list(end_user=end_user, **params)
        while page is not None:
            yield from page.data
            page = page.next()

    def list_all(self, *, end_user: Optional[str] = None, **params: Any) -> List[Json]:
        return list(self.iterate(end_user=end_user, **params))

    def create(self, body: C, *, end_user: Optional[str] = None, idempotency_key: Optional[str] = None, async_: bool = False) -> Union[R, Queued]:
        status, out, _ = self._c.send("POST", self._base, body=dict(body), write=True, end_user=end_user, idempotency_key=idempotency_key, async_=async_)
        return Queued(out["id"]) if status == 202 else out

    def get(self, id: str, *, end_user: Optional[str] = None) -> R:
        status, out, _ = self._c.send("GET", f"{self._base}/{quote(id, safe='')}", end_user=end_user)
        if status != 202:
            return out  # type: ignore[no-any-return]
        done = Requests(self._c).wait(out["id"])
        rows = done.get("data") or []
        if not rows:
            raise error_from(404, {"error": {"code": "not_found", "type": "not_found", "message": "No such object."}})
        return rows[0]  # type: ignore[no-any-return]

    def update(self, id: str, body: U, *, end_user: Optional[str] = None, idempotency_key: Optional[str] = None, async_: bool = False) -> Union[R, Queued]:
        """The body must carry the revisionNumber you read."""
        status, out, _ = self._c.send("POST", f"{self._base}/{quote(id, safe='')}", body=dict(body), write=True, end_user=end_user, idempotency_key=idempotency_key, async_=async_)
        return Queued(out["id"]) if status == 202 else out


class Requests:
    def __init__(self, core: _Core) -> None:
        self._c = core

    def get(self, id: str, *, end_user: Optional[str] = None) -> Json:
        return self._c.send("GET", f"/v1/requests/{quote(id, safe='')}", end_user=end_user)[1]  # type: ignore[no-any-return]

    def wait(self, id: Union[str, Queued], *, timeout: float = 60.0, interval: float = 1.0) -> Json:
        """Polls until succeeded (returns the status with `data`). A failed request raises its typed error."""
        rid = id.id if isinstance(id, Queued) else id
        waited = 0.0
        while True:
            s = self.get(rid)
            if s["state"] == "succeeded":
                return s
            if s["state"] in ("failed", "outcome_unknown"):
                fallback = {"error": {"code": "outcome_unknown", "type": "connection", "message": "The outcome is unknown."}}
                raise error_from(None, {"error": s["error"]} if s.get("error") else fallback, None, f"Request {rid} {s['state']}")
            if waited >= timeout:
                raise WirebookError(f"Request {rid} did not finish within {timeout} s", code="wait_timeout", request_id=rid, retryable=True)
            step = min(interval, timeout - waited)
            self._c.sleep(step)
            waited += step


class ConnectLinks:
    def __init__(self, core: _Core) -> None:
        self._c = core

    def create(self, external_id: str, company_name: Optional[str] = None) -> Json:
        body: Json = {"externalId": external_id}
        if company_name:
            body["companyName"] = company_name
        return self._c.send("POST", "/v1/connect-links", body=body)[1]  # type: ignore[no-any-return]


class Qbd:
    def __init__(self, core: _Core) -> None:
        self._c = core
        for attr, seg in RESOURCES.items():
            setattr(self, attr, Resource(core, seg))

    # typed attributes for editors; assigned dynamically from RESOURCES
    customers: Resource[CustomerCreate, CustomerUpdate, Customer]
    vendors: Resource[VendorCreate, VendorUpdate, Vendor]
    items: Resource[ItemCreate, ItemUpdate, Item]
    accounts: Resource[AccountCreate, AccountUpdate, Account]
    invoices: Resource[InvoiceCreate, InvoiceUpdate, Invoice]
    bills: Resource[BillCreate, BillUpdate, Bill]
    payments: Resource[PaymentCreate, NoUpdate, Payment]
    estimates: Resource[EstimateCreate, EstimateUpdate, Estimate]
    sales_orders: Resource[SalesOrderCreate, SalesOrderUpdate, SalesOrder]
    sales_receipts: Resource[SalesReceiptCreate, SalesReceiptUpdate, SalesReceipt]
    credit_memos: Resource[CreditMemoCreate, CreditMemoUpdate, CreditMemo]
    purchase_orders: Resource[PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrder]
    classes: Resource[QbClassCreate, QbClassUpdate, QbClass]
    terms: Resource[TermCreate, TermUpdate, Term]
    employees: Resource[EmployeeCreate, EmployeeUpdate, Employee]

    def raw(self, qbxml: str, *, end_user: Optional[str] = None, idempotency_key: Optional[str] = None, async_: bool = False) -> Union[Json, Queued]:
        status, out, _ = self._c.send("POST", "/v1/qbd/raw", body={"qbxml": qbxml}, write=True, end_user=end_user, idempotency_key=idempotency_key, async_=async_)
        return Queued(out["id"]) if status == 202 else out


class Wirebook:
    """Sync client. `Wirebook(api_key).for_user("end_...").qbd.customers.list()`."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        max_retries: int = 2,
        *,
        timeout: float = 70.0,
        end_user: Optional[str] = None,
        transport: Optional[Transport] = None,
        sleep: Optional[Callable[[float], None]] = None,
    ) -> None:
        self._kw: Dict[str, Any] = dict(api_key=api_key, base_url=base_url, max_retries=max_retries, timeout=timeout, transport=transport, sleep=sleep)
        self._core = _Core(end_user=end_user, **self._kw)
        self.qbd = Qbd(self._core)
        self.connect_links = ConnectLinks(self._core)
        self.requests = Requests(self._core)

    def for_user(self, end_user_id: str) -> "Wirebook":
        return Wirebook(end_user=end_user_id, **self._kw)


class _AsyncResource(Generic[C, U, R]):
    def __init__(self, inner: Resource[C, U, R]) -> None:
        self._r = inner
        self.segment = inner.segment

    async def list(self, **params: Any) -> Page:
        return await asyncio.to_thread(lambda: self._r.list(**params))

    async def iterate(self, **params: Any) -> AsyncIterator[Json]:
        page: Optional[Page] = await asyncio.to_thread(lambda: self._r.list(**params))
        while page is not None:
            for row in page.data:
                yield row
            cur = page
            page = await asyncio.to_thread(cur.next)

    async def list_all(self, **params: Any) -> List[Json]:
        return [row async for row in self.iterate(**params)]

    async def create(self, body: C, **kw: Any) -> Union[R, Queued]:
        return await asyncio.to_thread(lambda: self._r.create(body, **kw))

    async def get(self, id: str, **kw: Any) -> R:
        return await asyncio.to_thread(lambda: self._r.get(id, **kw))

    async def update(self, id: str, body: U, **kw: Any) -> Union[R, Queued]:
        return await asyncio.to_thread(lambda: self._r.update(id, body, **kw))


class _AsyncQbd:
    def __init__(self, inner: Qbd) -> None:
        self._q = inner
        for attr in RESOURCES:
            setattr(self, attr, _AsyncResource(getattr(inner, attr)))

    customers: _AsyncResource[CustomerCreate, CustomerUpdate, Customer]
    vendors: _AsyncResource[VendorCreate, VendorUpdate, Vendor]
    items: _AsyncResource[ItemCreate, ItemUpdate, Item]
    accounts: _AsyncResource[AccountCreate, AccountUpdate, Account]
    invoices: _AsyncResource[InvoiceCreate, InvoiceUpdate, Invoice]
    bills: _AsyncResource[BillCreate, BillUpdate, Bill]
    payments: _AsyncResource[PaymentCreate, NoUpdate, Payment]
    estimates: _AsyncResource[EstimateCreate, EstimateUpdate, Estimate]
    sales_orders: _AsyncResource[SalesOrderCreate, SalesOrderUpdate, SalesOrder]
    sales_receipts: _AsyncResource[SalesReceiptCreate, SalesReceiptUpdate, SalesReceipt]
    credit_memos: _AsyncResource[CreditMemoCreate, CreditMemoUpdate, CreditMemo]
    purchase_orders: _AsyncResource[PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrder]
    classes: _AsyncResource[QbClassCreate, QbClassUpdate, QbClass]
    terms: _AsyncResource[TermCreate, TermUpdate, Term]
    employees: _AsyncResource[EmployeeCreate, EmployeeUpdate, Employee]

    async def raw(self, qbxml: str, **kw: Any) -> Union[Json, Queued]:
        return await asyncio.to_thread(lambda: self._q.raw(qbxml, **kw))


class _AsyncRequests:
    def __init__(self, inner: Requests) -> None:
        self._r = inner

    async def get(self, id: str, **kw: Any) -> Json:
        return await asyncio.to_thread(lambda: self._r.get(id, **kw))

    async def wait(self, id: Union[str, Queued], **kw: Any) -> Json:
        return await asyncio.to_thread(lambda: self._r.wait(id, **kw))


class _AsyncConnectLinks:
    def __init__(self, inner: ConnectLinks) -> None:
        self._l = inner

    async def create(self, external_id: str, company_name: Optional[str] = None) -> Json:
        return await asyncio.to_thread(lambda: self._l.create(external_id, company_name))


class AsyncWirebook:
    """asyncio client: the stdlib sync transport runs in worker threads (asyncio.to_thread)."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, max_retries: int = 2, **kw: Any) -> None:
        self._kw = dict(kw)
        self._args = (api_key, base_url, max_retries)
        self._sync = Wirebook(api_key, base_url, max_retries, **kw)
        self.qbd = _AsyncQbd(self._sync.qbd)
        self.connect_links = _AsyncConnectLinks(self._sync.connect_links)
        self.requests = _AsyncRequests(self._sync.requests)

    def for_user(self, end_user_id: str) -> "AsyncWirebook":
        kw = {k: v for k, v in self._kw.items() if k != "end_user"}
        return AsyncWirebook(*self._args, end_user=end_user_id, **kw)
