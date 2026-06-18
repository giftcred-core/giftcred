# Python backend (reference only)

This is the **original FastAPI implementation**, kept for reference. It is **not used in production**.

The live API is the Express server in [`/api`](../api/) at the repository root, deployed on Vercel.

To run this locally for comparison:

```bash
cd backend-python
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
