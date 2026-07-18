from fastapi import APIRouter, Depends, Query, HTTPException, Path
from typing import Optional, Any
import logging

from app.core.supabase_client import supabase
from app.api.dependencies import get_current_user

router = APIRouter()
logger = logging.getLogger("vakeellink.cases")

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

SUMMARY_FIELDS = "id, query, domain, created_at"
FULL_FIELDS = "id, query, domain, created_at, answer"
QUERY_TRUNCATE = 150


def _shape_record(record: dict, expand: bool) -> dict:
    """
    Return a consistently-shaped record.
    - query is always truncated to QUERY_TRUNCATE chars in listing mode.
    - answer (full jsonb) is only included when expand=True.
    """
    out: dict[str, Any] = {
        "id": record["id"],
        "query": (record.get("query") or "")[:QUERY_TRUNCATE],
        "domain": record.get("domain"),
        "created_at": record.get("created_at"),
    }
    if expand:
        out["answer"] = record.get("answer")
    return out


def _db_client():
    """
    Prefer service-role client so broken RLS on profiles (infinite recursion
    in admin policies) cannot 500 the whole dashboard history panel.
    Still filter by authenticated user_id in every query.
    """
    try:
        return supabase.get_admin_client()
    except Exception:
        return supabase.get_client()


def _empty_page(page: int, limit: int) -> dict:
    return {
        "data": [],
        "total_count": 0,
        "page": page,
        "limit": limit,
        "has_more": False,
    }


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@router.get("/", summary="List query history for the current user")
def get_cases(
    q: Optional[str] = Query(None, description="Keyword search on the query text field"),
    expand: bool = Query(False, description="Include full answer+citations in each record"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Records per page"),
    user=Depends(get_current_user),
):
    """
    Returns the authenticated user's RAG query history, sorted newest-first.

    On Supabase / RLS failures returns an empty page (200) so the frontend
    dashboard stays usable instead of showing a hard error.
    """
    select_fields = FULL_FIELDS if expand else SUMMARY_FIELDS
    offset = (page - 1) * limit

    try:
        client = _db_client()
        db_query = (
            client.table("query_history")
            .select(select_fields, count="exact")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
        )

        if q and q.strip():
            db_query = db_query.ilike("query", f"%{q.strip()}%")

        db_query = db_query.range(offset, offset + limit - 1)
        response = db_query.execute()
    except Exception as e:
        # Common on free/broken RLS: infinite recursion in profiles policies (42P17)
        logger.warning("get_cases degraded to empty list: %s", e)
        return _empty_page(page, limit)

    records = [_shape_record(r, expand) for r in (response.data or [])]
    total = response.count if hasattr(response, "count") and response.count is not None else len(records)

    return {
        "data": records,
        "total_count": total,
        "page": page,
        "limit": limit,
        "has_more": (offset + limit) < total,
    }


@router.get("/{case_id}", summary="Get a single query history record with full answer")
def get_case(
    case_id: str = Path(..., description="UUID of the query_history record"),
    user=Depends(get_current_user),
):
    """
    Fetches a single record from `query_history` by its UUID.
    Always returns the full `answer` JSONB (including citations).
    Enforces ownership — a user can only read their own records.
    """
    try:
        client = _db_client()
        response = (
            client.table("query_history")
            .select(FULL_FIELDS)
            .eq("id", case_id)
            .eq("user_id", user.id)  # ownership guard
            .single()
            .execute()
        )
    except Exception:
        # PostgREST raises when .single() finds 0 rows, or on RLS/network errors
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    if not response.data:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    return _shape_record(response.data, expand=True)
