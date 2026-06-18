import json
import uuid
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from catalog_service import get_catalog_product, get_catalog_products, validate_purchase_skus
from database import init_db, get_session
from models import Order
from order_service import order_to_dict, refresh_order_cards
from woohoo_client import WoohooClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


class CartItem(BaseModel):
    sku: str
    amount: int
    quantity: int


class PurchaseRequest(BaseModel):
    items: List[CartItem]
    mobileNumber: str
    email: str
    message: str = ""


@app.get("/api/catalog")
def get_catalog():
    try:
        with get_session() as session:
            return get_catalog_products(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/catalog/{sku}")
def get_product(sku: str):
    try:
        with get_session() as session:
            product = get_catalog_product(session, sku)
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
            return product
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/purchase")
def place_order(req: PurchaseRequest):
    client = WoohooClient()
    refno = f"ORDER-{uuid.uuid4().hex[:12].upper()}"

    formatted_mobile = req.mobileNumber
    if len(formatted_mobile) == 10 and formatted_mobile.isdigit():
        formatted_mobile = f"+91{formatted_mobile}"

    order_payload = {
        "address": {
            "firstname": "Giftcred",
            "lastname": "User",
            "email": req.email,
            "telephone": formatted_mobile,
            "country": "IN",
            "postcode": "560102",
        },
        "billing": {
            "firstname": "Giftcred",
            "lastname": "User",
            "email": req.email,
            "telephone": formatted_mobile,
            "country": "IN",
            "postcode": "560102",
        },
        "payments": [{"code": "svc", "amount": sum(item.amount * item.quantity for item in req.items)}],
        "refno": refno,
        "products": [
            {
                "sku": item.sku,
                "price": item.amount,
                "qty": item.quantity,
                "currency": "356",
                "deliveryMode": "API",
            }
            for item in req.items
        ],
        "deliveryMode": "API",
        "syncOnly": True,
    }

    with get_session() as session:
        try:
            validate_purchase_skus(session, [item.sku for item in req.items])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        client.authenticate(session)
        response = client.api_request(
            "POST",
            "/rest/v3/orders",
            json_body=order_payload,
            step_name="place_order",
        )

        if response.status_code not in [200, 201, 202]:
            raise HTTPException(status_code=response.status_code, detail=f"Order failed: {response.body}")

        data = json.loads(response.body)
        cards = []
        if "cards" in data:
            for card in data["cards"]:
                cards.append(
                    {
                        "cardNumber": card.get("cardNumber", "N/A"),
                        "cardPin": card.get("cardPin", "N/A"),
                        "activationCode": card.get("activationCode", "N/A"),
                        "activationUrl": card.get("activationUrl", ""),
                        "amount": card.get("amount"),
                        "validity": card.get("validity"),
                    }
                )

        order_id = data.get("orderId")
        response_refno = data.get("refno")
        if order_id and response_refno:
            items_dict = [
                {"sku": item.sku, "amount": item.amount, "quantity": item.quantity} for item in req.items
            ]
            status = "COMPLETED" if cards else "PROCESSING"
            session.add(
                Order(
                    order_id=order_id,
                    refno=response_refno,
                    items=items_dict,
                    mobile_number=req.mobileNumber,
                    email=req.email,
                    status=status,
                    cards=cards or None,
                )
            )
            session.commit()

        return {"success": True, "orderId": order_id, "refno": response_refno, "cards": cards}


@app.get("/api/orders")
def get_orders():
    """Return orders from the local DB — no live Woohoo call per row."""
    try:
        with get_session() as session:
            db_orders = session.query(Order).order_by(Order.id.desc()).all()
            return [order_to_dict(order) for order in db_orders]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/orders/{order_id}/refresh")
def refresh_order(order_id: str):
    """Fetch card details for a single order from Woohoo and cache them."""
    client = WoohooClient()
    try:
        with get_session() as session:
            order = session.query(Order).filter(Order.order_id == order_id).one_or_none()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            client.authenticate(session)
            refresh_order_cards(session, client, order)
            return order_to_dict(order)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
