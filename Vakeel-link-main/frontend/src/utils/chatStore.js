/**
 * Local chat persistence + outbox queue for offline consultation messaging.
 * Messages stay available when WebSocket is down; outbox flushes when live again.
 * Dedupes optimistic sends so "hi" does not appear twice when the server echoes.
 */

const MESSAGES_KEY = 'vakeellink_chat_messages';
const OUTBOX_KEY = 'vakeellink_chat_outbox';

function readMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function writeMap(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function contentKey(m) {
  return `${String(m?.sender_id || '')}|${String(m?.message || '').trim()}`.toLowerCase();
}

/**
 * Merge message lists without duplicates.
 * Prefers server ids; collapses pending optimistic rows when a real echo arrives.
 */
export function mergeMessageLists(...lists) {
  const byId = new Map();
  const byClient = new Map();
  const byContent = new Map(); // contentKey → id (for recent pending collapse)

  const put = (m) => {
    if (!m || !String(m.message || '').trim()) return;
    const id = m.id || m.client_msg_id || `${m.sender_id}-${m.created_at}-${m.message}`;
    const row = {
      ...m,
      id,
      message: String(m.message).trim(),
      pending: Boolean(m.pending),
      queued: Boolean(m.queued),
    };

    // Same client_msg_id → replace (optimistic → server)
    if (row.client_msg_id && byClient.has(row.client_msg_id)) {
      const prevId = byClient.get(row.client_msg_id);
      const prev = byId.get(prevId);
      byId.delete(prevId);
      const merged = {
        ...prev,
        ...row,
        // Prefer non-pending / server id
        pending: row.pending && prev?.pending,
        queued: row.queued && prev?.queued,
        id: row.pending && prev && !prev.pending ? prev.id : row.id,
      };
      // Prefer server-looking id when available
      if (prev && !String(prev.id).startsWith('local_') && !String(prev.id).startsWith('outbox_') && row.pending) {
        merged.id = prev.id;
        merged.pending = false;
        merged.queued = false;
      }
      if (row && !String(row.id).startsWith('local_') && !String(row.id).startsWith('outbox_')) {
        merged.id = row.id;
        merged.pending = false;
        merged.queued = false;
        merged.created_at = row.created_at || prev?.created_at;
      }
      byId.set(merged.id, merged);
      byClient.set(row.client_msg_id, merged.id);
      byContent.set(contentKey(merged), merged.id);
      return;
    }

    // Pending + matching content from same sender within ~45s → treat as same message
    const ck = contentKey(row);
    if (byContent.has(ck)) {
      const prevId = byContent.get(ck);
      const prev = byId.get(prevId);
      if (prev) {
        const tPrev = new Date(prev.created_at || 0).getTime();
        const tNext = new Date(row.created_at || 0).getTime();
        const close = Math.abs(tPrev - tNext) < 45_000 || prev.pending || row.pending;
        if (close) {
          const keepServer =
            !String(row.id).startsWith('local_') && !String(row.id).startsWith('outbox_')
              ? row
              : !String(prev.id).startsWith('local_') && !String(prev.id).startsWith('outbox_')
                ? prev
                : row;
          const merged = {
            ...prev,
            ...row,
            ...keepServer,
            id: keepServer.id,
            client_msg_id: row.client_msg_id || prev.client_msg_id,
            pending: false,
            queued: false,
            created_at: prev.created_at || row.created_at,
          };
          byId.delete(prevId);
          byId.set(merged.id, merged);
          if (merged.client_msg_id) byClient.set(merged.client_msg_id, merged.id);
          byContent.set(ck, merged.id);
          return;
        }
      }
    }

    if (byId.has(id)) {
      const prev = byId.get(id);
      byId.set(id, {
        ...prev,
        ...row,
        pending: row.pending && prev.pending,
        queued: row.queued && prev.queued,
      });
    } else {
      byId.set(id, row);
    }
    if (row.client_msg_id) byClient.set(row.client_msg_id, id);
    byContent.set(ck, id);
  };

  lists.flat().forEach(put);

  return Array.from(byId.values()).sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || ''))
  );
}

export function listChatMessages(consultationId) {
  if (!consultationId) return [];
  const map = readMap(MESSAGES_KEY);
  const rows = map[String(consultationId)] || [];
  return mergeMessageLists(Array.isArray(rows) ? rows : []);
}

export function upsertChatMessages(consultationId, messages) {
  if (!consultationId) return [];
  const map = readMap(MESSAGES_KEY);
  const key = String(consultationId);
  const existing = map[key] || [];
  const merged = mergeMessageLists(existing, messages || []).slice(-200);
  map[key] = merged;
  writeMap(MESSAGES_KEY, map);
  return merged;
}

export function appendChatMessage(consultationId, message) {
  const next = {
    id: message.id || message.client_msg_id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    consultation_id: consultationId,
    sender_id: message.sender_id,
    message: String(message.message || '').trim(),
    created_at: message.created_at || new Date().toISOString(),
    pending: Boolean(message.pending),
    queued: Boolean(message.queued),
    client_msg_id: message.client_msg_id || null,
  };
  return upsertChatMessages(consultationId, [next]);
}

export function enqueueOutbox(consultationId, text, senderId) {
  const map = readMap(OUTBOX_KEY);
  const key = String(consultationId);
  const client_msg_id = `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item = {
    id: client_msg_id,
    client_msg_id,
    consultation_id: consultationId,
    sender_id: senderId,
    message: String(text || '').trim(),
    created_at: new Date().toISOString(),
  };
  // Avoid double-queueing identical pending text
  const existingOut = map[key] || [];
  if (
    existingOut.some(
      (o) =>
        o.sender_id === senderId &&
        String(o.message || '').trim() === item.message &&
        Date.now() - new Date(o.created_at || 0).getTime() < 5000
    )
  ) {
    return existingOut.find((o) => o.message === item.message);
  }
  map[key] = [...existingOut, item];
  writeMap(OUTBOX_KEY, map);
  appendChatMessage(consultationId, { ...item, pending: true, queued: true });
  return item;
}

export function listOutbox(consultationId) {
  const map = readMap(OUTBOX_KEY);
  return map[String(consultationId)] || [];
}

export function clearOutboxItem(consultationId, id) {
  const map = readMap(OUTBOX_KEY);
  const key = String(consultationId);
  map[key] = (map[key] || []).filter((m) => m.id !== id && m.client_msg_id !== id);
  writeMap(OUTBOX_KEY, map);
}

export function clearOutbox(consultationId) {
  const map = readMap(OUTBOX_KEY);
  delete map[String(consultationId)];
  writeMap(OUTBOX_KEY, map);
}

/** Format long case notes into readable paragraphs for display. */
export function formatReadableText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return [];
  let parts = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].length > 220) {
    const sentences = parts[0].match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [parts[0]];
    const chunks = [];
    let buf = '';
    sentences.forEach((s) => {
      const next = `${buf} ${s}`.trim();
      if (next.length > 180 && buf) {
        chunks.push(buf);
        buf = s.trim();
      } else {
        buf = next;
      }
    });
    if (buf) chunks.push(buf);
    parts = chunks;
  }
  return parts.map((p) => p.replace(/\s+/g, ' ').trim());
}
