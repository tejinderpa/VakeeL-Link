import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from app.services.auth_service import AuthService

router = APIRouter()
auth_service = AuthService()

# Lenient email check (allows offline demo domains like .test that EmailStr rejects)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        email = (v or "").strip().lower()
        if not _EMAIL_RE.match(email):
            raise ValueError("Invalid email format")
        return email


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = Field(pattern="^(client|lawyer|admin)$")
    phone_number: Optional[str] = None
    # Additional fields specific to our React Frontend forms
    bar_council_id: Optional[str] = None
    experience_years: Optional[int] = None
    specialization: Optional[str] = None
    location: Optional[str] = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        email = (v or "").strip().lower()
        if not _EMAIL_RE.match(email):
            raise ValueError("Invalid email format")
        return email


@router.post("/signup")
def signup(request: SignupRequest):
    """
    Register a new user.
    If the role is 'lawyer', the bar_council_id must be provided.
    """
    if request.role == "lawyer" and not request.bar_council_id:
        raise HTTPException(status_code=400, detail="Lawyers must provide a valid Bar Council ID.")

    return auth_service.signup_user(request.model_dump())


@router.post("/login")
def login(request: LoginRequest):
    """
    Authenticate and retrieve a JWT token and user role.
    Falls back to offline local accounts when Supabase is down or the user
    only exists in the local store (e.g. offline signup / demo lawyers).
    """
    return auth_service.login_user(request.email, request.password)
