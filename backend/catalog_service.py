"""Woohoo catalog — fetch and map products for the storefront API."""

from __future__ import annotations

import html
import json
import re
import threading
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any

from sqlalchemy.orm import Session

from logger import get_logger
from woohoo_client import WoohooAPIError, WoohooClient

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Lightweight HTML sanitizer — Woohoo returns brand T&C / redemption copy as a
# mix of plain text and HTML (<ul>, <ol>, <br/>, <a>...). We keep a safe subset
# so it can be rendered in the UI without XSS risk.
# ---------------------------------------------------------------------------
_ALLOWED_TAGS = {"p", "br", "ul", "ol", "li", "b", "strong", "i", "em", "u", "a", "span", "h3", "h4"}
_DROP_CONTENT_TAGS = {"script", "style"}


class _HTMLSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _DROP_CONTENT_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "div":
            tag = "p"
        if tag == "br":
            self.out.append("<br>")
            return
        if tag not in _ALLOWED_TAGS:
            return
        if tag == "a":
            href = dict(attrs).get("href") or ""
            if href.startswith("http://") or href.startswith("https://"):
                self.out.append(
                    f'<a href="{html.escape(href, quote=True)}" target="_blank" rel="noopener noreferrer">'
                )
            else:
                self.out.append("<a>")
            return
        self.out.append(f"<{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "br" and not self._skip_depth:
            self.out.append("<br>")

    def handle_endtag(self, tag: str) -> None:
        if tag in _DROP_CONTENT_TAGS:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth or tag == "br":
            return
        if tag == "div":
            tag = "p"
        if tag not in _ALLOWED_TAGS:
            return
        self.out.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        self.out.append(html.escape(data))

    def result(self) -> str:
        return "".join(self.out)


def sanitize_html(value: Any) -> str:
    """Return a safe HTML snippet. Plain text is wrapped into <p> paragraphs."""
    text = ("" if value is None else str(value)).strip()
    if not text:
        return ""
    if "<" not in text:
        parts = [html.escape(p.strip()) for p in re.split(r"\r?\n+", text) if p.strip()]
        return "".join(f"<p>{p}</p>" for p in parts)
    parser = _HTMLSanitizer()
    parser.feed(text)
    parser.close()
    cleaned = parser.result().strip()
    # collapse empty paragraphs the source sometimes leaves behind
    cleaned = re.sub(r"<p>\s*</p>", "", cleaned)
    return cleaned.strip()

_cache_lock = threading.Lock()
_cache: dict[str, Any] = {
    "products": [],
    "by_sku": {},
    "detail_skus": set(),  # SKUs for which we have the full product detail cached
    "category_name": "Gift Card",
    "loaded_at": None,
}

PLACEHOLDER_IMAGE = "https://via.placeholder.com/150"

# SKUs that should always surface at the top of the catalog, in this order.
PINNED_SKUS: list[str] = [
    "CNPIN",
    "VOUCHERCODE",
    "CLAIMCODE",
    "UBEFLOW",
    "GOOGLEPLAYGCB2B",
    "DISABLEDSTS",
    "PROCESSINGSTS",
    "testsuccess001",
    "APITESTTIMFAIL",
]
_PINNED_ORDER: dict[str, int] = {sku: i for i, sku in enumerate(PINNED_SKUS)}


def _int_price(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _parse_denominations(price: dict[str, Any] | None) -> list[int]:
    if not isinstance(price, dict):
        return []
    raw = price.get("denominations")
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for item in raw:
        s = str(item).strip()
        if s.isdigit():
            out.append(int(s))
    return out


def _product_image(raw: dict[str, Any]) -> str:
    images = raw.get("images") if isinstance(raw.get("images"), dict) else {}
    # Prefer higher-resolution images first to avoid blurry upscaling in the UI.
    for key in ("base", "mobile", "small", "thumbnail", "image"):
        url = images.get(key)
        if url:
            return str(url)
    logo = raw.get("brandLogo")
    return str(logo) if logo else PLACEHOLDER_IMAGE


def _important_points(raw: dict[str, Any]) -> list[str]:
    """Backward-compatible flat list of T&C bullet strings (best effort)."""
    points: list[str] = []
    cpg = raw.get("cpg") if isinstance(raw.get("cpg"), dict) else {}
    for item in cpg.get("redemptionTerms") or []:
        if item:
            points.append(str(item))
    instructions = raw.get("importantInstructions")
    if instructions:
        points.append(str(instructions))
    return points


def _default_redeem_html() -> str:
    return (
        "<ol>"
        "<li>Visit the brand's website, app or nearest store.</li>"
        "<li>Add your items and proceed to checkout / payment.</li>"
        "<li>Choose <strong>Gift Card</strong> (or eGift / voucher) as the payment option.</li>"
        "<li>Enter the card number and PIN shown in your order.</li>"
        "<li>The gift card value is applied instantly to your purchase.</li>"
        "</ol>"
    )


def _default_terms_html(validity: str) -> str:
    validity_line = f"<li>Valid for {html.escape(validity)}.</li>" if validity else ""
    return (
        "<ul>"
        f"{validity_line}"
        "<li>This gift card cannot be exchanged for cash or refunded.</li>"
        "<li>Use the full balance before the expiry date.</li>"
        "<li>Standard brand terms &amp; conditions apply.</li>"
        "</ul>"
    )


def _terms_html(raw: dict[str, Any], validity: str) -> str:
    """Build a rich Terms & Conditions HTML block from the Woohoo payload."""
    sections: list[str] = []
    tnc = raw.get("tnc") if isinstance(raw.get("tnc"), dict) else {}
    content = sanitize_html(tnc.get("content"))
    # Ignore obvious placeholder copy from the sandbox.
    if content and "brand tnc" not in content.lower():
        sections.append(content)

    cpg = raw.get("cpg") if isinstance(raw.get("cpg"), dict) else {}
    terms_list = [str(t).strip() for t in (cpg.get("redemptionTerms") or []) if str(t).strip()]
    if terms_list:
        sections.append("<ul>" + "".join(f"<li>{html.escape(t)}</li>" for t in terms_list) + "</ul>")

    if not sections:
        return _default_terms_html(validity)
    return "".join(sections)


def _terms_link(raw: dict[str, Any]) -> str:
    tnc = raw.get("tnc") if isinstance(raw.get("tnc"), dict) else {}
    link = str(tnc.get("link") or "").strip()
    return link if link.startswith("http") else ""


def _how_to_redeem_html(raw: dict[str, Any]) -> str:
    cpg = raw.get("cpg") if isinstance(raw.get("cpg"), dict) else {}
    how = sanitize_html(cpg.get("howToUse") or raw.get("importantInstructions"))
    return how or _default_redeem_html()


def _to_list_item(raw: dict[str, Any], *, category_name: str) -> dict[str, Any]:
    sku = str(raw.get("sku") or "")
    name = str(raw.get("name") or sku)
    min_amount = _int_price(raw.get("minPrice"), 10)
    max_amount = _int_price(raw.get("maxPrice"), 10000)
    image = _product_image(raw)
    validity = str(raw.get("expiry") or raw.get("formatExpiry") or "1 Year")
    return {
        "sku": sku,
        "name": name,
        "brandName": name,
        "category": category_name,
        "pinned": sku in _PINNED_ORDER,
        "image": image,
        "bannerImage": image,
        "discount": "0",
        "minAmount": min_amount,
        "maxAmount": max_amount,
        "description": sanitize_html(raw.get("shortDescription") or raw.get("description") or name),
        "validity": validity,
        "howToRedeem": _how_to_redeem_html(raw),
        "terms": _terms_html(raw, validity),
        "termsLink": _terms_link(raw),
        "importantPoints": _important_points(raw),
    }


def _to_detail_item(raw: dict[str, Any], *, category_name: str) -> dict[str, Any]:
    item = _to_list_item(raw, category_name=category_name)
    price = raw.get("price") if isinstance(raw.get("price"), dict) else {}
    price_type = str(price.get("type") or price.get("price") or "RANGE").upper()
    denominations = _parse_denominations(price)
    min_amount = _int_price(price.get("min") or raw.get("minPrice"), item["minAmount"])
    max_amount = _int_price(price.get("max") or raw.get("maxPrice"), item["maxAmount"])
    if denominations and price_type in {"FIXED", "SLAB"}:
        price_type = "FIXED"
    item["price"] = {
        "type": price_type,
        "min": min_amount,
        "max": max_amount,
        "denominations": denominations,
    }
    # Detail view: prefer the long description over the short one.
    item["description"] = sanitize_html(
        raw.get("description") or raw.get("shortDescription") or item["name"]
    )
    item["howToRedeem"] = _how_to_redeem_html(raw)
    item["terms"] = _terms_html(raw, item["validity"])
    item["termsLink"] = _terms_link(raw)
    return item


def _sort_key(product: dict[str, Any]) -> tuple[int, int, str]:
    """Pinned SKUs first (in defined order), then everything else alphabetically."""
    sku = str(product.get("sku") or "")
    if sku in _PINNED_ORDER:
        return (0, _PINNED_ORDER[sku], "")
    return (1, 0, str(product.get("brandName") or "").lower())


def _sorted_products(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(products, key=_sort_key)


def _is_woohoo_sku(sku: str) -> bool:
    sku = sku.strip()
    if not sku:
        return False
    if ":" in sku or sku.lower().startswith("valuedesign"):
        return False
    return sku.isascii() and sku.replace("-", "").replace("_", "").isalnum()


def _load_catalog(client: WoohooClient, session: Session) -> None:
    client.authenticate(session)

    categories_resp = client.api_request("GET", "/rest/v3/catalog/categories", step_name="catalog_list")
    if categories_resp.status_code >= 400:
        raise WoohooAPIError(f"Categories fetch failed: HTTP {categories_resp.status_code}")

    categories_data = json.loads(categories_resp.body)
    category_id = str(categories_data.get("id") or "")
    category_name = str(categories_data.get("name") or "Gift Card")
    if not category_id:
        raise WoohooAPIError("No category id in Woohoo catalog response")

    products_by_sku: dict[str, dict[str, Any]] = {}
    offset = 0
    limit = 50
    while True:
        page_resp = client.get_category_products(category_id, offset=offset, limit=limit)
        if page_resp.status_code >= 400:
            raise WoohooAPIError(f"Category products failed: HTTP {page_resp.status_code}")
        page = json.loads(page_resp.body)
        batch = page.get("products") or []
        if not batch:
            break
        for raw in batch:
            if not isinstance(raw, dict):
                continue
            sku = str(raw.get("sku") or "").strip()
            if not _is_woohoo_sku(sku):
                continue
            products_by_sku[sku] = _to_list_item(raw, category_name=category_name)
        if len(batch) < limit:
            break
        offset += limit

    # Pinned SKUs may not appear in the paginated category listing — fetch them
    # individually (full detail) so they always show up, at the top, with rich
    # terms / redemption / pricing data.
    detail_skus: set[str] = set()
    for sku in PINNED_SKUS:
        try:
            resp = client.get_product(sku)
            if resp.status_code != 200:
                logger.warning("Pinned SKU %s fetch returned HTTP %s", sku, resp.status_code)
                continue
            raw = json.loads(resp.body)
            if isinstance(raw, dict):
                products_by_sku[sku] = _to_detail_item(raw, category_name=category_name)
                detail_skus.add(sku)
        except (WoohooAPIError, ValueError, KeyError) as exc:
            logger.warning("Could not fetch pinned SKU %s: %s", sku, exc)

    with _cache_lock:
        _cache["products"] = _sorted_products(list(products_by_sku.values()))
        _cache["by_sku"] = products_by_sku
        _cache["detail_skus"] = detail_skus
        _cache["category_name"] = category_name
        _cache["loaded_at"] = datetime.now(timezone.utc).isoformat()

    logger.info("Loaded %s Woohoo catalog products", len(products_by_sku))


def ensure_catalog_loaded(session: Session) -> None:
    with _cache_lock:
        if _cache["by_sku"]:
            return
    client = WoohooClient()
    _load_catalog(client, session)


def get_catalog_products(session: Session) -> list[dict[str, Any]]:
    ensure_catalog_loaded(session)
    with _cache_lock:
        return _sorted_products(list(_cache["products"]))


def get_catalog_product(session: Session, sku: str) -> dict[str, Any] | None:
    ensure_catalog_loaded(session)
    with _cache_lock:
        product = _cache["by_sku"].get(sku)
        has_detail = sku in _cache["detail_skus"]

    # Return the cached entry only if we already have the full product detail.
    # The category-listing payload lacks terms / redemption / description, so a
    # list-only entry must be upgraded by fetching the full product.
    if product and has_detail:
        return product

    if not _is_woohoo_sku(sku):
        return product  # nothing better we can fetch

    client = WoohooClient()
    client.authenticate(session)
    resp = client.get_product(sku)
    if resp.status_code != 200:
        return product  # fall back to the lightweight list item if available
    raw = json.loads(resp.body)
    if not isinstance(raw, dict):
        return product
    detail = _to_detail_item(raw, category_name=_cache.get("category_name") or "Gift Card")
    with _cache_lock:
        _cache["by_sku"][sku] = detail
        _cache["detail_skus"].add(sku)
        replaced = False
        for i, existing in enumerate(_cache["products"]):
            if existing.get("sku") == sku:
                _cache["products"][i] = detail
                replaced = True
                break
        if not replaced:
            _cache["products"].append(detail)
        _cache["products"] = _sorted_products(_cache["products"])
    return detail


def validate_purchase_skus(session: Session, skus: list[str]) -> None:
    ensure_catalog_loaded(session)
    with _cache_lock:
        known = set(_cache["by_sku"].keys())
    for sku in skus:
        if not _is_woohoo_sku(sku):
            raise ValueError(f"SKU '{sku}' is not a Woohoo catalog product")
        if sku not in known:
            raise ValueError(f"SKU '{sku}' is not in the Woohoo catalog")
