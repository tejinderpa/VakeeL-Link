from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Prefer backend/.env over stale machine-level env vars (e.g. suspended GOOGLE_API_KEY).
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"
if _ENV_FILE.exists():
    load_dotenv(_ENV_FILE, override=True)
else:
    load_dotenv(".env", override=True)


class Settings(BaseSettings):
    PROJECT_NAME: str = "VakeelLink API"
    API_V1_STR: str = "/api/v1"

    # Supabase config
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    JWT_SECRET: str = "dev-secret"

    # AI & Vector DB
    QDRANT_URL: str = ""
    QDRANT_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    # Optional: used as LLM fallback when Groq hits rate limits
    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Local vector fallback (numpy .npy + corpus jsonl)
    LOCAL_EMBEDDINGS_DIR: str = r"G:\Hackathon\embeddings"
    LOCAL_CORPUS_DIR: str = r"G:\Hackathon\corpus"
    # Prefer local store when true, or auto-fallback when Qdrant fails
    USE_LOCAL_VECTOR_STORE: bool = True

    # When true, signup/login uses offline local_users.json first and skips
    # Supabase Auth (avoids free-tier "email rate limit exceeded").
    # Set false to always prefer Supabase when available.
    AUTH_PREFER_LOCAL: bool = True

    # RAG quality knobs
    RAG_MIN_HITS: int = 3
    RAG_SCORE_FLOOR: float = 0.35
    RAG_BROADEN: bool = True
    RAG_BLEND_LOCAL: bool = True
    RAG_TOP_K: int = 6

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


def _resolve_data_dir(configured: str, *fallback_parts: str) -> str:
    """Prefer configured path if it exists; else try repo-relative fallbacks."""
    if configured:
        p = Path(configured)
        if p.is_dir():
            return str(p)
    for parts in (
        (_BACKEND_ROOT / "data" / fallback_parts[-1],),
        (_BACKEND_ROOT.parent / "data" / fallback_parts[-1],),
        (Path("G:/Hackathon") / fallback_parts[-1],),
    ):
        candidate = parts[0] if len(parts) == 1 else Path(*parts)
        # fallback_parts already encodes folder name
        pass
    for base in (_BACKEND_ROOT / "data", _BACKEND_ROOT.parent / "Hackathon", Path(r"G:\Hackathon")):
        candidate = base / fallback_parts[-1]
        if candidate.is_dir():
            return str(candidate)
    return configured or str(_BACKEND_ROOT / "data" / fallback_parts[-1])


settings = Settings()
# Soft-resolve local corpus paths when defaults are missing on this machine
if not Path(settings.LOCAL_EMBEDDINGS_DIR).is_dir():
    settings.LOCAL_EMBEDDINGS_DIR = _resolve_data_dir(settings.LOCAL_EMBEDDINGS_DIR, "embeddings")
if not Path(settings.LOCAL_CORPUS_DIR).is_dir():
    settings.LOCAL_CORPUS_DIR = _resolve_data_dir(settings.LOCAL_CORPUS_DIR, "corpus")
