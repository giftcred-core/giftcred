"""Order helpers — cache card data locally instead of live-fetching every order."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from models import Order
from woohoo_client import WoohooClient


def _status_from_response(status_code: int) -> str:
    if status_code == 409:
        return "PROCESSING"
    if status_code == 200:
        return "COMPLETED"
    return "FAILED"


def order_to_dict(order: Order) -> dict[str, Any]:
    return {
        "orderId": order.order_id,
        "refno": order.refno,
        "items": order.items or [],
        "mobileNumber": order.mobile_number,
        "email": order.email,
        "createdAt": order.created_at.isoformat(),
        "status": order.status or "PROCESSING",
        "cards": order.cards or [],
    }


def refresh_order_cards(session: Session, client: WoohooClient, order: Order) -> Order:
    response = client.api_request(
        "GET",
        f"/rest/v3/order/{order.order_id}/cards/",
        params={"offset": 0, "limit": 100},
        step_name=f"fetch_order_{order.order_id}",
    )
    cards_data: list[dict[str, Any]] = []
    if response.status_code == 200:
        api_data = json.loads(response.body)
        cards_data = api_data.get("cards", [])
    order.status = _status_from_response(response.status_code)
    order.cards = cards_data
    session.flush()
    return order
