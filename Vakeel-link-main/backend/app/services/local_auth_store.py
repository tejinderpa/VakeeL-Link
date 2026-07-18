"""
File-backed local auth used when Supabase is unreachable (DNS / offline demos).

Users are stored in backend/data/local_users.json.
Tokens are signed with JWT_SECRET and start with "local." so the dependency
layer can verify them without calling Supabase.
"""

from __future__ import annotations

import json
import secrets
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import hashlib
import hmac

from jose import JWTError, jwt

from app.core.config import settings

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_USERS_FILE = _DATA_DIR / "local_users.json"
_TOKEN_PREFIX = "local."
_ALGORITHM = "HS256"
_TOKEN_TTL_SEC = 60 * 60 * 24 * 7  # 7 days


def is_local_token(token: str) -> bool:
    return bool(token) and token.startswith(_TOKEN_PREFIX)


def _ensure_store() -> dict[str, Any]:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _USERS_FILE.exists():
        payload = {"users": {}}
        _USERS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload
    try:
        return json.loads(_USERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"users": {}}


def _save_store(store: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _USERS_FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")


def _hash_password(password: str) -> str:
    """Lightweight hash for offline demos (not a substitute for production password hashing)."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        (password or "").encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def _verify_password(password: str, hashed: str) -> bool:
    try:
        algo, salt, digest = (hashed or "").split("$", 2)
        if algo != "pbkdf2_sha256":
            return False
        check = hashlib.pbkdf2_hmac(
            "sha256",
            (password or "").encode("utf-8"),
            salt.encode("utf-8"),
            120_000,
        ).hex()
        return hmac.compare_digest(check, digest)
    except Exception:
        return False


def signup_local(user_data: dict) -> dict:
    store = _ensure_store()
    users = store.setdefault("users", {})
    email = (user_data.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Email is required")
    if email in users:
        raise ValueError("Email already registered (local mode)")

    user_id = str(uuid.uuid4())
    role = user_data.get("role") or "client"
    full_name = user_data.get("full_name") or email.split("@")[0]
    record = {
        "id": user_id,
        "email": email,
        "password_hash": _hash_password(user_data.get("password") or secrets.token_urlsafe(12)),
        "full_name": full_name,
        "role": role,
        "phone_number": user_data.get("phone_number"),
        "avatar_url": None,
        "created_at": time.time(),
    }
    if role == "lawyer":
        record["lawyer"] = {
            "id": user_id,
            "name": full_name,
            "bar_council_id": user_data.get("bar_council_id") or "LOCAL/0000/2026",
            "experience_years": int(user_data.get("experience_years") or 5),
            "specialization": user_data.get("specialization") or "general",
            "bio": (
                "Advocate practising across civil and commercial matters. "
                "Profile created in offline mode — update details after reconnecting Supabase."
            ),
            "location": "India",
            "fee_per_consultation": 2500,
            "is_verified": True,
            "is_online": True,
            "areas_of_practice": ["Litigation", "Advisory", "Client counselling"],
            "languages": ["English", "Hindi"],
            "rating": 4.8,
        }
    users[email] = record
    _save_store(store)
    return {
        "message": "User created in offline mode (Supabase unreachable)",
        "user_id": user_id,
        "role": role,
        "full_name": full_name,
        "email": email,
        "mode": "local",
    }


def has_local_user(email: str) -> bool:
    store = _ensure_store()
    users = store.get("users") or {}
    key = (email or "").strip().lower()
    return bool(key and key in users)


def login_local(email: str, password: str) -> dict:
    store = _ensure_store()
    users = store.get("users") or {}
    key = (email or "").strip().lower()
    record = users.get(key)
    if not record or not _verify_password(password, record.get("password_hash") or ""):
        raise ValueError("Invalid email or password (offline mode)")

    token = issue_token(record["id"], record["email"], record.get("role") or "client")
    full_name = record.get("full_name") or record["email"]
    role = record.get("role") or "client"
    return {
        "access_token": token,
        "refresh_token": None,
        "token_type": "bearer",
        "role": role,
        "user_id": record["id"],
        "mode": "local",
        "user": {
            "id": record["id"],
            "email": record["email"],
            "full_name": full_name,
            "name": full_name,
            "role": role,
            "phone_number": record.get("phone_number"),
            "avatar_url": record.get("avatar_url"),
        },
    }


def issue_token(user_id: str, email: str, role: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + _TOKEN_TTL_SEC,
        "mode": "local",
    }
    raw = jwt.encode(payload, settings.JWT_SECRET or "dev-secret", algorithm=_ALGORITHM)
    return f"{_TOKEN_PREFIX}{raw}"


def verify_local_token(token: str) -> dict:
    if not is_local_token(token):
        raise ValueError("Not a local token")
    raw = token[len(_TOKEN_PREFIX) :]
    try:
        payload = jwt.decode(raw, settings.JWT_SECRET or "dev-secret", algorithms=[_ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired local token") from exc

    user_id = payload.get("sub")
    email = (payload.get("email") or "").lower()
    store = _ensure_store()
    record = (store.get("users") or {}).get(email)
    if not record or record.get("id") != user_id:
        # Still accept token claims if store was wiped mid-session
        record = {
            "id": user_id,
            "email": email,
            "full_name": email.split("@")[0] if email else "User",
            "role": payload.get("role") or "client",
        }
    return record


def get_local_user_by_id(user_id: str) -> Optional[dict]:
    store = _ensure_store()
    for record in (store.get("users") or {}).values():
        if record.get("id") == user_id:
            return record
    return None


def get_local_lawyer_profile(user_id: str) -> Optional[dict]:
    record = get_local_user_by_id(user_id)
    if not record or record.get("role") != "lawyer":
        return None
    lawyer = dict(record.get("lawyer") or {})
    lawyer.setdefault("id", user_id)
    lawyer.setdefault("name", record.get("full_name"))
    lawyer.setdefault("email", record.get("email"))
    lawyer.setdefault("phone", record.get("phone_number"))
    return lawyer


def update_local_lawyer_profile(user_id: str, updates: dict) -> dict:
    store = _ensure_store()
    users = store.get("users") or {}
    target_email = None
    for email, record in users.items():
        if record.get("id") == user_id:
            target_email = email
            break
    if not target_email:
        raise ValueError("Lawyer not found in offline store")

    record = users[target_email]
    if record.get("role") != "lawyer":
        raise ValueError("User is not a lawyer")

    lawyer = dict(record.get("lawyer") or {"id": user_id})
    allowed = {
        "name",
        "bio",
        "specialization",
        "location",
        "experience_years",
        "fee_per_consultation",
        "areas_of_practice",
        "languages",
        "is_online",
        "profile_image_url",
        "phone",
    }
    for key, value in (updates or {}).items():
        if key in allowed and value is not None:
            lawyer[key] = value

    if updates.get("name"):
        record["full_name"] = updates["name"]
    if updates.get("phone") is not None:
        record["phone_number"] = updates["phone"]
    if updates.get("email"):
        # email rename not supported offline for simplicity
        pass

    record["lawyer"] = lawyer
    users[target_email] = record
    store["users"] = users
    _save_store(store)
    return get_local_lawyer_profile(user_id) or lawyer


def list_local_lawyers() -> list[dict]:
    store = _ensure_store()
    out = []
    for record in (store.get("users") or {}).values():
        if record.get("role") == "lawyer":
            lawyer = get_local_lawyer_profile(record["id"])
            if lawyer:
                out.append(lawyer)
    return out
