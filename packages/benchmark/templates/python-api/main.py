from fastapi import FastAPI
from datetime import datetime

app = FastAPI(title="Benchmark API")


@app.get("/health")
def health():
    return {"ok": True, "service": "python-api"}


@app.get("/api/items")
def list_items():
    return {"items": [], "count": 0}


@app.post("/api/items")
def create_item(name: str):
    return {"id": "1", "name": name, "created_at": datetime.now().isoformat()}
