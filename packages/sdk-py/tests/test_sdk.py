import asyncio
import json
import os
import sys
import unittest
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from wirebook import (  # noqa: E402
    AsyncWirebook, AuthenticationError, ConflictError, ConnectionError, HttpRequest, HttpResponse, InvalidRequestError,
    NotFoundError, Queued, RateLimitError, ServerError, TransportError, Wirebook, WirebookError,
)


def err(status, code, type_, message="m", retryable=False, headers=None, **extra):
    body = {"error": {"code": code, "type": type_, "message": message, "retryable": retryable, **extra}}
    return HttpResponse(status, {"content-type": "application/json", **(headers or {})}, json.dumps(body).encode())


def ok(status, body, headers=None):
    return HttpResponse(status, {"content-type": "application/json", **(headers or {})}, json.dumps(body).encode())


class FakeApi:
    """Emulates the slice of the API the SDK uses. `script` entries are consumed first (fail injection)."""

    def __init__(self):
        self.rows = []
        self.calls = []
        self.script = []
        self.keys = {}
        self.async_ids = {}

    def __call__(self, req: HttpRequest) -> HttpResponse:
        self.calls.append(req)
        if self.script:
            item = self.script.pop(0)
            if isinstance(item, Exception):
                raise item
            if callable(item):
                return item(req)
            return item
        return self.handle(req)

    def handle(self, req):
        u = urlparse(req.url)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        h = req.headers
        if h.get("authorization") == "Bearer bad":
            return err(401, "invalid_api_key", "authentication")
        parts = u.path.strip("/").split("/")
        if parts[:2] == ["v1", "requests"]:
            return ok(200, {"id": parts[2], "object": "request", "state": "succeeded", "data": [{"listId": "L1", "name": "Slow"}]})
        if parts[:2] == ["v1", "connect-links"]:
            return ok(201, {"id": "lnk_1", "url": "https://x/connect/t", "endUserId": "end_1", "externalId": json.loads(req.body)["externalId"]})
        if parts[:3] == ["v1", "qbd", "raw"]:
            return ok(200, {"requestId": "req_1", "state": "succeeded", "raw": "<x/>", "parsed": {}})
        if "x-end-user-id" not in h:
            return err(400, "end_user_required", "invalid_request", path="X-End-User-Id")
        seg = parts[2]
        if seg != "customers":
            return err(404, "not_found", "not_found")
        if len(parts) == 3 and req.method == "GET":
            limit = int(q.get("limit", 25))
            start = int(q.get("cursor", 0))
            page = self.rows[start:start + limit]
            more = start + limit < len(self.rows)
            return ok(200, {"data": page, "hasMore": more, "nextCursor": str(start + limit) if more else None, "cursorExpiresAt": None})
        if len(parts) == 3 and req.method == "POST":
            body = json.loads(req.body)
            if "bogus" in body:
                return err(400, "invalid_request", "invalid_request", path="bogus")
            key = h["idempotency-key"]
            if key in self.keys:
                if self.keys[key][0] != body:
                    return err(409, "idempotency_conflict", "conflict")
                return ok(201, self.keys[key][1], {"idempotent-replayed": "true"})
            row = {"listId": f"L{len(self.rows) + 1}", "revisionNumber": "1", **body}
            self.rows.append(row)
            self.keys[key] = (body, row)
            if h.get("prefer") == "respond-async":
                return ok(202, {"id": "req_async", "object": "request", "state": "queued"}, {"location": "/v1/requests/req_async"})
            return ok(201, row)
        if len(parts) == 4 and req.method == "GET":
            for r in self.rows:
                if r["listId"] == parts[3]:
                    return ok(200, r)
            return err(404, "not_found", "not_found", x_request="1", requestId="req_404")
        if len(parts) == 4 and req.method == "POST":
            body = json.loads(req.body)
            if "revisionNumber" not in body:
                return err(400, "invalid_request", "invalid_request", path="revisionNumber")
            if body["revisionNumber"] != "1":
                return err(409, "revision_conflict", "quickbooks")
            return ok(200, {"listId": parts[3], "revisionNumber": "2"})
        return err(500, "server_error", "server")


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()
        self.sleeps = []
        self.wb = Wirebook("sk_test", base_url="https://wb.test", transport=self.api, sleep=self.sleeps.append).for_user("end_1")

    def test_create_get_update(self):
        c = self.wb.qbd.customers.create({"name": "Acme"})
        self.assertEqual(c["name"], "Acme")
        self.assertEqual(self.wb.qbd.customers.get(c["listId"])["name"], "Acme")
        u = self.wb.qbd.customers.update(c["listId"], {"email": "a@b.test", "revisionNumber": c["revisionNumber"]})
        self.assertEqual(u["revisionNumber"], "2")
        self.assertEqual(self.api.calls[0].headers["authorization"], "Bearer sk_test")
        self.assertEqual(self.api.calls[0].headers["x-end-user-id"], "end_1")

    def test_all_resource_accessors(self):
        for attr in ["customers", "vendors", "items", "accounts", "invoices", "bills", "payments", "estimates",
                     "sales_orders", "sales_receipts", "credit_memos", "purchase_orders", "classes", "terms", "employees"]:
            self.assertTrue(hasattr(self.wb.qbd, attr), attr)
        self.assertEqual(self.wb.qbd.sales_orders.segment, "sales-orders")

    def test_pagination_three_pages(self):
        for n in "ABCDE":
            self.wb.qbd.customers.create({"name": n})
        p1 = self.wb.qbd.customers.list(limit=2)
        self.assertEqual(len(p1.data), 2)
        self.assertTrue(p1.has_more)
        p2 = p1.next()
        p3 = p2.next()
        self.assertEqual((len(p2.data), len(p3.data), p3.has_more), (2, 1, False))
        self.assertIsNone(p3.next())
        names = [r["name"] for r in self.wb.qbd.customers.iterate(limit=2)]
        self.assertEqual(names, list("ABCDE"))
        self.assertEqual(len(self.wb.qbd.customers.list_all(limit=2)), 5)

    def test_idempotency_key_reused_across_retry(self):
        real = self.api.handle

        def lose_response(req):
            real(req)  # the server applied it, the response was lost
            return HttpResponse(503, {}, b"upstream down")

        self.api.script.append(lose_response)
        c = self.wb.qbd.customers.create({"name": "Once"})
        self.assertEqual(c["name"], "Once")
        self.assertEqual(len(self.api.rows), 1)
        self.assertEqual(len(self.api.calls), 2)
        k = [c.headers["idempotency-key"] for c in self.api.calls]
        self.assertEqual(k[0], k[1])
        self.assertEqual(len(self.sleeps), 1)

    def test_retry_after_honoured(self):
        self.api.script.append(err(429, "rate_limited", "rate_limit", retryable=True, headers={"retry-after": "7"}))
        self.assertEqual(self.wb.qbd.customers.list().data, [])
        self.assertEqual(self.sleeps, [7.0])

    def test_rate_limit_error_after_retries(self):
        self.api.script.extend([err(429, "rate_limited", "rate_limit", retryable=True, headers={"retry-after": "3"})] * 3)
        with self.assertRaises(RateLimitError) as cm:
            self.wb.qbd.customers.list()
        self.assertEqual(cm.exception.retry_after, 3.0)
        self.assertEqual(self.sleeps, [3.0, 3.0])

    def test_network_errors_retry_then_connection_error(self):
        self.api.script.extend([TransportError("down")] * 3)
        with self.assertRaises(ConnectionError):
            self.wb.qbd.customers.list()
        self.assertEqual(len(self.sleeps), 2)
        self.assertEqual(len(self.api.calls), 3)

    def test_5xx_retry_then_server_error(self):
        self.api.script.extend([err(500, "server_error", "server", retryable=True)] * 3)
        with self.assertRaises(ServerError):
            self.wb.qbd.customers.list()
        self.assertEqual(len(self.api.calls), 3)

    def test_no_retry_on_400(self):
        with self.assertRaises(InvalidRequestError) as cm:
            self.wb.qbd.customers.create({"bogus": 1})
        self.assertEqual(cm.exception.path, "bogus")
        self.assertEqual(cm.exception.status, 400)
        self.assertEqual(len(self.api.calls), 1)
        self.assertEqual(self.sleeps, [])

    def test_typed_errors(self):
        bad = Wirebook("bad", base_url="https://wb.test", transport=self.api, sleep=self.sleeps.append).for_user("e")
        with self.assertRaises(AuthenticationError) as cm:
            bad.qbd.customers.list()
        self.assertIsInstance(cm.exception, WirebookError)
        self.assertEqual(cm.exception.code, "invalid_api_key")
        with self.assertRaises(NotFoundError) as nf:
            self.wb.qbd.customers.get("nope")
        self.assertEqual(nf.exception.request_id, "req_404")
        c = self.wb.qbd.customers.create({"name": "A"})
        with self.assertRaises(ConflictError) as cf:
            self.wb.qbd.customers.update(c["listId"], {"revisionNumber": "0"})
        self.assertEqual(cf.exception.code, "revision_conflict")
        self.wb.qbd.customers.create({"name": "K1"}, idempotency_key="dup")
        with self.assertRaises(ConflictError) as dup:
            self.wb.qbd.customers.create({"name": "K2"}, idempotency_key="dup")
        self.assertEqual(dup.exception.code, "idempotency_conflict")

    def test_end_user_option_and_missing(self):
        base = Wirebook("sk", base_url="https://wb.test", transport=self.api, sleep=self.sleeps.append)
        with self.assertRaises(InvalidRequestError):
            base.qbd.customers.list()
        self.assertEqual(base.qbd.customers.list(end_user="end_9").data, [])
        self.assertEqual(self.api.calls[-1].headers["x-end-user-id"], "end_9")

    def test_async_queued_and_wait(self):
        q = self.wb.qbd.customers.create({"name": "Slow"}, async_=True)
        self.assertIsInstance(q, Queued)
        self.assertEqual(q.state, "queued")
        done = self.wb.requests.wait(q)
        self.assertEqual(done["data"][0]["name"], "Slow")

    def test_wait_timeout_and_failure(self):
        pending = ok(200, {"id": "r", "state": "queued"})
        self.api.script.extend([pending] * 5)
        with self.assertRaises(WirebookError) as cm:
            self.wb.requests.wait("r", timeout=3, interval=1)
        self.assertEqual(cm.exception.code, "wait_timeout")
        self.assertEqual(self.sleeps, [1, 1, 1])
        self.api.script.append(ok(200, {"id": "r", "state": "failed", "error": {"code": "duplicate_name", "type": "quickbooks", "message": "dup"}}))
        from wirebook import QuickBooksError
        with self.assertRaises(QuickBooksError):
            self.wb.requests.wait("r")

    def test_raw_and_connect_links(self):
        self.assertEqual(self.wb.qbd.raw("<QBXML/>")["state"], "succeeded")
        self.assertEqual(self.wb.connect_links.create("ext_1", "Zed")["externalId"], "ext_1")


class AsyncTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.api = FakeApi()
        self.wb = AsyncWirebook("sk", base_url="https://wb.test", transport=self.api, sleep=lambda s: None).for_user("end_1")

    async def test_create_iterate_and_errors(self):
        for n in "ABC":
            await self.wb.qbd.customers.create({"name": n})
        names = [r["name"] async for r in self.wb.qbd.customers.iterate(limit=2)]
        self.assertEqual(names, ["A", "B", "C"])
        self.assertEqual(len((await self.wb.qbd.customers.list(limit=2)).data), 2)
        with self.assertRaises(NotFoundError):
            await self.wb.qbd.customers.get("nope")
        q = await self.wb.qbd.customers.create({"name": "S"}, async_=True)
        self.assertEqual((await self.wb.requests.wait(q))["state"], "succeeded")
        self.assertEqual((await self.wb.qbd.raw("<QBXML/>"))["state"], "succeeded")
        self.assertEqual((await asyncio.gather(self.wb.qbd.customers.list()))[0].data[0]["name"], "A")


if __name__ == "__main__":
    unittest.main()
