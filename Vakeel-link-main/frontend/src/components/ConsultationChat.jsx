import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Wifi, WifiOff, Loader2, Clock } from 'lucide-react';
import useAuth from './useAuth';
import { API_BASE_URL, apiGet, apiPost, getToken, networkErrorMessage, wsUrl } from '../utils/api';
import {
  appendChatMessage,
  clearOutboxItem,
  enqueueOutbox,
  listChatMessages,
  listOutbox,
  upsertChatMessages,
} from '../utils/chatStore';

/**
 * Build candidate WebSocket URLs (proxy first, then direct API).
 * Free self-hosted path — no third-party realtime service.
 */
function buildWsCandidates(consultationId, token) {
  const path = `/api/v1/chat/ws/${encodeURIComponent(consultationId)}?token=${encodeURIComponent(token)}`;
  const urls = [];
  const primary = wsUrl(path);
  urls.push(primary);

  // Direct backend fallback if Vite WS proxy fails
  const direct = `ws://127.0.0.1:8000${path}`;
  if (!urls.includes(direct)) urls.push(direct);

  if (API_BASE_URL) {
    const mapped = `${API_BASE_URL.replace(/^http/, 'ws')}${path}`;
    if (!urls.includes(mapped)) urls.push(mapped);
  }
  return urls;
}

/**
 * Real-time client ↔ lawyer chat over WebSocket, with REST history/send
 * fallback so messages still flow when the socket is offline.
 */
export default function ConsultationChat({
  consultationId,
  title = 'Consultation chat',
  onClose,
}) {
  const { user } = useAuth();
  const currentUserId = user?.id || user?.email || 'local-user';
  const [messages, setMessages] = useState(() => listChatMessages(consultationId));
  const [input, setInput] = useState('');
  const [connState, setConnState] = useState('connecting');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);
  const wsRef = useRef(null);
  const listRef = useRef(null);
  const pingRef = useRef(null);
  const closedRef = useRef(false);
  const sendingLockRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const urlIndexRef = useRef(0);

  const refreshLocal = useCallback(() => {
    setMessages(listChatMessages(consultationId));
  }, [consultationId]);

  const mergeServerMessages = useCallback(
    (rows) => {
      if (!Array.isArray(rows) || !rows.length) return;
      upsertChatMessages(
        consultationId,
        rows.map((m) => ({
          id: m.id,
          client_msg_id: m.client_msg_id || null,
          consultation_id: m.consultation_id || consultationId,
          sender_id: m.sender_id,
          message: m.message,
          created_at: m.created_at,
          pending: false,
          queued: false,
        }))
      );
      setMessages(listChatMessages(consultationId));
    },
    [consultationId]
  );

  const pullHistoryRest = useCallback(async () => {
    const token = getToken();
    if (!token || token === 'mock_jwt_token' || !consultationId) return;
    try {
      const data = await apiGet(
        `/api/v1/chat/consultations/${encodeURIComponent(consultationId)}/messages`
      );
      mergeServerMessages(data?.messages || []);
    } catch {
      // stay on local cache
    }
  }, [consultationId, mergeServerMessages]);

  const flushOutbox = useCallback(
    async (ws) => {
      const pending = listOutbox(consultationId);
      if (!pending.length) return;

      for (const item of pending) {
        const client_msg_id = item.client_msg_id || item.id;
        const body = {
          message: item.message,
          client_msg_id,
        };
        let delivered = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(body));
            delivered = true;
          } catch {
            delivered = false;
          }
        }
        if (!delivered) {
          try {
            await apiPost(
              `/api/v1/chat/consultations/${encodeURIComponent(consultationId)}/messages`,
              body
            );
            delivered = true;
          } catch {
            delivered = false;
          }
        }
        if (delivered) {
          clearOutboxItem(consultationId, item.id);
        }
      }

      const rows = listChatMessages(consultationId).map((m) =>
        m.queued || m.pending ? { ...m, queued: false, pending: false } : m
      );
      upsertChatMessages(consultationId, rows);
      refreshLocal();
    },
    [consultationId, refreshLocal]
  );

  useEffect(() => {
    if (!consultationId) return undefined;
    closedRef.current = false;
    reconnectAttemptRef.current = 0;
    urlIndexRef.current = 0;

    const boot = window.setTimeout(() => {
      setMessages(listChatMessages(consultationId));
    }, 0);

    const token = getToken();
    if (!token || token === 'mock_jwt_token') {
      const t = window.setTimeout(() => {
        setConnState('offline');
        setError('Sign in required for live chat between lawyer and client.');
        setInfo('Messages stay on this device only until you sign in.');
      }, 0);
      return () => {
        window.clearTimeout(boot);
        window.clearTimeout(t);
      };
    }

    pullHistoryRest();

    let reconnectTimer;
    let pollTimer;
    const candidates = buildWsCandidates(consultationId, token);

    const clearPing = () => {
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
    };

    const connect = () => {
      if (closedRef.current) return;
      setConnState((s) => (s === 'live' ? s : 'connecting'));

      const idx = urlIndexRef.current % candidates.length;
      const url = candidates[idx];

      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        // Try next candidate
        urlIndexRef.current += 1;
        if (urlIndexRef.current < candidates.length * 2) {
          reconnectTimer = window.setTimeout(connect, 400);
          return;
        }
        setConnState('offline');
        setInfo(
          networkErrorMessage(err) ||
            'Live socket unavailable. Messages still send over the free HTTP API.'
        );
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (closedRef.current) return;
        reconnectAttemptRef.current = 0;
        setConnState('live');
        setError('');
        setInfo('');
        flushOutbox(ws);
        clearPing();
        pingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ ping: true }));
            } catch {
              // ignore
            }
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.pong) return;
          if (data?.type === 'history') {
            mergeServerMessages(Array.isArray(data.messages) ? data.messages : []);
            return;
          }
          if (data?.type === 'message' || (data?.id && data?.message)) {
            appendChatMessage(consultationId, {
              id: data.id,
              client_msg_id: data.client_msg_id || null,
              consultation_id: data.consultation_id || consultationId,
              sender_id: data.sender_id,
              message: data.message,
              created_at: data.created_at,
              pending: false,
              queued: false,
            });
            setMessages(listChatMessages(consultationId));
            return;
          }
          if (data?.type === 'error') {
            setError(data.detail || 'Chat error');
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        setInfo('Connecting… trying alternate live route if needed.');
      };

      ws.onclose = (ev) => {
        clearPing();
        if (closedRef.current) return;

        // Auth failures: stop retrying that path
        if (ev.code === 4001) {
          setConnState('offline');
          setError('Session invalid for live chat. Sign out and sign in again.');
          return;
        }
        if (ev.code === 4003) {
          setConnState('offline');
          setError('You are not a participant on this consultation.');
          return;
        }

        // Rotate URL candidate on early failure (proxy → direct API)
        if (reconnectAttemptRef.current < 2) {
          urlIndexRef.current += 1;
        }

        setConnState('offline');
        setInfo('Reconnecting… messages still deliver over the API while offline.');
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delay = Math.min(8000, 900 * attempt);
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    // REST poll keeps both sides in sync if WS drops
    pollTimer = window.setInterval(() => {
      if (closedRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        pullHistoryRest();
      }
    }, 3000);

    const onStorage = (e) => {
      if (e.key === 'vakeellink_chat_messages') {
        setMessages(listChatMessages(consultationId));
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      closedRef.current = true;
      window.clearTimeout(boot);
      window.removeEventListener('storage', onStorage);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      clearPing();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [consultationId, flushOutbox, mergeServerMessages, pullHistoryRest]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sendingLockRef.current) return;

    sendingLockRef.current = true;
    setSending(true);

    const client_msg_id = `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const created_at = new Date().toISOString();

    appendChatMessage(consultationId, {
      id: client_msg_id,
      client_msg_id,
      sender_id: currentUserId,
      message: text,
      created_at,
      pending: true,
      queued: false,
    });
    setMessages(listChatMessages(consultationId));
    setInput('');

    const payload = { message: text, client_msg_id };
    let delivered = false;
    const ws = wsRef.current;

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
        delivered = true;
      } catch {
        delivered = false;
      }
    }

    if (!delivered) {
      try {
        const saved = await apiPost(
          `/api/v1/chat/consultations/${encodeURIComponent(consultationId)}/messages`,
          payload
        );
        appendChatMessage(consultationId, {
          id: saved.id || client_msg_id,
          client_msg_id,
          sender_id: saved.sender_id || currentUserId,
          message: saved.message || text,
          created_at: saved.created_at || created_at,
          pending: false,
          queued: false,
        });
        setMessages(listChatMessages(consultationId));
        delivered = true;
        if (connState !== 'live') {
          setInfo('Sent via API. Peer receives on live link or next refresh.');
        }
      } catch (err) {
        enqueueOutbox(consultationId, text, currentUserId);
        appendChatMessage(consultationId, {
          id: client_msg_id,
          client_msg_id,
          sender_id: currentUserId,
          message: text,
          created_at,
          pending: true,
          queued: true,
        });
        setMessages(listChatMessages(consultationId));
        setInfo(
          networkErrorMessage(err) ||
            'Message queued offline. It will send when chat is live again.'
        );
      }
    } else {
      window.setTimeout(() => {
        const rows = listChatMessages(consultationId).map((m) =>
          m.client_msg_id === client_msg_id ? { ...m, pending: false } : m
        );
        upsertChatMessages(consultationId, rows);
        setMessages(listChatMessages(consultationId));
      }, 600);
    }

    window.setTimeout(() => {
      sendingLockRef.current = false;
      setSending(false);
    }, 350);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-md supports-[backdrop-filter]:bg-slate-900/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[min(100dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:h-[560px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-[#0f2d5e] px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <MessageCircle size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{title}</h3>
              <p className="flex items-center gap-1.5 text-[11px] text-blue-200">
                {connState === 'live' && (
                  <>
                    <Wifi size={12} /> Live · WebSocket
                  </>
                )}
                {connState === 'connecting' && (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Connecting…
                  </>
                )}
                {connState === 'offline' && (
                  <>
                    <WifiOff size={12} /> Offline · API sync on
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close chat"
          >
            <X size={18} />
          </button>
        </header>

        {error && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{error}</div>
        )}
        {info && !error && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-800">{info}</div>
        )}

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No messages yet. Say hello — messages sync live between lawyer and client.
            </p>
          )}
          {messages.map((msg) => {
            const mine =
              currentUserId &&
              (msg.sender_id === currentUserId ||
                String(msg.sender_id) === String(user?.id) ||
                String(msg.sender_id) === String(user?.email));
            return (
              <div
                key={msg.id || msg.client_msg_id || `${msg.created_at}-${msg.message}`}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    mine
                      ? 'rounded-br-md bg-blue-700 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
                  <div
                    className={`mt-1 flex items-center gap-2 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}
                  >
                    {msg.created_at && (
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    {(msg.queued || msg.pending) && mine && (
                      <span className="inline-flex items-center gap-0.5 opacity-90">
                        <Clock size={10} /> {msg.queued ? 'Queued' : 'Sending'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connState === 'live' ? 'Type a message…' : 'Write a message…'}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
