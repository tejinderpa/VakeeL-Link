# Deploy VakeelLink backend (free)

Recommended host: **[Render](https://render.com)** free **Web Service**.  
No paid Redis/WebSocket broker required — chat uses in-process WebSockets + file/API fallback.

Your GitHub repo: `https://github.com/tejinderpa/VakeeL-Link`  
Backend code lives at: `Vakeel-link-main/backend`

---

## 1. What to deploy

| Piece | Service type | Free option |
|-------|--------------|-------------|
| **Backend (this guide)** | Render **Web Service** | Yes (spins down when idle) |
| Frontend (later) | Vercel / Netlify static | Yes |
| Database / Auth | Supabase free project | Yes |
| Vectors | Qdrant Cloud free | Yes |
| LLM | Groq free key | Yes |

You only need a **Web Service** for the FastAPI API. Do **not** use a static site for the backend.

---

## 2. Push latest code

From your machine (repo root `Hack-vakeel2`):

```powershell
cd G:\Hack-vakeel2
git status
git add Vakeel-link-main/backend Vakeel-link-main/DEPLOY.md Vakeel-link-main/render.yaml render.yaml
git commit -m "Add Render deploy config and production CORS for backend"
git push origin main
```

Do **not** commit `backend/.env` (secrets).

---

## 3. Create the Web Service on Render

### Option A — Blueprint (easiest)

1. Open [https://dashboard.render.com](https://dashboard.render.com)
2. **New → Blueprint**
3. Connect GitHub → select **`tejinderpa/VakeeL-Link`**
4. Render reads root `render.yaml`
5. Create the service **`vakeellink-api`**

### Option B — Manual Web Service

1. **New → Web Service**
2. Connect the same repo
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `vakeellink-api` |
| **Region** | Singapore (or closest) |
| **Root Directory** | `Vakeel-link-main/backend` |
| **Runtime** | Python 3 |
| **Build Command** | see below |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| **Instance type** | Free |
| **Health check path** | `/health` |

**Build Command** (paste as **one line**, or use the script):

```bash
chmod +x ./build.sh && ./build.sh
```

Or one-liner without the script:

```bash
python -m pip install --upgrade pip && python -m pip install torch --index-url https://download.pytorch.org/whl/cpu && python -m pip install -r requirements-render.txt
```

**Important:** Do **not** paste three separate lines without `&&` between them. Render will glue them into one broken command like `pip install --upgrade pip pip install torch...` and fail with `No matching distribution found for install`.

Also set env var **`PYTHON_VERSION`** = `3.11.9` (do not use 3.14 — packages often break).

---

## 4. Environment variables (Render → Environment)

Copy values from your local `backend/.env` (never paste them into git).

### Required for basic auth + consultations (offline-friendly)

| Key | Example / notes |
|-----|-----------------|
| `ENVIRONMENT` | `production` |
| `JWT_SECRET` | long random string (or use Generate) |
| `AUTH_PREFER_LOCAL` | `true` (works without Supabase email limits) |
| `PROJECT_NAME` | `VakeelLink API` |
| `API_V1_STR` | `/api/v1` |

### Supabase (recommended when ready)

| Key | Where to get it |
|-----|-----------------|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_KEY` | anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret (server only) |

Run `backend/supabase_schema.sql` in Supabase SQL editor once.

### AI / RAG (optional on free tier)

| Key | Notes |
|-----|--------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) free |
| `GOOGLE_API_KEY` | optional Gemini fallback |
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant API key |
| `EMBEDDING_MODEL_NAME` | `sentence-transformers/all-MiniLM-L6-v2` |
| `USE_LOCAL_VECTOR_STORE` | `true` |

### Frontend CORS (set after frontend deploy)

| Key | Example |
|-----|---------|
| `CORS_ORIGINS` | `https://your-app.vercel.app` |

Multiple origins: comma-separated, no spaces needed:

```text
https://vakeellink.vercel.app,https://vakeellink.netlify.app
```

---

## 5. Deploy & verify

1. Click **Deploy** / wait for build (first build can take 10–20+ minutes because of PyTorch).
2. Open:

```text
https://vakeellink-api.onrender.com/health
```

(use your real service URL)

Expected:

```json
{"status":"ok","service":"VakeelLink API"}
```

Also try:

```text
https://YOUR-SERVICE.onrender.com/docs
```

Swagger UI should list `/api/v1/...` routes.

### Quick auth smoke test

```powershell
$body = @{ email = "demo@example.com"; password = "password123"; full_name = "Demo"; role = "client" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://YOUR-SERVICE.onrender.com/api/v1/auth/signup" -Method POST -ContentType "application/json" -Body $body
```

---

## 6. Point the frontend at the API

In `frontend/.env` (or Vercel env):

```env
VITE_API_URL=https://YOUR-SERVICE.onrender.com
```

Rebuild the frontend. Add that same frontend origin to Render `CORS_ORIGINS`.

---

## 7. Free-tier caveats

| Issue | What to expect |
|-------|----------------|
| Cold start | First hit after idle can take 30–60s |
| RAM 512 MB | Loading `sentence-transformers` may crash AI routes; auth/chat often still work |
| Ephemeral disk | `backend/data/*.json` offline stores reset on redeploy — use Supabase for real data |
| WebSockets | Supported on Render web services; prefer same HTTPS host / correct CORS |

If AI OOMs on free: keep `AUTH_PREFER_LOCAL=true` and use Groq-only paths later, or upgrade to **Starter** (~$7) for more RAM.

---

## 8. Files added for deploy

| File | Purpose |
|------|---------|
| `render.yaml` (repo root) | Blueprint with correct `rootDir` |
| `Vakeel-link-main/backend/requirements-render.txt` | Lean deps for cloud |
| `Vakeel-link-main/backend/runtime.txt` | Python 3.11.9 |
| `Vakeel-link-main/backend/Procfile` | Start command helper |
| `CORS_ORIGINS` in config | Production frontend allow-list |

---

## 9. Alternatives (also free-ish)

| Host | Notes |
|------|--------|
| **Railway** | Easy; free credit; same Python start command as Render |
| **Fly.io** | Free allowance limited; not needed if using Render |
| **PythonAnywhere** | No native WebSockets — skip for chat |

Stick with **Render Web Service** unless you already use another host.
