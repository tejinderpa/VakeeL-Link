"""
Consultations API — client booking + lawyer accept/decline + shared listing.

Supports Supabase when available, and a file-backed local store so offline /
demo lawyer bookings still show up on GET /mine for the assigned lawyer.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.core.supabase_client import supabase
from app.services import local_auth_store, local_consultation_store

router = APIRouter()


class CreateConsultationRequest(BaseModel):
    lawyer_id: str
    domain: str = Field(..., min_length=1, max_length=120)
    client_message: Optional[str] = Field(default=None, max_length=4000)
    ai_query_id: Optional[str] = None
    mode: Optional[str] = Field(default="chat")
    # Optional display names for offline/demo path
    client_name: Optional[str] = None
    lawyer_name: Optional[str] = None


def _admin():
    return supabase.get_admin_client()


def _is_network_error(exc: Exception) -> bool:
    text = str(exc).lower()
    tokens = (
        "getaddrinfo",
        "11001",
        "name or service not known",
        "failed to resolve",
        "name resolution",
        "connection refused",
        "timed out",
        "timeout",
        "connecterror",
        "network",
    )
    return any(t in text for t in tokens)


def _profile_name(user_id: str) -> str:
    if not user_id:
        return "User"
    local = local_auth_store.get_local_user_by_id(user_id)
    if local:
        return local.get("full_name") or local.get("email") or "User"
    try:
        res = (
            _admin()
            .table("profiles")
            .select("full_name, email")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if not row:
            return "User"
        return row.get("full_name") or row.get("email") or "User"
    except Exception:
        return "User"


def _lawyer_name(lawyer_id: str) -> str:
    if not lawyer_id:
        return "Lawyer"
    local = local_auth_store.get_local_lawyer_profile(lawyer_id)
    if local and local.get("name"):
        return local["name"]
    try:
        res = (
            _admin()
            .table("lawyers")
            .select("name")
            .eq("id", lawyer_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if row and row.get("name"):
            return row["name"]
    except Exception:
        pass
    return _profile_name(lawyer_id)


def _shape(row: dict) -> dict:
    user_id = row.get("user_id")
    lawyer_id = row.get("lawyer_id")
    return {
        "id": row.get("id"),
        "status": row.get("status") or "pending",
        "domain": row.get("domain") or "general",
        "client_message": row.get("client_message") or "",
        "user_id": user_id,
        "lawyer_id": lawyer_id,
        "client_name": row.get("client_name") or _profile_name(user_id),
        "lawyer_name": row.get("lawyer_name") or _lawyer_name(lawyer_id),
        "scheduled_at": row.get("scheduled_at"),
        "mode": row.get("mode") or "chat",
        "meeting_url": row.get("meeting_url"),
        "location": row.get("location"),
        "ai_query_id": row.get("ai_query_id"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "source": row.get("source") or "supabase",
        "unread": row.get("unread"),
    }


def _get_consultation_or_404(consultation_id: str) -> dict:
    local = local_consultation_store.get_by_id(consultation_id)
    if local:
        return local
    try:
        res = (
            _admin()
            .table("consultations")
            .select("*")
            .eq("id", consultation_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]
    except Exception as exc:
        if _is_network_error(exc) and local:
            return local
        if _is_network_error(exc):
            raise HTTPException(status_code=404, detail="Consultation not found (offline)")
        raise HTTPException(status_code=500, detail=str(exc))
    raise HTTPException(status_code=404, detail="Consultation not found")


def _assert_member(row: dict, user_id: str) -> None:
    if user_id not in (row.get("user_id"), row.get("lawyer_id")):
        # Offline bookings may assign demo lawyer ids; allow lawyer role later in accept
        raise HTTPException(status_code=403, detail="Not a participant in this consultation")


def _assert_lawyer_owner(row: dict, user_id: str) -> None:
    if row.get("lawyer_id") == user_id:
        return
    # Local lawyers may act on demo-lawyer-* bookings they manage offline
    if str(row.get("lawyer_id") or "").startswith("demo-lawyer"):
        local_user = local_auth_store.get_local_user_by_id(user_id)
        if local_user and local_user.get("role") == "lawyer":
            return
    raise HTTPException(status_code=403, detail="Only the assigned lawyer can perform this action")


def _notify(user_id: str, ntype: str, title: str, body: str, metadata: Optional[dict] = None) -> None:
    if not user_id:
        return
    try:
        _admin().table("notifications").insert(
            {
                "user_id": user_id,
                "type": ntype,
                "title": title,
                "body": body,
                "is_read": False,
                "metadata": metadata or {},
            }
        ).execute()
    except Exception:
        pass


def _user_role(user_id: str) -> str:
    local = local_auth_store.get_local_user_by_id(user_id)
    if local and local.get("role"):
        return str(local["role"])
    try:
        profile_res = (
            _admin()
            .table("profiles")
            .select("role")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        return ((profile_res.data or [{}])[0] or {}).get("role") or "client"
    except Exception:
        return "client"


def _lawyer_exists(lawyer_id: str) -> tuple[bool, Optional[str]]:
    """Return (exists, name). Checks local auth lawyers first, then Supabase."""
    local = local_auth_store.get_local_lawyer_profile(lawyer_id)
    if local:
        return True, local.get("name")
    # Demo catalog ids are allowed offline even without local profile rows
    if str(lawyer_id).startswith("demo-lawyer"):
        return True, "Advocate"
    try:
        lawyer_res = (
            _admin()
            .table("lawyers")
            .select("id, name")
            .eq("id", lawyer_id)
            .limit(1)
            .execute()
        )
        if lawyer_res.data:
            return True, lawyer_res.data[0].get("name")
    except Exception as exc:
        if _is_network_error(exc):
            # Offline: accept any lawyer_id so demos keep working
            return True, "Advocate"
        raise
    return False, None


@router.get("/mine")
def get_my_consultations(current_user=Depends(get_current_user)):
    """
    Return consultations where current user is client or lawyer.
    Merges Supabase rows with local offline bookings.
    Lawyers also receive local bookings assigned to demo-lawyer-* ids (offline inbox).
    """
    uid = str(current_user.id)
    role = _user_role(uid)
    remote: list[dict] = []
    try:
        response = (
            _admin()
            .table("consultations")
            .select("*")
            .or_(f"user_id.eq.{uid},lawyer_id.eq.{uid}")
            .order("created_at", desc=True)
            .execute()
        )
        remote = response.data or []
    except Exception as exc:
        if not _is_network_error(exc):
            # still try local
            pass

    local_rows = local_consultation_store.list_for_user(uid)

    # Lawyers offline: also pull all pending local bookings (demo lawyer ids)
    if role == "lawyer":
        seen = {str(r.get("id")) for r in local_rows}
        for row in local_consultation_store.list_all():
            rid = str(row.get("id"))
            if rid in seen:
                continue
            lid = str(row.get("lawyer_id") or "")
            # Include if assigned to this lawyer OR any demo lawyer booking
            if lid == uid or lid.startswith("demo-lawyer") or row.get("source") in ("local", "client_booking"):
                local_rows.append(row)
                seen.add(rid)

    by_id: dict[str, dict] = {}
    for row in remote + local_rows:
        rid = str(row.get("id") or "")
        if not rid:
            continue
        # Prefer remote when both exist
        if rid not in by_id or row.get("source") != "local":
            by_id[rid] = row

    rows = list(by_id.values())
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return {"data": [_shape(r) for r in rows]}


@router.get("/{consultation_id}")
def get_consultation(
    consultation_id: str = Path(...),
    current_user=Depends(get_current_user),
):
    row = _get_consultation_or_404(consultation_id)
    try:
        _assert_member(row, current_user.id)
    except HTTPException:
        if _user_role(current_user.id) == "lawyer" and str(row.get("lawyer_id") or "").startswith("demo-lawyer"):
            pass
        else:
            raise
    return _shape(row)


@router.post("/", status_code=201)
def create_consultation(
    body: CreateConsultationRequest,
    current_user=Depends(get_current_user),
):
    """Client requests a consultation with a lawyer."""
    role = _user_role(current_user.id)
    if role == "lawyer":
        raise HTTPException(
            status_code=403,
            detail="Lawyers cannot request consultations as clients from this endpoint",
        )

    exists, lawyer_name = _lawyer_exists(body.lawyer_id)
    if not exists:
        # Last resort offline: still create local booking so lawyer inbox works
        lawyer_name = body.lawyer_name or "Advocate"

    if body.lawyer_id == current_user.id:
        raise HTTPException(status_code=422, detail="Cannot request a consultation with yourself")

    mode = (body.mode or "chat").strip().lower()
    if mode not in ("chat", "video", "in_person"):
        mode = "chat"

    client_name = body.client_name or _profile_name(current_user.id)
    lawyer_display = body.lawyer_name or lawyer_name or _lawyer_name(body.lawyer_id)

    payload = {
        "user_id": current_user.id,
        "lawyer_id": body.lawyer_id,
        "status": "pending",
        "domain": body.domain.strip(),
        "client_message": (body.client_message or "").strip() or None,
        "mode": mode,
    }
    if body.ai_query_id:
        payload["ai_query_id"] = body.ai_query_id

    # Prefer Supabase when reachable and lawyer is a real UUID in DB
    use_local = str(body.lawyer_id).startswith("demo-lawyer") or local_auth_store.get_local_user_by_id(
        current_user.id
    )

    if not use_local:
        try:
            response = _admin().table("consultations").insert(payload).execute()
            if response.data:
                row = response.data[0]
                _notify(
                    body.lawyer_id,
                    "consultation_request",
                    "New consultation request",
                    f"{client_name} requested a consultation ({body.domain.strip()}).",
                    {"consultation_id": row.get("id")},
                )
                return _shape(row)
        except Exception as exc:
            err = str(exc).lower()
            if "client_message" in err or "mode" in err or "column" in err:
                try:
                    minimal = {
                        "user_id": current_user.id,
                        "lawyer_id": body.lawyer_id,
                        "status": "pending",
                        "domain": body.domain.strip(),
                    }
                    response = _admin().table("consultations").insert(minimal).execute()
                    if response.data:
                        return _shape(response.data[0])
                except Exception:
                    pass
            # fall through to local
            if not _is_network_error(exc) and "duplicate" not in err:
                # still create local so the product works
                pass

    row = local_consultation_store.create(
        user_id=current_user.id,
        lawyer_id=body.lawyer_id,
        domain=body.domain.strip(),
        client_message=body.client_message,
        mode=mode,
        client_name=client_name,
        lawyer_name=lawyer_display,
    )
    return _shape(row)


@router.post("/{consultation_id}/accept")
def accept_consultation(
    consultation_id: str = Path(...),
    current_user=Depends(get_current_user),
):
    row = _get_consultation_or_404(consultation_id)
    _assert_lawyer_owner(row, current_user.id)
    if row.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Cannot accept consultation in status '{row.get('status')}'")

    # Local first
    local_updated = local_consultation_store.update_status(consultation_id, "active")
    if local_updated:
        return _shape(local_updated)

    try:
        updated = (
            _admin()
            .table("consultations")
            .update({"status": "active"})
            .eq("id", consultation_id)
            .execute()
        )
    except Exception as exc:
        # Ensure local copy exists
        fixed = local_consultation_store.update_status(consultation_id, "active")
        if fixed:
            return _shape(fixed)
        raise HTTPException(status_code=500, detail=f"Failed to accept: {exc}")

    new_row = (updated.data or [None])[0] or {**row, "status": "active"}
    _notify(
        row.get("user_id"),
        "consultation_accepted",
        "Consultation accepted",
        f"{_lawyer_name(row.get('lawyer_id'))} accepted your consultation request.",
        {"consultation_id": consultation_id},
    )
    return _shape(new_row)


@router.post("/{consultation_id}/decline")
def decline_consultation(
    consultation_id: str = Path(...),
    current_user=Depends(get_current_user),
):
    row = _get_consultation_or_404(consultation_id)
    _assert_lawyer_owner(row, current_user.id)
    if row.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Cannot decline consultation in status '{row.get('status')}'")

    local_updated = local_consultation_store.update_status(consultation_id, "cancelled")
    if local_updated:
        return _shape(local_updated)

    try:
        updated = (
            _admin()
            .table("consultations")
            .update({"status": "cancelled"})
            .eq("id", consultation_id)
            .execute()
        )
    except Exception as exc:
        fixed = local_consultation_store.update_status(consultation_id, "cancelled")
        if fixed:
            return _shape(fixed)
        raise HTTPException(status_code=500, detail=f"Failed to decline: {exc}")

    new_row = (updated.data or [None])[0] or {**row, "status": "cancelled"}
    _notify(
        row.get("user_id"),
        "consultation_accepted",
        "Consultation declined",
        f"{_lawyer_name(row.get('lawyer_id'))} declined your consultation request.",
        {"consultation_id": consultation_id, "status": "cancelled"},
    )
    return _shape(new_row)


@router.post("/{consultation_id}/complete")
def complete_consultation(
    consultation_id: str = Path(...),
    current_user=Depends(get_current_user),
):
    row = _get_consultation_or_404(consultation_id)
    try:
        _assert_member(row, current_user.id)
    except HTTPException:
        if _user_role(current_user.id) == "lawyer":
            pass
        else:
            raise
    if row.get("status") != "active":
        # Allow completing from pending in offline demos after accept race
        if row.get("status") != "pending":
            raise HTTPException(status_code=409, detail=f"Cannot complete consultation in status '{row.get('status')}'")

    local_updated = local_consultation_store.update_status(consultation_id, "completed")
    if local_updated:
        return _shape(local_updated)

    try:
        updated = (
            _admin()
            .table("consultations")
            .update({"status": "completed"})
            .eq("id", consultation_id)
            .execute()
        )
    except Exception as exc:
        fixed = local_consultation_store.update_status(consultation_id, "completed")
        if fixed:
            return _shape(fixed)
        raise HTTPException(status_code=500, detail=f"Failed to complete: {exc}")

    new_row = (updated.data or [None])[0] or {**row, "status": "completed"}
    return _shape(new_row)


@router.post("/{consultation_id}/cancel")
def cancel_consultation(
    consultation_id: str = Path(...),
    current_user=Depends(get_current_user),
):
    """Client (or member) cancels a pending/active consultation."""
    row = _get_consultation_or_404(consultation_id)
    try:
        _assert_member(row, current_user.id)
    except HTTPException:
        raise
    if row.get("status") not in ("pending", "active"):
        raise HTTPException(status_code=409, detail=f"Cannot cancel consultation in status '{row.get('status')}'")

    local_updated = local_consultation_store.update_status(consultation_id, "cancelled")
    if local_updated:
        return _shape(local_updated)

    try:
        updated = (
            _admin()
            .table("consultations")
            .update({"status": "cancelled"})
            .eq("id", consultation_id)
            .execute()
        )
    except Exception as exc:
        fixed = local_consultation_store.update_status(consultation_id, "cancelled")
        if fixed:
            return _shape(fixed)
        raise HTTPException(status_code=500, detail=f"Failed to cancel: {exc}")

    new_row = (updated.data or [None])[0] or {**row, "status": "cancelled"}
    return _shape(new_row)
