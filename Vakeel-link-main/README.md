# VakeelLink

**AI-powered Indian legal research platform** — RAG over case law & statutes, lawyer directory, consultations, and client dashboards.

| Layer | Stack |
|-------|--------|
| Frontend | React 19 + Vite 8 + React Router + Framer Motion |
| Backend | FastAPI + Uvicorn |
| Auth / DB | Supabase (Postgres + Auth) |
| Vector store | Qdrant Cloud |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` |
| LLM (primary) | **Groq** (`llama-3.3-70b-versatile`, fallback `llama-3.1-8b-instant`) |
| LLM (fallback) | Google Gemini (`gemini-2.0-flash`, `gemini-1.5-flash`) |

---

## Project layout

```
Vakeel-link-main/
├── backend/
│   ├── app/
│   │   ├── api/routers/     # auth, ai, lawyers, cases, chat, ...
│   │   ├── core/            # config, supabase client, rate limiter
│   │   ├── services/
│   │   │   ├── rag/         # retrieval_from_qdrant.py + qa_engine.py
│   │   │   └── ...
│   │   └── main.py          # FastAPI entry
│   ├── .env                 # secrets (not committed)
│   ├── .env.example
│   ├── requirements.txt
│   └── supabase_schema.sql  # tables + seed helpers
├── frontend/
│   ├── src/pages/           # AIAssistant, LawyerDirectory, dashboards, ...
│   ├── .env                 # VITE_API_URL
│   └── package.json
├── upload_to_qdrant.py      # (root scripts) embedding upload helpers
├── generate_embeddings.py
└── render.yaml              # optional Render.com blueprint
```

---

## Prerequisites

- **Node.js** 20+ (tested with 22)
- **Python** 3.11–3.13
- Accounts / projects:
  - [Groq](https://console.groq.com/keys) API key (`gsk_...`)
  - [Qdrant Cloud](https://cloud.qdrant.io/) cluster + API key
  - [Supabase](https://supabase.com/) project (URL + anon/publishable + service_role keys)
  - Optional: [Google AI Studio](https://aistudio.google.com/apikey) for Gemini fallback

---

## Quick start (local)

### 1. Backend environment

```powershell
cd Vakeel-link-main\backend
copy .env.example .env
# Edit .env with real keys (see checklist below)
python -m pip install -r requirements.txt
```

### 2. Frontend environment

```powershell
cd Vakeel-link-main\frontend
# .env already defaults to http://127.0.0.1:8000
npm install
```

### 3. Run both servers

**Terminal A — API**

```powershell
cd Vakeel-link-main\backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal B — UI**

```powershell
cd Vakeel-link-main\frontend
npm run dev
```

| Service  | URL |
|----------|-----|
| Frontend | http://127.0.0.1:5173 |
| Backend  | http://127.0.0.1:8000 |
| Health   | http://127.0.0.1:8000/health |
| OpenAPI  | http://127.0.0.1:8000/docs |

---

## Environment variables (`backend/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_KEY` | yes | Anon / publishable key (client-safe operations) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role / secret (admin inserts, bypass RLS) |
| `JWT_SECRET` | yes | Supabase JWT secret (or local secret) |
| `QDRANT_URL` | yes | e.g. `https://xxxx.eu-central-1-0.aws.cloud.qdrant.io:6333` |
| `QDRANT_API_KEY` | yes | Qdrant API key |
| `GROQ_API_KEY` | yes | Primary LLM |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | no | Fallback when Groq is limited |
| `EMBEDDING_MODEL_NAME` | no | Default MiniLM L6 v2 |

**Frontend** (`frontend/.env`):

```
VITE_API_URL=http://127.0.0.1:8000
```

> **Note:** Values in `backend/.env` override machine-level environment variables of the same name (so a stale system `GOOGLE_API_KEY` will not silently break Gemini).

### After 1–2 months offline — keys often expire

If the app “used to work” but AI/DB fail now, refresh credentials:

1. **Groq** — create a new key if you see `401 invalid_api_key`
2. **Gemini** — suspended projects return `403 CONSUMER_SUSPENDED`; create a new Google AI Studio key
3. **Supabase** — free projects can be paused/deleted; restore or create a new project, re-run `supabase_schema.sql`, update URL/keys
4. **Qdrant** — free clusters can be removed; create a cluster, re-upload collections (see below)

---

## Database (Supabase)

1. Create a Supabase project.
2. Open **SQL Editor** and run `backend/supabase_schema.sql`.
3. Optional: seed lawyers via `backend/scripts/seed_lawyers.py` (with service role key set).
4. Confirm tables such as: `profiles`, `lawyers`, `consultations`, `query_history`, `ai_citations`.

Main data flows:

- **Auth** → Supabase Auth + `profiles.role` (`client` | `lawyer` | `admin`)
- **Lawyers directory** → `GET /api/v1/lawyers`
- **AI history / citations** (logged-in users) → `query_history` + `ai_citations`
- **Consultations / messages** → respective tables via routers under `/api/v1/...`

---

## AI / RAG pipeline (citations)

```
User query
  → domain classify (keywords + embedding fallback)
  → embed query (MiniLM)
  → Qdrant search in domain collection(s)
       legal_constitutional | legal_criminal | legal_consumer
       legal_family | legal_labour | legal_motor_accident
  → build citation cards from retrieved chunks (sections / cases / acts)
  → Groq JSON generation (strict: only cite text present in context)
  → if Groq fails → Gemini
  → if both fail → retrieval-only answer (still returns chunk citations when Qdrant works)
  → optional lawyer recommendations from Supabase by domain
```

### Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/query/ask` | Full RAG answer + citations (also `/api/query/ask`) |
| `POST` | `/api/v1/query` | Same handler |
| `GET`  | `/health` | Liveness |

Response fields used by the UI:

- `analysis` / `summary` / `answer` — structured Facts / Issues / Analysis / Conclusion when possible  
- `citations[]` — cards with `type`, `title`, `excerpt`, `full_text`, `score`, `source_collection`  
- `cited_sections`, `cited_cases`, `cited_acts`  
- `confidence_score`, `domain`, `llm_provider`, `retrieval_status`, `disclaimer`  
- `recommended_lawyers[]`

### Local vector store (default when Qdrant Cloud is down)

The app ships with a **local numpy corpus** fallback:

| Env var | Default / purpose |
|---------|-------------------|
| `USE_LOCAL_VECTOR_STORE` | `true` — search local embeddings first |
| `LOCAL_EMBEDDINGS_DIR` | e.g. `G:\Hackathon\embeddings` (`.npy` + metadata JSON) |
| `LOCAL_CORPUS_DIR` | e.g. `G:\Hackathon\corpus` (JSONL chunk text) |

This is the recommended path after free-tier Qdrant clusters expire. Qdrant Cloud is still supported if `USE_LOCAL_VECTOR_STORE=false` and the cluster is healthy.

### Rebuilding / re-uploading to Qdrant

```powershell
# Typical offline pipeline (see each script for args)
python generate_embeddings.py
python upload_to_qdrant.py
```

Collection names **must** match the domain keys listed above.

---

## API overview

| Prefix | Purpose |
|--------|---------|
| `/api/v1/auth` | signup / login |
| `/api/v1/users` | profile |
| `/api/v1/lawyers` | directory & profiles |
| `/api/v1` (`/query`, `/query/ask`) | legal AI |
| `/api/v1/cases` | case records |
| `/api/v1/consultations` | booking flow |
| `/api/v1/messages` | messaging |
| `/api/v1/chat` | chat helpers |
| `/api/v1/admin` | admin tools |

Rate limit on AI: **10 requests / minute / IP** (SlowAPI).

---

## Frontend pages

| Route | Page |
|-------|------|
| `/` | Landing |
| `/login`, `/signup` | Auth |
| `/dashboard/user`, `/dashboard/lawyer` | Role dashboards |
| AI assistant / Prism AI routes | RAG Q&A + citation UI |
| `/lawyers`, `/lawyers/:id` | Directory |
| `/consultations`, `/my-cases`, `/profile`, … | Client tooling |

Auth token is stored as `vakeellink_token` and sent as `Authorization: Bearer …` when present.

---

## Deploy notes (Render)

**Full step-by-step guide:** see [`DEPLOY.md`](./DEPLOY.md).

Use a Render **Web Service** (not static). Blueprint: repo-root `render.yaml` with `rootDir: Vakeel-link-main/backend`. Set secrets in the Render dashboard (`SUPABASE_*`, `GROQ_API_KEY`, `CORS_ORIGINS`, etc.). Frontend (Vercel/Netlify) should set `VITE_API_URL=https://YOUR-SERVICE.onrender.com` and that origin must be listed in `CORS_ORIGINS`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 invalid_api_key` from Groq | Expired/revoked key | New key at console.groq.com → update `.env` → restart API |
| `403 CONSUMER_SUSPENDED` Gemini | Google project suspended | New AI Studio key; ensure system env does not override |
| Qdrant `404 page not found` | Cluster deleted / wrong URL | New cluster URL+key; re-upload collections |
| Supabase `getaddrinfo failed` | Project paused/deleted / bad URL | Restore project or create new; re-run SQL schema |
| Lawyers list empty / 503 | Supabase unreachable | Same as above |
| AI answers with empty citations | Retrieval degraded | Fix Qdrant; verify collections named `legal_*` |
| Frontend cannot call API | CORS / wrong `VITE_API_URL` | Check port 8000, restart Vite after `.env` change |
| `npm run dev` wrong cwd | Run from `frontend/` | `cd Vakeel-link-main\frontend` |
| Pip dependency hell on 3.13 | Old pins | Use current `requirements.txt` (loose ranges) |

### Sanity checks

```powershell
# Health
Invoke-RestMethod http://127.0.0.1:8000/health

# AI (after keys + Qdrant are valid)
$body = @{ query = "Consumer rights for a defective product in India" } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/v1/query/ask -Method POST -ContentType application/json -Body $body
```

You should see non-empty `citations` and a structured `analysis` when the pipeline is healthy.

---

## Security reminders

- Never commit `backend/.env` or real API keys.
- Service role key bypasses RLS — backend only.
- AI output is **not legal advice**; UI and API always return a disclaimer.
- Rotate keys if they were ever logged or shared.

---

## License / status

Hackathon / research prototype for Indian legal assistance workflows. Not a substitute for a licensed advocate.
