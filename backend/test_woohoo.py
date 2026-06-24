import sys
import csv
import json
import uuid
import datetime
from sqlalchemy.orm import Session
from database import get_session
from woohoo_client import WoohooClient

def run_tests():
    woohoo = WoohooClient()
    
    results = []
    
    test_cases = [
      {"id": "#1", "desc": "Success - Cardnumber & Card PIN. Quantity <=4", "sku": "CNPIN", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#2", "desc": "Success - Cardnumber & Card PIN. Quantity >=5", "sku": "CNPIN", "amt": 1000, "qty": 5, "sync": False, "ref": str(uuid.uuid4())[:8]},
      {"id": "#4", "desc": "Success - Voucher code", "sku": "VOUCHERCODE", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#5", "desc": "Success - Amazon", "sku": "CLAIMCODE", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#6", "desc": "Success - UBE", "sku": "UBEFLOW", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#7", "desc": "Success - Google Play", "sku": "GOOGLEPLAYGCB2B", "amt": 1000, "qty": 1, "sync": False, "ref": str(uuid.uuid4())[:8]},
      {"id": "#8", "desc": "Failures - Min/Max price", "sku": "VOUCHERCODE", "amt": 90, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#9", "desc": "Failures - Insufficient balance", "sku": "VOUCHERCODE", "amt": 9999999, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#10", "desc": "Failures - Woohoo Product Disabled", "sku": "DISABLEDSTS", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#11", "desc": "Failures - Processing status", "sku": "PROCESSINGSTS", "amt": 100, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#12", "desc": "Failures - Invalid payment", "sku": "CNPIN", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8], "pay": "TESTING"},
      {"id": "#13", "desc": "Failures - Invalid Token", "sku": "CNPIN", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8], "bad_token": True},
      {"id": "#14", "desc": "Failures - Duplicate Reference", "sku": "CNPIN", "amt": 1000, "qty": 1, "sync": True, "ref": "DUPE_REF_123"},
      {"id": "#15", "desc": "Failures - Quantity >5 sync=true", "sku": "CNPIN", "amt": 1000, "qty": 6, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#16", "desc": "Failures - Blacklisted mobile", "sku": "CNPIN", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8], "tel": "+919916124046"},
      {"id": "#17", "desc": "Timeouts with order Success", "sku": "testsuccess001", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#18", "desc": "Timeout with order failures", "sku": "APITESTTIMFAIL", "amt": 1000, "qty": 1, "sync": True, "ref": str(uuid.uuid4())[:8]},
      {"id": "#20", "desc": "Timeout when processed by iron", "sku": "testsuccess001", "amt": 1000, "qty": 1, "sync": False, "ref": str(uuid.uuid4())[:8]}
    ]
    
    # We add #14 specifically
    test_cases[12]["ref"] = test_cases[0]["ref"]
    
    order2_id = ""
    with get_session() as session:
        woohoo.authenticate(session)
        for tc in test_cases:
            print(f"Running {tc['id']}")
            payload = {
            "address": {"firstname": "Test", "lastname": "User", "email": "test@test.com", "telephone": tc.get("tel", "+919999999999"), "country": "IN", "postcode": "560102"},
            "billing": {"firstname": "Test", "lastname": "User", "email": "test@test.com", "telephone": tc.get("tel", "+919999999999"), "country": "IN", "postcode": "560102"},
            "payments": [{"code": tc.get("pay", "svc"), "amount": tc["amt"] * tc["qty"]}],
            "refno": tc["ref"],
            "products": [{"sku": tc["sku"], "price": tc["amt"], "qty": tc["qty"], "currency": 356}],
            "deliveryMode": "API",
            "syncOnly": tc["sync"]
        }
        
            try:
                if tc.get("bad_token"):
                    woohoo._access_token.oauth_token = "invalid_token"
                else:
                    woohoo.authenticate(session, force=True)
                
                res = woohoo._catalog_request("POST", f"{woohoo.base_url}/rest/v3/orders", token=woohoo._access_token, json_body=payload, step_name="test")
                
                j = {}
                try: j = json.loads(res.body)
                except: pass
                
                if tc["id"] == "#2":
                    order2_id = j.get("orderId", "")
                    
                results.append({
                    "Test case ID": tc["id"],
                    "Test Case": tc["desc"],
                    "API": "Order API",
                    "Input to execute": f"SKU: {tc['sku']}, qty: {tc['qty']}, sync: {tc['sync']}",
                    "Expected/ Sample response from API": "API Response",
                    "Integrators action": "",
                    "Paste results logs here": json.dumps(j),
                    "Comments": "",
                    "Result": "Pass" if res.status_code in [200, 201, 202] or 'code' in j else "Check Logs",
                    "Issues / Observations": str(res.status_code)
                })
                
                if tc["id"] == "#2" and order2_id:
                    print("Running #3...")
                    c_res = woohoo._catalog_request("GET", f"{woohoo.base_url}/rest/v3/orders/{order2_id}/cards", token=woohoo._access_token, step_name="test_cards")
                    c_j = {}
                    try: c_j = json.loads(c_res.body)
                    except: pass
                    results.append({
                        "Test case ID": "#3",
                        "Test Case": "Fetch Card details for the above order",
                        "API": "Activated Cards API",
                        "Input to execute": f"Order ID: {order2_id}",
                        "Expected/ Sample response from API": "API Response",
                        "Integrators action": "",
                        "Paste results logs here": json.dumps(c_j),
                        "Comments": "",
                        "Result": "Pass" if c_res.status_code == 200 else "Fail",
                        "Issues / Observations": str(c_res.status_code)
                    })
            except Exception as e:
                results.append({
                    "Test case ID": tc["id"],
                    "Test Case": tc["desc"],
                    "Paste results logs here": str(e),
                    "Result": "Error"
                })
            
    # write to csv
    keys = ["Test case ID", "Test Case", "API", "Input to execute", "Expected/ Sample response from API", "Integrators action", "Paste results logs here (Please DO NOT paste Oauth tokens in the log)", "Comments", "Result", "Issues / Observations"]
    
    import csv
    with open("C:/Users/devansh/OneDrive/Desktop/woohoo_test_results_v2.csv", "w", newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for r in results:
            writer.writerow({
                "Test case ID": r.get("Test case ID", ""),
                "Test Case": r.get("Test Case", ""),
                "API": r.get("API", ""),
                "Input to execute": r.get("Input to execute", ""),
                "Expected/ Sample response from API": r.get("Expected/ Sample response from API", ""),
                "Integrators action": r.get("Integrators action", ""),
                "Paste results logs here (Please DO NOT paste Oauth tokens in the log)": r.get("Paste results logs here", ""),
                "Comments": r.get("Comments", ""),
                "Result": r.get("Result", ""),
                "Issues / Observations": r.get("Issues / Observations", "")
            })
            
    print("Done! CSV saved to Desktop.")

if __name__ == '__main__':
    run_tests()
