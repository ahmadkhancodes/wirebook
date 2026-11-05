# wirebook (Python)

Python SDK for [Wirebook](https://wirebook.buffersoltech.com): QuickBooks Desktop over REST and JSON.
Standard library only (`urllib`), typed, Python 3.9+.

## Install

```sh
pip install wirebook
```

## Quick start

```python
from wirebook import Wirebook

wb = Wirebook("sk_test_...")           # base_url=..., max_retries=2

link = wb.connect_links.create("acme", "Acme Builders")   # send link["url"] to your customer

acme = wb.for_user("acme")             # or pass end_user="acme" per call
c = acme.qbd.customers.create({"name": "Northwind"})
acme.qbd.customers.update(c["listId"], {"email": "ap@northwind.test", "revisionNumber": c["revisionNumber"]})
acme.qbd.customers.get(c["listId"])
acme.qbd.raw("<?xml version='1.0'?>...")
```

Resources: `customers vendors items accounts invoices bills payments estimates sales_orders sales_receipts credit_memos purchase_orders classes terms employees`,
each with `list create get update iterate list_all`. Snake_case filter names are sent as camelCase (`modified_since` -> `modifiedSince`).

## Pagination

```python
page = acme.qbd.customers.list(limit=50)
page.data, page.has_more, page.next()

for row in acme.qbd.customers.iterate(limit=100):
    ...
```

Cursors last 10 minutes.

## asyncio

```python
from wirebook import AsyncWirebook

acme = AsyncWirebook("sk_test_...").for_user("acme")
c = await acme.qbd.customers.create({"name": "Northwind"})
async for row in acme.qbd.customers.iterate(limit=100):
    ...
```

The stdlib transport runs in worker threads (`asyncio.to_thread`).

## Retries, idempotency, async requests

Writes get an `Idempotency-Key` automatically, reused across retries (or pass `idempotency_key=`).
Network errors, 429 (honours `Retry-After`), 5xx and `retryable` errors are retried with exponential backoff and jitter; other 4xx never.
A 202 returns `Queued(id)`; `wb.requests.wait(queued, timeout=60)` polls until done. Pass `async_=True` to ask for 202 immediately.

## Errors

`WirebookError` (`code`, `type`, `status`, `request_id`, `guide_url`, `retryable`, `path`) and subclasses
`AuthenticationError`, `InvalidRequestError`, `NotFoundError`, `ConflictError`, `RateLimitError` (`retry_after`),
`QuickBooksError`, `ConnectionError`, `ServerError`.

```python
from wirebook import ConflictError
try:
    acme.qbd.customers.update(cid, {"revisionNumber": rev, "email": "x@y.test"})
except ConflictError as e:
    print(e.code, e.request_id, e.guide_url)
```

## Tests

`python3 -m unittest discover -s tests` (fake transport, no network). MIT licence.
