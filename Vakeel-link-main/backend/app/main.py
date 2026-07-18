from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.limiter import limiter
from app.middleware.error_handler import register_error_handlers

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: local Vite ports + any production frontends from CORS_ORIGINS env
# (comma-separated, e.g. https://your-app.vercel.app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global error handlers (must be registered before routers) ────────────────
register_error_handlers(app)

@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}


@app.get("/health/rag", tags=["system"])
def health_rag():
    """
    Diagnostics for retrieval + generation stack (no secrets).
    Use this to verify Qdrant, local corpus, Supabase DNS, and LLM key presence.
    """
    import socket
    from pathlib import Path
    from urllib.parse import urlparse

    report = {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "embedding_model": settings.EMBEDDING_MODEL_NAME,
        "use_local_first": bool(settings.USE_LOCAL_VECTOR_STORE),
        "rag_min_hits": settings.RAG_MIN_HITS,
        "rag_score_floor": settings.RAG_SCORE_FLOOR,
        "rag_broaden": settings.RAG_BROADEN,
        "rag_blend_local": settings.RAG_BLEND_LOCAL,
        "groq_configured": bool((settings.GROQ_API_KEY or "").strip()),
        "gemini_configured": bool(
            (settings.GOOGLE_API_KEY or settings.GEMINI_API_KEY or "").strip()
        ),
        "qdrant_configured": bool((settings.QDRANT_URL or "").strip() and (settings.QDRANT_API_KEY or "").strip()),
        "qdrant_reachable": False,
        "qdrant_collections": [],
        "qdrant_error": None,
        "local_store_available": False,
        "local_embeddings_dir": settings.LOCAL_EMBEDDINGS_DIR,
        "local_corpus_dir": settings.LOCAL_CORPUS_DIR,
        "local_embedding_files": 0,
        "supabase_configured": bool((settings.SUPABASE_URL or "").strip()),
        "supabase_reachable": False,
        "supabase_error": None,
    }

    # Local corpus
    emb_dir = Path(settings.LOCAL_EMBEDDINGS_DIR or "")
    if emb_dir.is_dir():
        npy = list(emb_dir.glob("embeddings_*.npy"))
        report["local_embedding_files"] = len(npy)
        report["local_store_available"] = len(npy) > 0

    # Supabase DNS
    try:
        host = urlparse(settings.SUPABASE_URL or "").hostname
        if host:
            socket.getaddrinfo(host, 443)
            report["supabase_reachable"] = True
        else:
            report["supabase_error"] = "SUPABASE_URL missing host"
    except Exception as exc:
        report["supabase_error"] = str(exc)
        report["supabase_reachable"] = False

    # Qdrant
    if report["qdrant_configured"]:
        try:
            from qdrant_client import QdrantClient

            client = QdrantClient(
                url=(settings.QDRANT_URL or "").strip().strip('"').strip("'"),
                api_key=(settings.QDRANT_API_KEY or "").strip().strip('"').strip("'"),
                check_compatibility=False,
                timeout=12,
            )
            cols = client.get_collections()
            names = [c.name for c in (cols.collections or [])]
            report["qdrant_reachable"] = True
            report["qdrant_collections"] = names
        except Exception as exc:
            report["qdrant_error"] = str(exc)
            report["qdrant_reachable"] = False

    degraded = []
    if not report["qdrant_reachable"] and not report["local_store_available"]:
        degraded.append("no_vector_backend")
    if not report["groq_configured"] and not report["gemini_configured"]:
        degraded.append("no_llm_keys")
    if not report["supabase_reachable"]:
        degraded.append("supabase_unreachable")

    if degraded:
        report["status"] = "degraded"
        report["degraded_reasons"] = degraded
    else:
        report["degraded_reasons"] = []

    return report


@app.get("/")
def root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME}"}

# Import-guarded router mounts
try:
    from app.api.routers import auth
    app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
except ImportError:
    pass

try:
    from app.api.routers import lawyers
    app.include_router(lawyers.router, prefix=f"{settings.API_V1_STR}/lawyers", tags=["lawyers"])
except ImportError:
    pass

try:
    from app.api.routers import admin
    app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
except ImportError:
    pass

try:
    from app.api.routers import chat
    app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["chat"])
except ImportError:
    pass

try:
    from app.api.routers import ai
    app.include_router(ai.router, prefix=f"{settings.API_V1_STR}", tags=["ai"])
    app.include_router(ai.router, prefix="/api", tags=["ai-public"])
except ImportError as e:
    print("Failed to import AI router:", e)

try:
    from app.api.routers import analyze
    app.include_router(analyze.router, prefix=f"{settings.API_V1_STR}", tags=["analyze"])
except ImportError as e:
    print("Failed to import Analyze router:", e)

try:
    from app.api.routers import cases
    app.include_router(cases.router, prefix=f"{settings.API_V1_STR}/cases", tags=["cases"])
except ImportError as e:
    print("Failed to import Cases router:", e)

try:
    from app.api.routers import messaging
    app.include_router(messaging.router, prefix=f"{settings.API_V1_STR}/messages", tags=["messaging"])
except ImportError as e:
    print("Failed to import Messaging router:", e)

try:
    from app.api.routers import users
    app.include_router(users.router, prefix=f"{settings.API_V1_STR}/users", tags=["users"])
except ImportError as e:
    print("Failed to import Users router:", e)

try:
    from app.api.routers import consultations
    app.include_router(consultations.router, prefix=f"{settings.API_V1_STR}/consultations", tags=["consultations"])
except ImportError as e:
    print("Failed to import Consultations router:", e)
