from fastapi import APIRouter, Depends, Query, HTTPException, Path
from typing import Optional, Any, List
from pydantic import BaseModel, Field

from app.core.supabase_client import supabase
from app.api.dependencies import get_current_user
from app.services import local_auth_store

router = APIRouter()


class LawyerProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    specialization: Optional[str] = None
    location: Optional[str] = None
    experience_years: Optional[int] = Field(default=None, ge=0, le=60)
    fee_per_consultation: Optional[int] = Field(default=None, ge=0)
    areas_of_practice: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    is_online: Optional[bool] = None
    phone: Optional[str] = None
    profile_image_url: Optional[str] = None


DOMAIN_ALIASES = {
    "criminal law": "criminal",
    "criminal": "criminal",
    "labour law": "labour",
    "labor law": "labour",
    "labour": "labour",
    "family law": "family",
    "family": "family",
    "property law": "property",
    "property": "property",
    "consumer law": "consumer",
    "consumer": "consumer",
    "constitutional law": "constitutional",
    "constitutional": "constitutional",
}

@router.get("/")
def get_lawyers(
    domain: Optional[str] = Query(None, description="Filter by RAG domain / specialization"),
    location: Optional[str] = Query(None, description="Filter by location (ilike match)"),
    sort_by: Optional[str] = Query("ranked", description="Sort by 'ranked', 'rating', 'experience', or 'cases_solved'"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    Search and filter verified lawyers. Public route.
    Returns a paginated array of lawyer cards.
    """
    lawyers = []
    total_count = None
    sb_client = None
    try:
        sb_client = supabase.get_client()
        query = sb_client.table("lawyers").select("*", count="exact")

        if domain:
            normalized_domain = DOMAIN_ALIASES.get(domain.strip().lower(), domain.strip().lower())
            query = query.eq("specialization", normalized_domain)
        if location:
            query = query.ilike("location", f"%{location}%")

        response = query.execute()
        lawyers = response.data or []
        total_count = response.count if hasattr(response, "count") else None
    except Exception as e:
        err = str(e)
        lower = err.lower()
        if any(token in lower for token in ("getaddrinfo", "name or service not known", "nodename nor servname", "failed to resolve", "11001")):
            # Offline: serve lawyers created via local auth
            lawyers = local_auth_store.list_local_lawyers()
            if domain:
                nd = DOMAIN_ALIASES.get(domain.strip().lower(), domain.strip().lower())
                lawyers = [
                    l for l in lawyers
                    if nd in str(l.get("specialization") or "").lower()
                ]
            if location:
                lawyers = [
                    l for l in lawyers
                    if location.lower() in str(l.get("location") or "").lower()
                ]
            total_count = len(lawyers)
        else:
            raise HTTPException(status_code=500, detail=err)

    # Merge local lawyers if not already present (partial outages)
    try:
        existing_ids = {str(item.get("id")) for item in lawyers if item.get("id")}
        for local in local_auth_store.list_local_lawyers():
            if str(local.get("id")) not in existing_ids:
                lawyers.append(local)
    except Exception:
        pass

    lawyer_ids = [str(item.get("id")) for item in lawyers if item.get("id")]

    completed_counts = {}
    if lawyer_ids and sb_client is not None:
        try:
            consultations = (
                sb_client.table("consultations")
                .select("lawyer_id, status")
                .in_("lawyer_id", lawyer_ids)
                .execute()
            )
            for row in consultations.data or []:
                if row.get("status") != "completed":
                    continue
                lid = str(row.get("lawyer_id"))
                completed_counts[lid] = completed_counts.get(lid, 0) + 1
        except Exception:
            # Keep counts as 0 if consultations table is unavailable.
            completed_counts = {}

    for item in lawyers:
        lawyer_id = str(item.get("id"))
        cases_solved = int(completed_counts.get(lawyer_id, 0))
        item["cases_solved"] = cases_solved
        item["avatar"] = item.get("avatar") or item.get("profile_image_url")
        if "is_online" in item:
            item["available"] = "online" if item["is_online"] else "offline"

    sort_key = (sort_by or "ranked").lower()
    if sort_key == "rating":
        lawyers.sort(key=lambda x: float(x.get("rating") or 0), reverse=True)
    elif sort_key == "experience":
        lawyers.sort(key=lambda x: int(x.get("experience_years") or 0), reverse=True)
    elif sort_key == "cases_solved":
        lawyers.sort(key=lambda x: int(x.get("cases_solved") or 0), reverse=True)
    else:
        # Ranked blend requested by product: cases solved first, then experience, then rating.
        lawyers.sort(
            key=lambda x: (
                int(x.get("cases_solved") or 0),
                int(x.get("experience_years") or 0),
                float(x.get("rating") or 0),
            ),
            reverse=True,
        )

    offset = (page - 1) * limit
    paged_lawyers = lawyers[offset:offset + limit]

    return {
        "data": paged_lawyers,
        "total_count": total_count if total_count is not None else len(lawyers),
        "page": page,
        "limit": limit,
        "sort_by": sort_key,
    }


def _default_lawyer_profile(user) -> dict[str, Any]:
    name = (
        getattr(user, "full_name", None)
        or (getattr(user, "user_metadata", None) or {}).get("full_name")
        or getattr(user, "email", None)
        or "Advocate"
    )
    return {
        "id": user.id,
        "name": name,
        "email": getattr(user, "email", None),
        "specialization": "general",
        "experience_years": 5,
        "bio": (
            "I am a practising advocate focused on practical, client-first legal counsel. "
            "My work covers advisory opinions, drafting, negotiations, and courtroom advocacy. "
            "I believe every brief deserves clarity on rights, risks, remedies, and next steps."
        ),
        "location": "India",
        "fee_per_consultation": 2500,
        "is_verified": True,
        "is_online": True,
        "areas_of_practice": [
            "Litigation & dispute resolution",
            "Contract advisory",
            "Client counselling",
        ],
        "languages": ["English", "Hindi"],
        "rating": 4.8,
        "bar_council_id": "PENDING",
        "phone": None,
    }


# IMPORTANT: /me/profile must be registered before /{lawyer_id} so "me" is not treated as a UUID.
@router.get("/me/profile")
def get_my_lawyer_profile(user=Depends(get_current_user)):
    """Get the logged-in lawyer's private profile (lawyers.id == auth user id)."""
    # Offline local users
    local = local_auth_store.get_local_lawyer_profile(user.id)
    if local:
        return local

    try:
        client = supabase.get_admin_client()
        response = client.table("lawyers").select("*").eq("id", user.id).execute()
        if response.data:
            row = response.data[0]
            row["email"] = row.get("email") or getattr(user, "email", None)
            return row
    except Exception as exc:
        text = str(exc).lower()
        if any(t in text for t in ("getaddrinfo", "11001", "failed to resolve")):
            # Return a usable profile so the UI still works offline
            return _default_lawyer_profile(user)
        raise HTTPException(status_code=500, detail=str(exc))

    # Auto-heal: create a lawyer row if missing
    seed = _default_lawyer_profile(user)
    try:
        client = supabase.get_admin_client()
        client.table("lawyers").insert({
            "id": seed["id"],
            "name": seed["name"],
            "specialization": seed["specialization"],
            "experience_years": seed["experience_years"],
            "bio": seed["bio"],
            "location": seed["location"],
            "fee_per_consultation": seed["fee_per_consultation"],
            "is_verified": seed["is_verified"],
            "is_online": seed["is_online"],
            "areas_of_practice": seed["areas_of_practice"],
        }).execute()
        return seed
    except Exception:
        return seed


@router.put("/me/profile")
def update_my_lawyer_profile(
    body: LawyerProfileUpdate,
    user=Depends(get_current_user),
):
    """Update the logged-in lawyer's public-facing profile fields."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Offline path
    if local_auth_store.get_local_user_by_id(user.id):
        try:
            return local_auth_store.update_local_lawyer_profile(user.id, updates)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    payload = dict(updates)
    # Map UI "phone" into profile table if needed; lawyers table may not have phone
    phone = payload.pop("phone", None)

    try:
        client = supabase.get_admin_client()
        # Ensure row exists
        existing = client.table("lawyers").select("id").eq("id", user.id).execute()
        if not existing.data:
            seed = _default_lawyer_profile(user)
            seed.update({k: v for k, v in payload.items() if v is not None})
            client.table("lawyers").insert({
                "id": user.id,
                "name": seed.get("name"),
                "specialization": seed.get("specialization"),
                "experience_years": seed.get("experience_years"),
                "bio": seed.get("bio"),
                "location": seed.get("location"),
                "fee_per_consultation": seed.get("fee_per_consultation"),
                "is_verified": seed.get("is_verified", False),
                "is_online": seed.get("is_online", True),
                "areas_of_practice": seed.get("areas_of_practice"),
            }).execute()
        else:
            if payload:
                client.table("lawyers").update(payload).eq("id", user.id).execute()

        if phone is not None:
            try:
                client.table("profiles").update({"phone_number": phone}).eq("id", user.id).execute()
            except Exception:
                pass

        refreshed = client.table("lawyers").select("*").eq("id", user.id).execute()
        row = (refreshed.data or [{}])[0]
        row["phone"] = phone
        row["email"] = getattr(user, "email", None)
        return row
    except HTTPException:
        raise
    except Exception as exc:
        text = str(exc).lower()
        if any(t in text for t in ("getaddrinfo", "11001", "failed to resolve")):
            try:
                return local_auth_store.update_local_lawyer_profile(user.id, updates)
            except Exception:
                profile = _default_lawyer_profile(user)
                profile.update(updates)
                return profile
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{lawyer_id}")
def get_lawyer_profile(
    lawyer_id: str = Path(..., description="The ID of the lawyer")
):
    """
    Get the full lawyer profile including bio, areas_of_practice, latest 10 reviews,
    and availability schedule grouped by day.
    Falls back to offline local lawyer profiles when Supabase is down or empty.
    """
    # Offline local lawyers (demo / local auth)
    try:
        local = local_auth_store.get_local_lawyer_profile(lawyer_id)
        if local:
            local = dict(local)
            local.setdefault("lawyer_reviews", [])
            local.setdefault("grouped_availability", {})
            local["avatar"] = local.get("avatar") or local.get("profile_image_url")
            if "is_online" in local:
                local["available"] = "online" if local.get("is_online") else "offline"
            return local
    except Exception:
        pass

    try:
        client = supabase.get_client()
        response = client.table("lawyers").select(
            "*, lawyer_reviews(*), lawyer_availability(*)"
        ).eq("id", lawyer_id).execute()

        data = response.data
        if not data:
            raise HTTPException(status_code=404, detail="Lawyer not found")

        lawyer_data = data[0]

        reviews = lawyer_data.get("lawyer_reviews", [])
        reviews.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        lawyer_data["lawyer_reviews"] = reviews[:10]

        availability = lawyer_data.get("lawyer_availability", [])
        grouped_availability = {}
        for slot in availability:
            day = slot.get("day_of_week")
            if day not in grouped_availability:
                grouped_availability[day] = []
            grouped_availability[day].append({
                "id": slot.get("id"),
                "start_time": slot.get("start_time"),
                "end_time": slot.get("end_time")
            })

        lawyer_data["grouped_availability"] = grouped_availability
        lawyer_data.pop("lawyer_availability", None)

        if "is_online" in lawyer_data:
            lawyer_data["available"] = "online" if lawyer_data["is_online"] else "offline"

        lawyer_data["avatar"] = lawyer_data.get("avatar") or lawyer_data.get("profile_image_url")
        return lawyer_data

    except HTTPException:
        raise
    except Exception as e:
        text = str(e).lower()
        if any(t in text for t in ("getaddrinfo", "11001", "failed to resolve", "name or service")):
            local = local_auth_store.get_local_lawyer_profile(lawyer_id)
            if local:
                local = dict(local)
                local.setdefault("lawyer_reviews", [])
                local.setdefault("grouped_availability", {})
                return local
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase for lawyer profile. Use a demo lawyer id or fix SUPABASE_URL.",
            )
        raise HTTPException(status_code=500, detail=str(e))
