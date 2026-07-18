"""
chat.py — AI chat sessions (REST) + lawyer↔client real-time WebSocket
======================================================================

REST routes (prefix: /api/v1/chat)
-----------------------------------
  POST /           – submit a legal query to the RAG pipeline
  GET  /sessions   – list all AI chat sessions for the current user
  GET  /sessions/{session_id} – full message history for one session
  GET  /consultations/{consultation_id}/messages – consultation thread history
  POST /consultations/{consultation_id}/messages – send (also WS-broadcasts)

WebSocket route
---------------
  WS /ws/{consultation_id}
  → ws://host/api/v1/chat/ws/{consultation_id}?token=<jwt|local.*>

Free offline path: file-backed local_chat_messages.json + in-memory WS registry.
No Redis / paid realtime required for single-process demos.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.core.supabase_client import supabase
from app.services import local_auth_store, local_consultation_store
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter()
chat_service = ChatService()

_LOCAL_CHAT_FILE = Path(__file__).resolve().parents[3] / "data" / "local_chat_messages.json"


# ──────────────────────────────────────────────────────────────────────────────
# Local message store (free, file-backed)
# ──────────────────────────────────────────────────────────────────────────────

def _load_local_chat() -> dict:
    try:
        if _LOCAL_CHAT_FILE.exists():
            return json.loads(_LOCAL_CHAT_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_local_chat(store: dict) -> None:
    try:
        _LOCAL_CHAT_FILE.parent.mkdir(parents=True, exist_ok=True)
        _LOCAL_CHAT_FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("Could not persist local chat: %s", exc)


def _local_history(consultation_id: str, limit: int = 80) -> list[dict]:
    store = _load_local_chat()
    rows = store.get(str(consultation_id)) or []
    return list(rows)[-limit:]


def _local_save_message(
    consultation_id: str,
    sender_id: str,
    message: str,
    *,
    client_msg_id: Optional[str] = None,
) -> dict:
    store = _load_local_chat()
    key = str(consultation_id)
    rows = store.setdefault(key, [])

    # Idempotent: same client_msg_id already saved → return existing
    if client_msg_id:
        for existing in rows:
            if existing.get("client_msg_id") == client_msg_id:
                return existing

    row = {
        "id": str(uuid.uuid4()),
        "consultation_id": key,
        "sender_id": str(sender_id),
        "message": message.strip(),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "client_msg_id": client_msg_id,
        "type": "message",
    }
    rows.append(row)
    store[key] = rows[-200:]
    _save_local_chat(store)
    return row


# ──────────────────────────────────────────────────────────────────────────────
# In-memory WebSocket registry (single process — free, no Redis)
# ──────────────────────────────────────────────────────────────────────────────

class _RoomRegistry:
    def __init__(self):
        self._rooms: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, ws: WebSocket, consultation_id: str) -> None:
        await ws.accept()
        cid = str(consultation_id)
        self._rooms[cid].append(ws)
        logger.info(
            "WS connected  consultation=%s  total=%d",
            cid,
            len(self._rooms[cid]),
        )

    def disconnect(self, ws: WebSocket, consultation_id: str) -> None:
        cid = str(consultation_id)
        room = self._rooms.get(cid, [])
        if ws in room:
            room.remove(ws)
        if not room:
            self._rooms.pop(cid, None)
        logger.info("WS disconnect consultation=%s remaining=%d", cid, len(room))

    async def broadcast(self, consultation_id: str, payload: dict) -> None:
        cid = str(consultation_id)
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(cid, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, cid)


registry = _RoomRegistry()


# ──────────────────────────────────────────────────────────────────────────────
# Auth / membership helpers
# ──────────────────────────────────────────────────────────────────────────────

def _user_from_token(token: str):
    """Return (user_like, local_mode) or raise ValueError."""
    if not token:
        raise ValueError("Missing token")
    if local_auth_store.is_local_token(token):
        record = local_auth_store.verify_local_token(token)
        user = SimpleNamespace(
            id=record.get("id"),
            email=record.get("email"),
            role=record.get("role"),
        )
        return user, True
    sb = supabase.get_client()
    user_resp = sb.auth.get_user(token)
    if not user_resp or not user_resp.user:
        raise ValueError("Invalid user")
    return user_resp.user, False


def _is_prefixed_local_room(consultation_id: str) -> bool:
    cid = str(consultation_id or "")
    return (
        cid.startswith("consult_")
        or cid.startswith("demo-consult")
        or cid.startswith("demo_")
        or cid.startswith("booking_")
    )


def _local_consultation(consultation_id: str) -> Optional[dict]:
    return local_consultation_store.get_by_id(str(consultation_id or ""))


def _assert_consultation_member(user_id: str, consultation_id: str) -> None:
    """Raise PermissionError if user is not client/lawyer on the consultation."""
    uid = str(user_id)
    cid = str(consultation_id)

    local = _local_consultation(cid)
    if local:
        if uid in (str(local.get("user_id") or ""), str(local.get("lawyer_id") or "")):
            return
        # Demo lawyer rows may use demo-lawyer-* ids while signed-in lawyer has real id
        lawyer_id = str(local.get("lawyer_id") or "")
        if lawyer_id.startswith("demo-lawyer"):
            lu = local_auth_store.get_local_user_by_id(uid)
            if lu and lu.get("role") == "lawyer":
                return
        raise PermissionError("Not a consultation member")

    if _is_prefixed_local_room(cid):
        # Local-only demo room without a row — allow any authenticated user
        return

    client = supabase.get_admin_client()
    response = (
        client.table("consultations")
        .select("user_id, lawyer_id")
        .eq("id", cid)
        .execute()
    )
    if not response.data:
        # No remote row either — treat as free-form local room
        return
    consultation = response.data[0]
    if uid not in (str(consultation.get("user_id") or ""), str(consultation.get("lawyer_id") or "")):
        raise PermissionError("Not a consultation member")


def _prefer_local_store(consultation_id: str, local_mode: bool) -> bool:
    if local_mode:
        return True
    if _is_prefixed_local_room(consultation_id):
        return True
    if _local_consultation(consultation_id):
        return True
    return False


def _fetch_remote_history(consultation_id: str, limit: int = 80) -> list[dict]:
    client = supabase.get_admin_client()
    response = (
        client.table("chat_messages")
        .select("id, consultation_id, sender_id, message, created_at")
        .eq("consultation_id", consultation_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(response.data or []))


def _save_remote_message(consultation_id: str, sender_id: str, message: str) -> dict:
    client = supabase.get_admin_client()
    payload = {
        "consultation_id": consultation_id,
        "sender_id": sender_id,
        "message": message.strip(),
    }
    response = client.table("chat_messages").insert(payload).execute()
    if not response.data:
        raise RuntimeError("Failed to persist message")
    return response.data[0]


def _history_for(consultation_id: str, *, prefer_local: bool) -> list[dict]:
    local_rows = _local_history(consultation_id, limit=80)
    if prefer_local:
        if local_rows:
            return local_rows
        try:
            return _fetch_remote_history(consultation_id, limit=80)
        except Exception:
            return local_rows
    try:
        remote = _fetch_remote_history(consultation_id, limit=80)
        if remote:
            return remote
    except Exception as exc:
        logger.warning("Remote history failed consultation=%s: %s", consultation_id, exc)
    return local_rows


def _persist_message(
    consultation_id: str,
    sender_id: str,
    message_text: str,
    *,
    prefer_local: bool,
    client_msg_id: Optional[str] = None,
) -> dict:
    saved = None
    if not prefer_local:
        try:
            saved = _save_remote_message(consultation_id, sender_id, message_text)
        except Exception as exc:
            logger.error("DB insert failed consultation=%s: %s", consultation_id, exc)
            saved = None
    if saved is None:
        saved = _local_save_message(
            consultation_id,
            sender_id,
            message_text,
            client_msg_id=client_msg_id,
        )
    payload = {
        "type": "message",
        "id": saved.get("id"),
        "consultation_id": saved.get("consultation_id") or consultation_id,
        "sender_id": saved.get("sender_id"),
        "message": saved.get("message"),
        "created_at": saved.get("created_at"),
        "client_msg_id": client_msg_id or saved.get("client_msg_id"),
    }
    return payload


# ──────────────────────────────────────────────────────────────────────────────
# AI chat REST (unchanged behaviour)
# ──────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    session_id: str | None = None


class ConsultationSendRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    client_msg_id: Optional[str] = None


@router.post("/", summary="Submit a legal query to the RAG pipeline")
def submit_rag_query(request: ChatRequest, user=Depends(get_current_user)):
    return chat_service.process_query(
        user_id=user.id,
        query=request.query,
        session_id=request.session_id,
    )


@router.get("/sessions", summary="List all AI chat sessions for the current user")
def get_sessions(user=Depends(get_current_user)):
    return chat_service.get_user_sessions(user_id=user.id)


@router.get("/sessions/{session_id}", summary="Get full message history for a session")
def get_session_history(session_id: str, user=Depends(get_current_user)):
    return chat_service.get_session_messages(session_id=session_id, user_id=user.id)


# ──────────────────────────────────────────────────────────────────────────────
# Consultation chat REST (fallback when WebSocket is down)
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/consultations/{consultation_id}/messages",
    summary="Fetch consultation chat history",
)
def get_consultation_messages(
    consultation_id: str = PathParam(...),
    user=Depends(get_current_user),
):
    is_local_user = bool(local_auth_store.get_local_user_by_id(str(user.id)))
    prefer_local = _prefer_local_store(consultation_id, is_local_user)

    try:
        _assert_consultation_member(str(user.id), consultation_id)
    except PermissionError as exc:
        # Offline demos: still allow history if room is local-backed
        if not prefer_local:
            raise HTTPException(status_code=403, detail=str(exc))

    messages = _history_for(consultation_id, prefer_local=prefer_local)
    return {
        "consultation_id": consultation_id,
        "messages": messages,
        "count": len(messages),
    }


@router.post(
    "/consultations/{consultation_id}/messages",
    summary="Send consultation message (persists + WS broadcast)",
    status_code=201,
)
async def post_consultation_message(
    body: ConsultationSendRequest,
    consultation_id: str = PathParam(...),
    user=Depends(get_current_user),
):
    is_local_user = bool(local_auth_store.get_local_user_by_id(str(user.id)))
    prefer_local = _prefer_local_store(consultation_id, is_local_user)

    try:
        _assert_consultation_member(str(user.id), consultation_id)
    except PermissionError as exc:
        if not prefer_local:
            raise HTTPException(status_code=403, detail=str(exc))

    text = (body.message or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    payload = _persist_message(
        consultation_id,
        str(user.id),
        text,
        prefer_local=prefer_local,
        client_msg_id=body.client_msg_id,
    )
    await registry.broadcast(consultation_id, payload)
    return payload


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/{consultation_id}")
async def ws_chat(
    websocket: WebSocket,
    consultation_id: str,
    token: Optional[str] = Query(
        None,
        alias="token",
        description="JWT or local.* offline token",
    ),
):
    """
    Real-time lawyer ↔ client chat.

    Protocol
    --------
    Client → server:
      {"message": "hello", "client_msg_id": "optional-idempotency-key"}
      {"ping": true}

    Server → client:
      {"type":"history","messages":[...]}
      {"type":"message","id":...,"sender_id":...,"message":...,"client_msg_id":...}
      {"pong": true}
      {"type":"error","detail":"..."}
    """
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    try:
        current_user, local_mode = _user_from_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    prefer_local = _prefer_local_store(consultation_id, local_mode)

    try:
        _assert_consultation_member(str(current_user.id), consultation_id)
    except PermissionError:
        # Local users + local rooms: still allow chat so demos keep working
        if prefer_local:
            logger.warning(
                "Membership soft-allow consultation=%s user=%s",
                consultation_id,
                current_user.id,
            )
        else:
            await websocket.close(code=4003, reason="Not a participant in this consultation")
            return
    except Exception as exc:
        logger.warning("Membership check failed, local chat: %s", exc)
        prefer_local = True

    await registry.connect(websocket, consultation_id)

    try:
        history = _history_for(consultation_id, prefer_local=prefer_local)
        await websocket.send_json({"type": "history", "messages": history})
    except Exception as exc:
        logger.warning("Failed to send history consultation=%s: %s", consultation_id, exc)
        await websocket.send_json(
            {"type": "history", "messages": _local_history(consultation_id)}
        )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON frame"})
                continue

            if data.get("ping"):
                await websocket.send_json({"pong": True})
                continue

            message_text = (data.get("message") or "").strip()
            client_msg_id = data.get("client_msg_id") or data.get("client_id")
            if not message_text:
                await websocket.send_json({"type": "error", "detail": "Empty message"})
                continue

            payload = _persist_message(
                consultation_id,
                str(current_user.id),
                message_text,
                prefer_local=prefer_local,
                client_msg_id=client_msg_id,
            )
            await registry.broadcast(consultation_id, payload)

    except WebSocketDisconnect:
        registry.disconnect(websocket, consultation_id)
        logger.info(
            "WS clean disconnect consultation=%s user=%s",
            consultation_id,
            current_user.id,
        )
    except Exception as exc:
        logger.error("WS unexpected error consultation=%s: %s", consultation_id, exc)
        registry.disconnect(websocket, consultation_id)
