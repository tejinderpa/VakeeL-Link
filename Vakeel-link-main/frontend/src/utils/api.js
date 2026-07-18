/**
 * API base URL.
 * - Prefer VITE_API_URL when set (production / explicit override).
 * - In Vite dev, default to "" so requests stay same-origin and hit the
 *   proxy in vite.config.js (/api → http://127.0.0.1:8000). This avoids
 *   browser "Failed to fetch" from CORS / localhost vs 127.0.0.1 mismatches.
 * - Outside dev without env, fall back to loopback (not hostname "localhost",
 *   which can hang on Windows IPv6).
 */
function resolveApiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    return String(fromEnv).replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '';
  }
  return 'http://127.0.0.1:8000';
}

export const API_BASE_URL = resolveApiBase();

/** Human-readable hint when fetch() throws TypeError "Failed to fetch". */
export function networkErrorMessage(err, base = API_BASE_URL) {
  const raw = err?.message || String(err || '');
  const isNetwork =
    /failed to fetch|networkerror|load failed|network request failed/i.test(raw) ||
    err?.name === 'TypeError';
  if (!isNetwork) return raw || 'Request failed';

  const target = base || '(same origin / Vite proxy → port 8000)';
  const isRemote = /^https?:\/\//i.test(String(target)) && !/127\.0\.0\.1|localhost/i.test(String(target));

  // Production / hosted API — do not tell users to start uvicorn locally.
  if (isRemote || import.meta.env.PROD) {
    return (
      `Cannot reach the API at ${target}. ` +
      'The server may be waking up (free tier cold start — wait ~30–60s and retry), ' +
      'or CORS may block this site. On Render, set CORS_ORIGINS to your Vercel URL ' +
      '(https, no trailing slash), then retry.'
    );
  }

  return (
    `Cannot reach the API at ${target}. ` +
    'Start the backend on port 8000 (from Vakeel-link-main/backend: ' +
    'uvicorn app.main:app --reload --host 127.0.0.1 --port 8000), ' +
    'confirm http://127.0.0.1:8000/health returns ok, then retry. ' +
    'If the API is already running, restart the Vite dev server so the proxy reloads.'
  );
}

export function getToken() {
  return localStorage.getItem('vakeellink_token');
}

export function authHeaders(extra = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token && token !== 'mock_jwt_token') {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function hasRealToken() {
  const token = getToken();
  // Accept Supabase JWTs and offline local.* tokens issued when Supabase DNS is down
  return Boolean(token && token !== 'mock_jwt_token');
}

async function parseError(res) {
  let detail = res.statusText || 'Request failed';
  try {
    const body = await res.json();
    // Prefer explicit API envelope fields (error_handler uses message + detail)
    if (typeof body?.message === 'string' && body.message && body.error) {
      detail = body.detail && typeof body.detail === 'string'
        ? `${body.message}: ${body.detail}`
        : body.message;
    } else if (typeof body?.detail === 'string') {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      detail = body.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
    } else if (body?.message) {
      detail = body.message;
    }
  } catch {
    // ignore
  }
  if (res.status === 404) {
    detail = detail || 'Not found';
  } else if (res.status >= 500) {
    detail = detail || 'Server error — please try again shortly';
  }
  const err = new Error(detail);
  err.status = res.status;
  return err;
}

export async function apiGet(path, { auth = true } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: auth ? authHeaders() : { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPost(path, body, { auth = true } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: auth ? authHeaders() : { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPut(path, body, { auth = true } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: auth ? authHeaders() : { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * Absolute WebSocket URL.
 * - With VITE_API_URL: map http→ws / https→wss.
 * - Without (dev proxy): use current page host so Vite can upgrade /api WS.
 * Relative paths alone are rejected by many browsers for WebSocket().
 */
export function wsUrl(pathWithQuery) {
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  if (API_BASE_URL) {
    const base = API_BASE_URL.replace(/^http/, 'ws');
    return `${base}${path}`;
  }
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${path}`;
  }
  return `ws://127.0.0.1:8000${path}`;
}
