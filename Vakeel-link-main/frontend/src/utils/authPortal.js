/**
 * Remember client vs advocate portal across Login ↔ Signup navigation.
 * sessionStorage only (tab-scoped); never overrides a hard URL/state choice.
 */

const STORAGE_KEY = 'vakeellink_auth_portal';

/** @returns {'client' | 'lawyer'} */
export function normalizePortal(value) {
  if (!value) return 'client';
  const v = String(value).toLowerCase();
  if (v === 'lawyer' || v === 'advocate' || v === 'lawyers') return 'lawyer';
  if (v === 'client' || v === 'user' || v === 'clients') return 'client';
  return 'client';
}

/** @returns {'client' | 'lawyer' | null} */
export function readStoredPortal() {
  try {
    return normalizePortal(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** @param {'client' | 'lawyer' | string} portal */
export function writeStoredPortal(portal) {
  try {
    sessionStorage.setItem(STORAGE_KEY, normalizePortal(portal));
  } catch {
    // private mode / blocked storage
  }
}

/**
 * Resolve portal from route state, query, then remembered preference.
 * @param {{ state?: object, searchParams?: URLSearchParams }} opts
 * @returns {{ portal: 'client' | 'lawyer', locked: boolean }}
 */
export function resolveAuthPortal({ state, searchParams } = {}) {
  const fromState =
    state?.role != null
      ? normalizePortal(state.role)
      : state?.portal != null
        ? normalizePortal(state.portal)
        : null;

  const q = searchParams?.get?.('role') || searchParams?.get?.('portal');
  const fromQuery = q != null && String(q).trim() !== '' ? normalizePortal(q) : null;

  const stored = readStoredPortal();

  const portal = fromState || fromQuery || stored || 'client';
  // Freeze only after signup → login handoff (or explicit roleLocked).
  // Free visits can still switch Client / Advocate; URL ?role= still pre-selects.
  const locked = Boolean(state?.roleLocked);

  return { portal, locked };
}

export function loginPathForPortal(portal) {
  const p = normalizePortal(portal);
  return p === 'lawyer' ? '/login?role=lawyer' : '/login?role=client';
}

export function signupPathForPortal(portal) {
  const p = normalizePortal(portal);
  return p === 'lawyer' ? '/signup?role=lawyer' : '/signup?role=client';
}
