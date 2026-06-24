import sys
import json
import uuid
import time
from sqlalchemy.orm import Session
from database import get_session
from woohoo_client import WoohooClient

def run_test_19():
    woohoo = WoohooClient()
    with get_session() as session:
        woohoo.authenticate(session)
        
        # Test 19: Timeouts and no order created
        ref = str(uuid.uuid4())[:8]
        payload = {
            "address": {"firstname": "Test", "lastname": "User", "email": "test@test.com", "telephone": "+919999999999", "country": "IN", "postcode": "560102"},
            "billing": {"firstname": "Test", "lastname": "User", "email": "test@test.com", "telephone": "+919999999999", "country": "IN", "postcode": "560102"},
            "payments": [{"code": "svc", "amount": 1000}],
            "refno": ref,
            "products": [{"sku": "APITESTTIMFAIL", "price": 1000, "qty": 1, "currency": 356}],
            "deliveryMode": "API",
            "syncOnly": True
        }
        
        print("Making Order API call...")
        res = woohoo._catalog_request("POST", f"{woohoo.base_url}/rest/v3/orders", token=woohoo._access_token, json_body=payload, step_name="test19")
        print("Order Status Code:", res.status_code)
        print("Order Body:", res.body)
        
        print("Waiting 45 seconds...")
        time.sleep(45)
        
        print(f"Making Status API call for ref {ref}...")
        status_res = woohoo._catalog_request("GET", f"{woohoo.base_url}/rest/v3/orders/{ref}/status", token=woohoo._access_token, step_name="test19_status")
        print("Status API Status Code:", status_res.status_code)
        print("Status API Body:", status_res.body)
        
if __name__ == '__main__':
    run_test_19()
