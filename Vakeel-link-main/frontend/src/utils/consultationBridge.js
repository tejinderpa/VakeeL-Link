/**
 * Shared consultation inbox so client bookings appear on the lawyer portal
 * (same browser localStorage). Supports unread / new-request highlighting.
 */

import { upsertLocalConsultation, updateLocalConsultationStatus as updateLocalStatus } from './lawyerWorkspace';
import { appendClientConsultation } from './clientCatalog';
import { DEMO_LAWYERS } from './clientCatalog';

const SHARED_KEY = 'vakeellink_shared_consultations';
const READ_KEY = 'vakeellink_lawyer_read_consult_ids';
const EVENT = 'vakeellink-consultations-updated';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix = 'booking') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function notify() {
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // ignore
  }
}

export function onConsultationsUpdated(handler) {
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

function listSharedRaw() {
  const rows = readJson(SHARED_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

function saveShared(rows) {
  writeJson(SHARED_KEY, rows.slice(0, 200));
  notify();
}

export function getReadConsultIds() {
  const ids = readJson(READ_KEY, []);
  return new Set(Array.isArray(ids) ? ids.map(String) : []);
}

export function markConsultationRead(id) {
  if (!id) return;
  const set = getReadConsultIds();
  set.add(String(id));
  writeJson(READ_KEY, Array.from(set));
  notify();
}

export function markConsultationsRead(ids = []) {
  const set = getReadConsultIds();
  ids.forEach((id) => set.add(String(id)));
  writeJson(READ_KEY, Array.from(set));
  notify();
}

/**
 * Resolve all lawyer ids this advocate should receive bookings for:
 * own auth id + all demo catalog ids (so demo bookings always surface offline).
 */
export function resolveLawyerInboxIds(user) {
  const ids = new Set();
  if (user?.id) ids.add(String(user.id));
  if (user?.email) ids.add(String(user.email).toLowerCase());

  // Always include demo lawyer catalog ids for any logged-in advocate.
  // Client bookings use demo-lawyer-* ids; without this, the lawyer portal stays empty.
  DEMO_LAWYERS.forEach((d) => {
    if (d?.id) ids.add(String(d.id));
  });

  return ids;
}

/**
 * Client books a consultation — visible on client list AND lawyer inbox.
 */
export function bookConsultationForLawyer({
  lawyerId,
  lawyerName,
  domain,
  clientMessage,
  mode = 'chat',
  clientName,
  clientId,
  status = 'pending',
  apiId = null,
}) {
  const id = apiId || uid('booking');
  const now = new Date().toISOString();
  const row = {
    id,
    status,
    domain: domain || 'general',
    client_message: clientMessage || '',
    lawyer_id: String(lawyerId),
    lawyer_name: lawyerName || 'Advocate',
    client_name: clientName || 'Client',
    user_id: clientId || 'client_local',
    mode: mode || 'chat',
    created_at: now,
    updated_at: now,
    scheduled_at: null,
    meeting_url: '',
    location: '',
    source: 'client_booking',
    unread: true,
    demo: false,
  };

  // Shared inbox (source of truth for cross-role same browser)
  const shared = listSharedRaw();
  const existingIdx = shared.findIndex((c) => String(c.id) === String(id));
  if (existingIdx >= 0) shared[existingIdx] = { ...shared[existingIdx], ...row };
  else shared.unshift(row);
  saveShared(shared);

  // Lawyer workspace store (by lawyer_id)
  try {
    upsertLocalConsultation(row);
  } catch {
    // ignore
  }

  // Client "My Consultations" list (does not wipe seeds)
  try {
    appendClientConsultation(row);
  } catch {
    // ignore
  }

  return row;
}

/** All shared bookings (raw). */
export function listSharedConsultations() {
  return listSharedRaw();
}

/**
 * Lawyer inbox: ALL shared client bookings for logged-in lawyers (demo-safe),
 * plus rows matching this advocate's ids.
 */
export function listLawyerInbox(user) {
  const isLawyer =
    !user?.role ||
    String(user.role).toLowerCase() === 'lawyer' ||
    String(user.role).toLowerCase() === 'advocate';

  const inboxIds = resolveLawyerInboxIds(user);
  const shared = listSharedRaw().filter((c) => {
    if (!isLawyer) return false;
    const lid = String(c.lawyer_id || '');
    // Match assigned lawyer OR any client_booking (offline multi-account demo)
    if (inboxIds.has(lid)) return true;
    if (c.source === 'client_booking' || String(c.id || '').startsWith('booking_')) return true;
    if (lid.startsWith('demo-lawyer')) return true;
    // Name match fallback
    const lname = String(c.lawyer_name || '').toLowerCase();
    const uname = String(user?.name || user?.full_name || '').toLowerCase();
    if (
      uname &&
      lname &&
      (lname.includes(uname.replace(/^adv\.?\s*/i, '')) ||
        uname.includes(lname.replace(/^adv\.?\s*/i, '')))
    ) {
      return true;
    }
    return false;
  });

  const read = getReadConsultIds();
  return shared
    .map((c) => ({
      ...c,
      unread:
        c.unread !== false &&
        String(c.status || '').toLowerCase() === 'pending' &&
        !read.has(String(c.id)),
    }))
    .sort((a, b) => {
      // Unread pending first, then newest
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
}

export function countUnreadForLawyer(user) {
  return listLawyerInbox(user).filter((c) => c.unread).length;
}

export function updateSharedConsultationStatus(id, status) {
  const shared = listSharedRaw();
  const idx = shared.findIndex((c) => String(c.id) === String(id));
  if (idx >= 0) {
    shared[idx] = {
      ...shared[idx],
      status,
      unread: false,
      updated_at: new Date().toISOString(),
    };
    saveShared(shared);
  }
  try {
    updateLocalStatus(id, status);
  } catch {
    // ignore
  }
  markConsultationRead(id);
  return shared[idx] || null;
}

/**
 * Merge remote API rows + lawyer inbox + local demos into one list for the lawyer UI.
 */
export function mergeLawyerConsultationSources({ user, remoteRows = [], localRows = [] }) {
  const byId = new Map();
  const put = (row) => {
    if (!row?.id) return;
    const id = String(row.id);
    const prev = byId.get(id) || {};
    byId.set(id, { ...prev, ...row, id });
  };

  (localRows || []).forEach(put);
  listLawyerInbox(user).forEach(put);
  (remoteRows || []).forEach(put);

  const read = getReadConsultIds();
  return Array.from(byId.values())
    .map((c) => {
      const status = String(c.status || 'pending').toLowerCase();
      const unread =
        status === 'pending' &&
        !read.has(String(c.id)) &&
        (c.unread !== false || c.source === 'client_booking');
      return { ...c, status, unread };
    })
    .sort((a, b) => {
      if (Boolean(a.unread) !== Boolean(b.unread)) return a.unread ? -1 : 1;
      return String(b.created_at || b.createdAt || '').localeCompare(
        String(a.created_at || a.createdAt || '')
      );
    });
}
