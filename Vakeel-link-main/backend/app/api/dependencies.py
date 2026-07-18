from types import SimpleNamespace

from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client

from app.core.supabase_client import supabase
from app.services import local_auth_store

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


def _as_user(record: dict):
    """Minimal user-like object compatible with routes using user.id / user.email."""
    return SimpleNamespace(
        id=record.get("id"),
        email=record.get("email"),
        user_metadata={
            "full_name": record.get("full_name"),
            "role": record.get("role"),
        },
        role=record.get("role"),
        full_name=record.get("full_name"),
    )


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Verifies JWT via Supabase, or local offline tokens when Supabase is down.
    """
    token = credentials.credentials

    # Offline / local demo tokens
    if local_auth_store.is_local_token(token):
        try:
            record = local_auth_store.verify_local_token(token)
            return _as_user(record)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired local token.")

    client: Client = supabase.get_client()
    try:
        user_response = client.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user_response.user
    except HTTPException:
        raise
    except Exception as e:
        text = str(e).lower()
        if any(t in text for t in ("getaddrinfo", "11001", "failed to resolve", "name or service")):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Cannot reach Supabase to validate your session (DNS/network). "
                    "Re-login after fixing SUPABASE_URL, or use offline signup/login."
                ),
            )
        raise HTTPException(status_code=401, detail="Token expired or invalid.")


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(optional_security),
):
    if credentials is None:
        return None

    token = credentials.credentials
    if local_auth_store.is_local_token(token):
        try:
            return _as_user(local_auth_store.verify_local_token(token))
        except Exception:
            return None

    client: Client = supabase.get_client()
    try:
        user_response = client.auth.get_user(token)
        if not user_response or not user_response.user:
            return None
        return user_response.user
    except Exception:
        return None


def require_role(allowed_roles: list[str]):
    def role_checker(current_user=Depends(get_current_user)):
        # Local user objects expose .role
        if getattr(current_user, "role", None) in allowed_roles:
            return current_user

        client: Client = supabase.get_admin_client() if hasattr(supabase, "get_admin_client") else supabase.get_client()
        try:
            response = (
                client.table("profiles")
                .select("role")
                .eq("id", current_user.id)
                .single()
                .execute()
            )
        except Exception:
            # Offline: trust token/metadata role
            meta_role = (getattr(current_user, "user_metadata", None) or {}).get("role")
            if meta_role in allowed_roles:
                return current_user
            raise HTTPException(status_code=403, detail="Profile not found or role missing.")

        if not response.data or "role" not in response.data:
            raise HTTPException(status_code=403, detail="Profile not found or role missing.")

        user_role = response.data["role"]
        if user_role not in allowed_roles:
            raise HTTPException(status_code=403, detail=f"Action not allowed for role: {user_role}")

        return current_user

    return role_checker
