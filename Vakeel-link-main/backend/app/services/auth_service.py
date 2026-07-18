import time

from supabase import Client
from fastapi import HTTPException

from app.core.config import settings
from app.core.supabase_client import supabase
from app.services import local_auth_store

# After Supabase hits email rate limit, skip remote auth for a while so we
# don't keep failing every signup attempt.
_SUPABASE_AUTH_COOLDOWN_UNTIL = 0.0
_SUPABASE_AUTH_COOLDOWN_SEC = 60 * 60  # 1 hour


def _is_network_error(exc: Exception) -> bool:
    text = str(exc).lower()
    tokens = (
        "getaddrinfo",
        "11001",
        "name or service not known",
        "nodename nor servname",
        "failed to resolve",
        "name resolution",
        "temporary failure in name resolution",
        "connection refused",
        "connection aborted",
        "network is unreachable",
        "timed out",
        "timeout",
        "connecterror",
        "clientconnectorerror",
    )
    return any(t in text for t in tokens)


def _is_rate_limit_error(exc: Exception) -> bool:
    """Supabase Auth email / request rate limits (common on free tier)."""
    text = str(exc).lower()
    tokens = (
        "rate limit",
        "over_email_send_rate_limit",
        "email rate limit exceeded",
        "too many requests",
        "429",
        "smtp",
        "over_request_rate_limit",
    )
    return any(t in text for t in tokens)


def _should_fallback_local(exc: Exception) -> bool:
    return _is_network_error(exc) or _is_rate_limit_error(exc)


def _mark_supabase_auth_cooldown() -> None:
    global _SUPABASE_AUTH_COOLDOWN_UNTIL
    _SUPABASE_AUTH_COOLDOWN_UNTIL = time.time() + _SUPABASE_AUTH_COOLDOWN_SEC


def _supabase_auth_on_cooldown() -> bool:
    return time.time() < _SUPABASE_AUTH_COOLDOWN_UNTIL


def _prefer_local_auth() -> bool:
    return bool(getattr(settings, "AUTH_PREFER_LOCAL", True)) or _supabase_auth_on_cooldown()


def _network_help(exc: Exception) -> str:
    return (
        "Cannot reach Supabase (DNS/network). "
        f"Detail: {exc}. "
        "Fix: open Supabase Dashboard → Settings → API, copy a valid Project URL into backend/.env "
        "(SUPABASE_URL), ensure the project is not paused/deleted, then restart the API. "
        "Offline signup/login is available automatically while Supabase is unreachable."
    )


def _signup_local_or_raise(user_data: dict, *, reason: Exception | None = None):
    try:
        result = local_auth_store.signup_local(user_data)
        if reason is not None and _is_rate_limit_error(reason):
            result = {
                **result,
                "message": (
                    "Account created in offline mode (Supabase email rate limit hit). "
                    "You can sign in now with this email and password."
                ),
            }
        return result
    except ValueError as local_exc:
        # e.g. email already registered offline
        msg = str(local_exc)
        if "already registered" in msg.lower():
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{msg}. If this is your account, go to Login and sign in. "
                    "Demo advocate: lawyer@example.com / lawyer123"
                ),
            )
        raise HTTPException(status_code=400, detail=msg)
    except Exception as local_exc:
        if reason is not None and _is_network_error(reason):
            raise HTTPException(
                status_code=503,
                detail=f"{_network_help(reason)} Offline signup also failed: {local_exc}",
            )
        if reason is not None and _is_rate_limit_error(reason):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Supabase email rate limit exceeded and offline signup failed. "
                    f"Detail: {local_exc}. Wait ~1 hour or use demo login "
                    "lawyer@example.com / lawyer123"
                ),
            )
        raise HTTPException(status_code=400, detail=str(local_exc))


class AuthService:
    def __init__(self):
        self.client: Client = supabase.get_client()
        self.admin_client: Client = supabase.get_admin_client()

    def signup_user(self, user_data: dict):
        user_data = dict(user_data or {})
        user_data["email"] = (user_data.get("email") or "").strip().lower()

        # Already registered offline → don't burn Supabase email quota again
        if local_auth_store.has_local_user(user_data["email"]):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Email already registered (local mode). "
                    "Go to Login and sign in with this email and password."
                ),
            )

        # Local-first: avoids Supabase free-tier "email rate limit exceeded"
        if _prefer_local_auth():
            result = _signup_local_or_raise(user_data)
            result["message"] = (
                "Account created in offline mode. You can sign in now with this email and password."
            )
            return result

        try:
            auth_response = self.client.auth.sign_up({
                "email": user_data["email"],
                "password": user_data["password"],
                "options": {
                    "data": {
                        "full_name": user_data["full_name"],
                        "role": user_data["role"],
                    }
                },
            })

            user = auth_response.user
            if not user:
                raise HTTPException(status_code=400, detail="Signup failed or email already exists.")

            profile_data = {
                "id": user.id,
                "email": user_data["email"],
                "role": user_data["role"],
                "full_name": user_data["full_name"],
                "phone_number": user_data.get("phone_number"),
            }
            self.admin_client.table("profiles").insert(profile_data).execute()

            if user_data["role"] == "lawyer":
                lawyer_data = {
                    "id": user.id,
                    "name": user_data.get("full_name") or user_data["email"],
                    "bar_council_id": user_data.get("bar_council_id"),
                    "experience_years": user_data.get("experience_years", 0),
                    "is_verified": False,
                    "specialization": user_data.get("specialization") or "general",
                    "bio": (
                        "Practising advocate committed to clear advice, diligent preparation, "
                        "and ethical client representation across courts and counsel work."
                    ),
                    "location": user_data.get("location") or "India",
                }
                try:
                    self.admin_client.table("lawyers").insert(lawyer_data).execute()
                except Exception:
                    fallback = {
                        "id": user.id,
                        "name": user_data.get("full_name") or user_data["email"],
                        "experience_years": user_data.get("experience_years", 0),
                    }
                    self.admin_client.table("lawyers").insert(fallback).execute()

            return {
                "message": "User created successfully",
                "user_id": user.id,
                "role": user_data["role"],
                "full_name": user_data.get("full_name"),
                "email": user_data["email"],
                "mode": "supabase",
            }

        except HTTPException:
            raise
        except Exception as e:
            # Network OR Supabase email rate limit → create offline account so user can continue
            if _is_rate_limit_error(e):
                _mark_supabase_auth_cooldown()
            if _should_fallback_local(e):
                return _signup_local_or_raise(user_data, reason=e)
            raise HTTPException(status_code=400, detail=str(e))

    def _login_local_or_raise(self, email: str, password: str, *, network_error: Exception | None = None):
        """Try offline local store; preserve network context when Supabase is down."""
        try:
            return local_auth_store.login_local(email, password)
        except ValueError as cred_err:
            if network_error is not None:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        f"{_network_help(network_error)} "
                        f"Offline login: {cred_err}. "
                        "Sign up again while offline to create a local account, or fix SUPABASE_URL."
                    ),
                )
            raise HTTPException(
                status_code=401,
                detail="Authentication failed. Please check your credentials.",
            )
        except Exception as local_exc:
            if network_error is not None:
                raise HTTPException(
                    status_code=503,
                    detail=f"{_network_help(network_error)} Offline login failed: {local_exc}",
                )
            raise HTTPException(
                status_code=401,
                detail="Authentication failed. Please check your credentials.",
            )

    def login_user(self, email: str, password: str):
        email = (email or "").strip().lower()

        # Fast path: account already lives in the offline store (demo lawyers / offline signup).
        # Avoids waiting on a slow or flaky Supabase round-trip.
        if local_auth_store.has_local_user(email):
            return self._login_local_or_raise(email, password)

        try:
            auth_response = self.client.auth.sign_in_with_password({
                "email": email,
                "password": password,
            })
            if not auth_response.session:
                raise HTTPException(
                    status_code=401,
                    detail="Authentication failed. Please check your credentials.",
                )

            user = auth_response.user
            profile_response = (
                self.admin_client.table("profiles")
                .select("role, full_name, email, phone_number, avatar_url")
                .eq("id", user.id)
                .execute()
            )
            profile = (profile_response.data or [None])[0] or {}
            role = profile.get("role") or (user.user_metadata or {}).get("role") or "client"
            full_name = (
                profile.get("full_name")
                or (user.user_metadata or {}).get("full_name")
                or email
            )

            return {
                "access_token": auth_response.session.access_token,
                "refresh_token": auth_response.session.refresh_token,
                "token_type": "bearer",
                "role": role,
                "user_id": user.id,
                "mode": "supabase",
                "user": {
                    "id": user.id,
                    "email": profile.get("email") or user.email or email,
                    "full_name": full_name,
                    "name": full_name,
                    "role": role,
                    "phone_number": profile.get("phone_number"),
                    "avatar_url": profile.get("avatar_url"),
                },
            }
        except HTTPException:
            raise
        except Exception as e:
            # Network / DNS issues → clear offline-oriented error
            if _is_network_error(e):
                raise HTTPException(
                    status_code=503,
                    detail=(
                        f"{_network_help(e)} "
                        "No matching offline account. Sign up again while offline, or fix SUPABASE_URL."
                    ),
                )
            raise HTTPException(
                status_code=401,
                detail="Authentication failed. Please check your credentials.",
            )
