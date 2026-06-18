import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config import Settings, get_settings
from logger import get_logger
from models import Category, OAuthToken, Subcategory
from woohoo_signature import (
    build_absolute_url,
    build_request_signature_base_string,
    canonical_request_body_string,
    compute_hmac_sha512_hex,
    is_woohoo_signature_body_absent,
)

logger = get_logger(__name__)


class WoohooAuthError(Exception):
    """OAuth authentication failed."""


class WoohooAPIError(Exception):
    """Woohoo API request failed."""


@dataclass
class HTTPDebugResponse:
    status_code: int
    headers: Dict[str, str]
    body: str

    def print_debug(self, label: str) -> None:
        print(f"\n{'=' * 60}")
        print(f"DEBUG: {label}")
        print(f"{'=' * 60}")
        print(f"Status Code: {self.status_code}")
        print("Headers:")
        for key, value in self.headers.items():
            print(f"  {key}: {value}")
        print("Body:")
        print(self.body)
        print(f"{'=' * 60}\n")


class WoohooClient:
    CATEGORIES_PATH = "/rest/v3/catalog/categories"
    SUBCATEGORIES_PATH = "/rest/v3/catalog/categories/{category_id}/subcategories"

    def __init__(
        self,
        settings: Optional[Settings] = None,
        responses_dir: Optional[Path] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.base_url = self.settings.base_url
        self.timeout = self.settings.woohoo_request_timeout
        self.max_retries = self.settings.woohoo_max_retries
        self.responses_dir = responses_dir or Path(__file__).resolve().parent / "responses"
        self.responses_dir.mkdir(parents=True, exist_ok=True)
        self._bearer_token: Optional[str] = None

    # ------------------------------------------------------------------ OAuth 2.0
    def authenticate(self, session: Session, force: bool = False) -> str:
        if not force:
            cached = self._load_token_from_db(session)
            if cached:
                self._bearer_token = cached
                logger.info("Reusing stored OAuth2 bearer token from database")
                return cached

        logger.info("Starting OAuth2 authentication (verify -> token)")
        bearer, expires_in = self._fetch_oauth2_token()
        self._save_token_to_db(session, bearer, expires_in)
        self._bearer_token = bearer
        logger.info("OAuth2 authentication completed successfully")
        return bearer

    def _fetch_oauth2_token(self) -> Tuple[str, int]:
        client_id = self.settings.woohoo_consumer_key
        client_secret = self.settings.woohoo_consumer_secret
        username = self.settings.woohoo_username
        password = self.settings.woohoo_password
        if not all([client_id, client_secret, username, password]):
            raise WoohooAuthError(
                "OAuth2 requires WOOHOO_CONSUMER_KEY, WOOHOO_CONSUMER_SECRET, "
                "WOOHOO_USERNAME, and WOOHOO_PASSWORD in .env"
            )

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",
        }
        verify_payload = {
            "clientId": client_id,
            "username": username,
            "password": password,
        }
        with httpx.Client(timeout=self.timeout) as client:
            verify_response = client.post(
                self.settings.oauth2_verify_url,
                json=verify_payload,
                headers=headers,
            )
        self._save_response("oauth2_verify", self._response_payload(verify_response))
        verify_parsed = self._parse_json(verify_response.text)
        if verify_response.status_code >= 400:
            raise WoohooAuthError(
                f"OAuth2 verify failed ({verify_response.status_code}): {verify_parsed}"
            )
        if not isinstance(verify_parsed, dict):
            raise WoohooAuthError(f"OAuth2 verify invalid response: {verify_parsed}")

        authorization_code = (
            verify_parsed.get("authorizationCode")
            or verify_parsed.get("authorization_code")
            or verify_parsed.get("code")
        )
        if not authorization_code:
            raise WoohooAuthError(f"OAuth2 verify missing authorizationCode: {verify_parsed}")

        token_payload = {
            "clientId": client_id,
            "clientSecret": client_secret,
            "authorizationCode": authorization_code,
        }
        with httpx.Client(timeout=self.timeout) as client:
            token_response = client.post(
                self.settings.oauth2_token_url,
                json=token_payload,
                headers=headers,
            )
        self._save_response("oauth2_token", self._response_payload(token_response))
        token_parsed = self._parse_json(token_response.text)
        if token_response.status_code >= 400:
            raise WoohooAuthError(
                f"OAuth2 token request failed ({token_response.status_code}): {token_parsed}"
            )
        if not isinstance(token_parsed, dict):
            raise WoohooAuthError(f"OAuth2 token invalid response: {token_parsed}")

        access_token = token_parsed.get("token") or token_parsed.get("access_token")
        if not access_token:
            raise WoohooAuthError(f"OAuth2 token missing in response: {token_parsed}")
        expires_in = int(token_parsed.get("expires_in", 3600))
        return str(access_token), max(60, expires_in)

    def _load_token_from_db(self, session: Session) -> Optional[str]:
        token_row = (
            session.query(OAuthToken)
            .filter(OAuthToken.is_active.is_(True))
            .order_by(OAuthToken.id.desc())
            .first()
        )
        if not token_row:
            return None
        if token_row.expires_at and token_row.expires_at <= datetime.now(timezone.utc):
            return None
        return token_row.access_token

    def _save_token_to_db(self, session: Session, bearer_token: str, expires_in: int = 3600) -> None:
        session.query(OAuthToken).filter(OAuthToken.is_active.is_(True)).update(
            {"is_active": False},
            synchronize_session=False,
        )
        session.add(
            OAuthToken(
                access_token=bearer_token,
                access_token_secret=None,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
                is_active=True,
            )
        )
        session.flush()

    # ------------------------------------------------------------------ Catalog
    def fetch_all_categories(self) -> List[Dict[str, Any]]:
        self._require_bearer_token()
        response = self.api_request(
            "GET",
            self.CATEGORIES_PATH,
            step_name="catalog_categories",
        )
        response.print_debug("Catalog Categories API Response")

        if response.status_code >= 400:
            raise WoohooAPIError(
                f"Catalog fetch failed with HTTP {response.status_code}: {response.body}"
            )

        payload = self._parse_json(response.body)
        self._save_response("04_catalog_categories", payload)
        return self._normalize_category_list(payload)

    def get_product(self, sku: str) -> HTTPDebugResponse:
        self._require_bearer_token()
        return self.api_request(
            "GET",
            f"/rest/v3/catalog/products/{sku}",
            step_name=f"fetch_product_{sku}",
        )

    def get_category_products(
        self,
        category_id: str,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> HTTPDebugResponse:
        self._require_bearer_token()
        return self.api_request(
            "GET",
            f"/rest/v3/catalog/categories/{category_id}/products",
            params={"offset": offset, "limit": limit},
            step_name=f"category_products_{category_id}_{offset}",
        )

    def fetch_subcategories(self, category_id: str) -> List[Dict[str, Any]]:
        path = self.SUBCATEGORIES_PATH.format(category_id=category_id)
        self._require_bearer_token()
        response = self.api_request(
            "GET",
            path,
            step_name=f"subcategories_{category_id}",
        )
        response.print_debug(f"Subcategories API Response (category={category_id})")

        if response.status_code == 404:
            logger.info("No dedicated subcategory endpoint for category %s (404)", category_id)
            return []

        if response.status_code >= 400:
            raise WoohooAPIError(
                f"Subcategory fetch failed for {category_id}: HTTP {response.status_code}: {response.body}"
            )

        payload = self._parse_json(response.body)
        self._save_response(f"05_subcategories_{category_id}", payload)
        return self._normalize_subcategory_list(payload)

    @retry(
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.TransportError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    def api_request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        step_name: str = "api",
    ) -> HTTPDebugResponse:
        """OAuth2 signed REST call: Bearer + dateAtClient + HMAC-SHA512 signature."""
        bearer = self._require_bearer_token()
        absolute_url = build_absolute_url(self.base_url, path, params)
        method_upper = method.upper()
        pretty_json = self.settings.woohoo_signature_json_pretty
        has_wire_body = method_upper == "POST" and not is_woohoo_signature_body_absent(json_body)
        canonical_body = (
            canonical_request_body_string(json_body, pretty=pretty_json) if has_wire_body else None
        )
        base_string = build_request_signature_base_string(
            method_upper,
            absolute_url,
            json_body,
            pretty_json=pretty_json,
        )
        signature = compute_hmac_sha512_hex(self.settings.woohoo_consumer_secret, base_string)
        date_at_client = datetime.now(timezone.utc).isoformat()
        sig_header = self.settings.woohoo_request_signature_header

        headers: Dict[str, str] = {
            "Authorization": f"Bearer {bearer}",
            "dateAtClient": date_at_client,
            sig_header: signature,
            "Accept": "*/*",
            "User-Agent": "Mozilla/5.0",
        }
        if canonical_body is not None:
            headers["Content-Type"] = "application/json"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(
                    method_upper,
                    absolute_url,
                    content=canonical_body,
                    headers=headers,
                )
            self._save_response(f"http_{step_name}", self._response_payload(response))
            return HTTPDebugResponse(
                status_code=response.status_code,
                headers=dict(response.headers),
                body=response.text,
            )
        except httpx.HTTPError as exc:
            logger.error("HTTP transport error during %s: %s", step_name, exc)
            raise

    def _path_from_url(self, url: str) -> str:
        if url.startswith(self.base_url):
            return url[len(self.base_url) :]
        parsed = urlparse(url)
        return parsed.path + (f"?{parsed.query}" if parsed.query else "")

    def _catalog_request(
        self,
        method: str,
        url: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        step_name: str,
        **_kwargs: Any,
    ) -> HTTPDebugResponse:
        """Backward-compatible wrapper for callers passing full URLs."""
        path = self._path_from_url(url)
        if "?" in path:
            base_path, query = path.split("?", 1)
            params = dict(pair.split("=", 1) for pair in query.split("&") if "=" in pair)
            return self.api_request(
                method,
                base_path,
                json_body=json_body,
                params=params,
                step_name=step_name,
            )
        return self.api_request(method, path, json_body=json_body, step_name=step_name)

    # ------------------------------------------------------------------ Persistence helpers
    def sync_catalog_to_db(self, session: Session) -> Dict[str, int]:
        self.authenticate(session)
        categories = self.fetch_all_categories()

        stats = {
            "categories_added": 0,
            "categories_updated": 0,
            "subcategories_added": 0,
            "subcategories_updated": 0,
        }

        for category_data in categories:
            category_id = self._extract_id(category_data, ("id", "categoryId", "category_id"))
            category_name = self._extract_name(category_data)
            if not category_id:
                logger.warning("Skipping category without id: %s", category_data)
                continue

            created, updated = self._upsert_category(session, category_id, category_name, category_data)
            stats["categories_added"] += int(created)
            stats["categories_updated"] += int(updated)

            local_category = session.query(Category).filter_by(woohoo_category_id=category_id).one()

            nested = self._extract_nested_subcategories(category_data)
            api_subcategories = self.fetch_subcategories(category_id)
            all_subcategories = self._merge_subcategory_sources(nested, api_subcategories)

            sub_stats = self._sync_subcategories_recursive(
                session=session,
                local_category_id=local_category.id,
                woohoo_category_id=category_id,
                subcategories=all_subcategories,
                parent_subcategory_id=None,
            )
            stats["subcategories_added"] += sub_stats["added"]
            stats["subcategories_updated"] += sub_stats["updated"]

        session.flush()
        return stats

    def _sync_subcategories_recursive(
        self,
        *,
        session: Session,
        local_category_id: int,
        woohoo_category_id: str,
        subcategories: List[Dict[str, Any]],
        parent_subcategory_id: Optional[int],
    ) -> Dict[str, int]:
        stats = {"added": 0, "updated": 0}

        for sub_data in subcategories:
            sub_id = self._extract_id(
                sub_data,
                ("id", "subcategoryId", "subcategory_id", "categoryId", "category_id"),
            )
            sub_name = self._extract_name(sub_data)
            if not sub_id:
                logger.warning("Skipping subcategory without id: %s", sub_data)
                continue

            created, updated, local_sub = self._upsert_subcategory(
                session=session,
                woohoo_subcategory_id=sub_id,
                local_category_id=local_category_id,
                parent_subcategory_id=parent_subcategory_id,
                name=sub_name,
                raw=sub_data,
            )
            stats["added"] += int(created)
            stats["updated"] += int(updated)

            children = self._extract_nested_subcategories(sub_data)
            if children:
                child_stats = self._sync_subcategories_recursive(
                    session=session,
                    local_category_id=local_category_id,
                    woohoo_category_id=woohoo_category_id,
                    subcategories=children,
                    parent_subcategory_id=local_sub.id,
                )
                stats["added"] += child_stats["added"]
                stats["updated"] += child_stats["updated"]
                continue

            fetched_children = self.fetch_subcategories(sub_id)
            if fetched_children:
                child_stats = self._sync_subcategories_recursive(
                    session=session,
                    local_category_id=local_category_id,
                    woohoo_category_id=woohoo_category_id,
                    subcategories=fetched_children,
                    parent_subcategory_id=local_sub.id,
                )
                stats["added"] += child_stats["added"]
                stats["updated"] += child_stats["updated"]

        return stats

    def _upsert_category(
        self,
        session: Session,
        woohoo_category_id: str,
        name: str,
        raw: Dict[str, Any],
    ) -> Tuple[bool, bool]:
        existing = session.query(Category).filter_by(woohoo_category_id=woohoo_category_id).one_or_none()
        if existing is None:
            session.add(
                Category(
                    woohoo_category_id=woohoo_category_id,
                    name=name,
                    raw_response=raw,
                )
            )
            session.flush()
            return True, False

        updated = existing.name != name or existing.raw_response != raw
        if updated:
            existing.name = name
            existing.raw_response = raw
            session.flush()
        return False, updated

    def _upsert_subcategory(
        self,
        *,
        session: Session,
        woohoo_subcategory_id: str,
        local_category_id: int,
        parent_subcategory_id: Optional[int],
        name: str,
        raw: Dict[str, Any],
    ) -> Tuple[bool, bool, Subcategory]:
        existing = (
            session.query(Subcategory)
            .filter_by(woohoo_subcategory_id=woohoo_subcategory_id)
            .one_or_none()
        )
        if existing is None:
            local_sub = Subcategory(
                woohoo_subcategory_id=woohoo_subcategory_id,
                category_id=local_category_id,
                parent_subcategory_id=parent_subcategory_id,
                name=name,
                raw_response=raw,
            )
            session.add(local_sub)
            session.flush()
            return True, False, local_sub

        updated = (
            existing.name != name
            or existing.category_id != local_category_id
            or existing.parent_subcategory_id != parent_subcategory_id
            or existing.raw_response != raw
        )
        if updated:
            existing.name = name
            existing.category_id = local_category_id
            existing.parent_subcategory_id = parent_subcategory_id
            existing.raw_response = raw
            session.flush()
        return False, updated, existing

    # ------------------------------------------------------------------ Utilities
    def _require_bearer_token(self) -> str:
        if self._bearer_token is None:
            raise WoohooAuthError("Bearer token not available. Call authenticate() first.")
        return self._bearer_token

    def _save_response(self, name: str, payload: Any) -> None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = self.responses_dir / f"{timestamp}_{name}.json"
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, default=str)
        logger.debug("Saved raw response to %s", path)

    @staticmethod
    def _response_payload(response: httpx.Response) -> Dict[str, Any]:
        return {
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "body": response.text,
        }

    @staticmethod
    def _parse_json(body: str) -> Any:
        if not body:
            return {}
        return json.loads(body)

    @staticmethod
    def _extract_id(data: Dict[str, Any], keys: Tuple[str, ...]) -> Optional[str]:
        for key in keys:
            value = data.get(key)
            if value is not None:
                return str(value)
        return None

    @staticmethod
    def _extract_name(data: Dict[str, Any]) -> str:
        for key in ("name", "categoryName", "category_name", "title", "label"):
            value = data.get(key)
            if value:
                return str(value)
        return "Unknown"

    @staticmethod
    def _normalize_category_list(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            for key in ("categories", "items", "data", "result"):
                value = payload.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
            if any(k in payload for k in ("id", "categoryId", "category_id")):
                return [payload]
        return []

    @staticmethod
    def _normalize_subcategory_list(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            for key in ("subcategories", "subCategories", "items", "data", "children"):
                value = payload.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
        return []

    @staticmethod
    def _extract_nested_subcategories(data: Dict[str, Any]) -> List[Dict[str, Any]]:
        for key in ("subcategories", "subCategories", "children", "childCategories"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    @staticmethod
    def _merge_subcategory_sources(
        nested: List[Dict[str, Any]],
        fetched: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        merged: Dict[str, Dict[str, Any]] = {}
        for item in nested + fetched:
            item_id = WoohooClient._extract_id(
                item,
                ("id", "subcategoryId", "subcategory_id", "categoryId", "category_id"),
            )
            if item_id:
                merged[item_id] = item
        return list(merged.values())
