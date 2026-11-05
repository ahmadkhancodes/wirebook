"""The only code that touches the network: stdlib urllib. Replaceable with any callable for tests."""
from __future__ import annotations

import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Dict, Optional


@dataclass
class HttpRequest:
    method: str
    url: str
    headers: Dict[str, str]
    body: Optional[bytes] = None
    timeout: float = 70.0


@dataclass
class HttpResponse:
    status: int
    headers: Dict[str, str] = field(default_factory=dict)  # lower-case keys
    body: bytes = b""


class TransportError(Exception):
    """The request never produced an HTTP response (DNS, refused, timeout, reset)."""


Transport = Callable[[HttpRequest], HttpResponse]


def urllib_transport(req: HttpRequest) -> HttpResponse:
    r = urllib.request.Request(req.url, data=req.body, method=req.method, headers=req.headers)
    try:
        with urllib.request.urlopen(r, timeout=req.timeout) as resp:  # noqa: S310 - https base url
            return HttpResponse(resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read())
    except urllib.error.HTTPError as e:
        return HttpResponse(e.code, {k.lower(): v for k, v in e.headers.items()}, e.read())
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        raise TransportError(str(e)) from e
