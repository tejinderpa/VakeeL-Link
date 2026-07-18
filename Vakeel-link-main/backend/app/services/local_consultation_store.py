"""
File-backed consultations for offline / local-auth demos.

Stored in backend/data/local_consultations.json so client bookings created
while Supabase is down (or for demo lawyer ids) still appear on the lawyer
side via GET /consultations/mine.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_FILE = _DATA_DIR / "local_consultations.json"


def _load() -> dict[str, Any]:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _FILE.exists():
        payload = {"consultations": []}
        _FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload
    try:
        return json.loads(_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"consultations": []}


def _save(store: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")


def list_for_user(user_id: str) -> list[dict]:
    """Rows where user is client or assigned lawyer."""
    uid = str(user_id or "")
    out = []
    for row in _load().get("consultations") or []:
        if str(row.get("user_id") or "") == uid or str(row.get("lawyer_id") or "") == uid:
            out.append(dict(row))
    # Newest first
    out.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return out


def list_all() -> list[dict]:
    rows = [dict(r) for r in (_load().get("consultations") or [])]
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return rows


def get_by_id(consultation_id: str) -> Optional[dict]:
    cid = str(consultation_id or "")
    for row in _load().get("consultations") or []:
        if str(row.get("id")) == cid:
            return dict(row)
    return None


def create(
    *,
    user_id: str,
    lawyer_id: str,
    domain: str,
    client_message: Optional[str] = None,
    mode: str = "chat",
    client_name: Optional[str] = None,
    lawyer_name: Optional[str] = None,
    consultation_id: Optional[str] = None,
) -> dict:
    store = _load()
    rows = store.setdefault("consultations", [])
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    row = {
        "id": consultation_id or str(uuid.uuid4()),
        "user_id": str(user_id),
        "lawyer_id": str(lawyer_id),
        "status": "pending",
        "domain": (domain or "general").strip(),
        "client_message": (client_message or "").strip() or None,
        "mode": mode or "chat",
        "client_name": client_name or "Client",
        "lawyer_name": lawyer_name or "Lawyer",
        "created_at": now,
        "updated_at": now,
        "scheduled_at": None,
        "meeting_url": None,
        "location": None,
        "source": "local",
    }
    rows.insert(0, row)
    store["consultations"] = rows[:300]
    _save(store)
    return dict(row)


def update_status(consultation_id: str, status: str) -> Optional[dict]:
    store = _load()
    rows = store.get("consultations") or []
    cid = str(consultation_id)
    for i, row in enumerate(rows):
        if str(row.get("id")) == cid:
            rows[i] = {
                **row,
                "status": status,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            store["consultations"] = rows
            _save(store)
            return dict(rows[i])
    return None
