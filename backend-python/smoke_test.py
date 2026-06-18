"""Quick smoke test for giftcred backend."""

import json
import sys

import httpx
from sqlalchemy import text

from config import get_settings
from database import get_session, init_db
from woohoo_client import WoohooClient

API_BASE = "http://127.0.0.1:8000"
FRONTEND_URLS = ["http://127.0.0.1:5174/", "http://127.0.0.1:5173/"]


def main() -> int:
    results: list[tuple[str, str, str]] = []

    def ok(name: str, detail: str = "") -> None:
        results.append(("PASS", name, detail))
        print(f"PASS  {name}" + (f" - {detail}" if detail else ""))

    def fail(name: str, detail: str = "") -> None:
        results.append(("FAIL", name, detail))
        print(f"FAIL  {name}" + (f" - {detail}" if detail else ""))

    # Frontend
    frontend_up = False
    for url in FRONTEND_URLS:
        try:
            r = httpx.get(url, timeout=10)
            if r.status_code == 200:
                ok("Frontend", url)
                frontend_up = True
                break
        except httpx.HTTPError:
            continue
    if not frontend_up:
        fail("Frontend", "not reachable on 5173 or 5174")

    # Backend docs
    try:
        r = httpx.get(f"{API_BASE}/docs", timeout=10)
        if r.status_code == 200:
            ok("Backend", API_BASE)
        else:
            fail("Backend", f"HTTP {r.status_code}")
    except httpx.HTTPError as exc:
        fail("Backend", str(exc))
        print("\nSummary: backend down — aborting remaining checks")
        return 1

    # Config
    try:
        get_settings.cache_clear()
        settings = get_settings()
        required = {
            "WOOHOO_CONSUMER_KEY": settings.woohoo_consumer_key,
            "WOOHOO_CONSUMER_SECRET": settings.woohoo_consumer_secret,
            "WOOHOO_USERNAME": settings.woohoo_username,
            "WOOHOO_PASSWORD": settings.woohoo_password,
            "DATABASE_URL": settings.database_url,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            fail("Config", f"missing: {missing}")
        else:
            ok("Config", f"auth_mode=oauth2, timeout={settings.woohoo_request_timeout}s")
    except Exception as exc:
        fail("Config", str(exc))

    # Database
    sku: str | None = None
    try:
        init_db()
        with get_session() as session:
            session.execute(text("SELECT 1")).scalar()
            order_count = session.execute(text("SELECT COUNT(*) FROM orders")).scalar()
        ok("Database", f"connected, {order_count} orders")
    except Exception as exc:
        fail("Database", str(exc))

    # Local REST API - catalog (Woohoo)
    try:
        r = httpx.get(f"{API_BASE}/api/catalog", timeout=180)
        if r.status_code == 200:
            products = r.json()
            ok("GET /api/catalog", f"{len(products)} Woohoo products")
            if products:
                sku = products[0].get("sku")
                if sku and (":" in sku or sku.lower().startswith("valuedesign")):
                    fail("Catalog SKUs", "valuedesign SKUs still present")
                else:
                    ok("Catalog SKUs", f"Woohoo SKU sample: {sku}")
        else:
            fail("GET /api/catalog", f"HTTP {r.status_code}")
    except Exception as exc:
        fail("GET /api/catalog", str(exc))

    # OAuth2 + Woohoo signed API
    client = WoohooClient()
    try:
        with get_session() as session:
            token = client.authenticate(session, force=True)
        ok("OAuth2", f"bearer token ({len(token)} chars)")
    except Exception as exc:
        fail("OAuth2", str(exc))
        token = None

    if token:
        try:
            resp = client.api_request("GET", "/rest/v3/catalog/categories", step_name="smoke")
            if resp.status_code == 200:
                payload = json.loads(resp.body)
                label = payload.get("name", "ok") if isinstance(payload, dict) else "ok"
                ok("Woohoo signed API", f"categories HTTP 200 ({label})")
            else:
                fail("Woohoo signed API", f"HTTP {resp.status_code}")
        except Exception as exc:
            fail("Woohoo signed API", str(exc))

    if sku:
        try:
            r = httpx.get(f"{API_BASE}/api/catalog/{sku}", timeout=60)
            if r.status_code == 200:
                ok("GET /api/catalog/{sku}", f"{sku}")
            else:
                fail("GET /api/catalog/{sku}", f"HTTP {r.status_code}")
        except Exception as exc:
            fail("GET /api/catalog/{sku}", str(exc))
    else:
        fail("GET /api/catalog/{sku}", "no sku in database")

    try:
        r = httpx.get(f"{API_BASE}/api/orders", timeout=120)
        if r.status_code == 200:
            ok("GET /api/orders", f"{len(r.json())} orders")
        else:
            fail("GET /api/orders", f"HTTP {r.status_code}: {r.text[:120]}")
    except Exception as exc:
        fail("GET /api/orders", str(exc))

    if sku:
        try:
            r = httpx.post(
                f"{API_BASE}/api/purchase",
                json={
                    "items": [{"sku": sku, "amount": 100, "quantity": 1}],
                    "mobileNumber": "9876543210",
                    "email": "smoke.test@giftcred.in",
                },
                timeout=120,
            )
            if r.status_code == 200:
                data = r.json()
                ok("POST /api/purchase", f"order {data.get('orderId')}")
            else:
                fail("POST /api/purchase", f"HTTP {r.status_code}: {r.text[:150]}")
        except Exception as exc:
            fail("POST /api/purchase", str(exc))

    passed = sum(1 for s, _, _ in results if s == "PASS")
    failed = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"\nSummary: {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
