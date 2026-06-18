"""Woohoo OAuth 2.0 request signing (HMAC-SHA512)."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any
from urllib.parse import quote, urlencode, urlsplit, urlunsplit


def rfc3986_encode(value: str) -> str:
    encoded = quote(value, safe="")
    return (
        encoded.replace("!", "%21")
        .replace("'", "%27")
        .replace("(", "%28")
        .replace(")", "%29")
        .replace("*", "%2A")
    )


def sort_object_deep(value: Any) -> Any:
    if value is None or not isinstance(value, (dict, list)):
        return value
    if isinstance(value, list):
        return [sort_object_deep(item) for item in value]
    return {key: sort_object_deep(value[key]) for key in sorted(value.keys())}


def sort_query_string_url(abs_api_url: str) -> str:
    parts = urlsplit(abs_api_url)
    if not parts.query:
        return abs_api_url
    segments = [seg for seg in parts.query.split("&") if seg]
    pairs: list[tuple[str, str]] = []
    for seg in segments:
        key = seg.split("=", 1)[0] if "=" in seg else seg
        pairs.append((key, seg))
    pairs.sort(key=lambda item: item[0])
    query = "&".join(rest for _, rest in pairs)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def canonical_request_body_string(body: Any, *, pretty: bool = False) -> str:
    sorted_body = sort_object_deep(body)
    if pretty:
        return json.dumps(sorted_body, indent=4, separators=(",", ": "))
    return json.dumps(sorted_body, separators=(",", ":"))


def is_woohoo_signature_body_absent(body: Any) -> bool:
    if body is None:
        return True
    if not isinstance(body, dict):
        return False
    return len(body) == 0


def build_request_signature_base_string(
    request_http_method: str,
    absolute_api_url: str,
    request_body: Any = None,
    *,
    pretty_json: bool = False,
) -> str:
    method = request_http_method.upper()
    encoded_url = rfc3986_encode(
        sort_query_string_url(absolute_api_url) if "?" in absolute_api_url else absolute_api_url
    )
    base = f"{method}&{encoded_url}"
    if method == "GET" or is_woohoo_signature_body_absent(request_body):
        return base
    encoded_body = rfc3986_encode(canonical_request_body_string(request_body, pretty=pretty_json))
    return f"{base}&{encoded_body}"


def compute_hmac_sha512_hex(client_secret: str, base_string: str) -> str:
    return hmac.new(client_secret.encode("utf-8"), base_string.encode("utf-8"), hashlib.sha512).hexdigest()


def build_absolute_url(base_url: str, path: str, params: dict[str, Any] | None = None) -> str:
    root = base_url.rstrip("/")
    path_part = path if path.startswith("/") else f"/{path}"
    url = f"{root}{path_part}"
    if params:
        sorted_items = sorted((str(k), str(v)) for k, v in params.items())
        url = f"{url}?{urlencode(sorted_items)}"
    return sort_query_string_url(url)
