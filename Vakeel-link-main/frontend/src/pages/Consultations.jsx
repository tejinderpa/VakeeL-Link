import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import ConsultationChat from '../components/ConsultationChat';
import { apiGet, apiPost, hasRealToken } from '../utils/api';
import {
  isOpenStatus,
  isPastStatus,
  mapConsultationForClient,
  statusBadgeClass,
  statusLabel,
  normalizeStatus,
} from '../utils/consultationStatus';
import {
  listClientConsultations,
  mergeClientConsultations,
  updateClientConsultationStatus,
} from '../utils/clientCatalog';

export default function Consultations() {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [chatTarget, setChatTarget] = useState(null);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadConsultations = useCallback(async () => {
    setLoading(true);
    // Always start with local demos so the page is never empty
    let apiRows = [];
    try {
      if (hasRealToken()) {
        const payload = await apiGet('/api/v1/consultations/mine');
        apiRows = payload?.data || [];
      }
    } catch (err) {
      setToast(err.message || 'Live consultations unavailable — showing demo bookings');
    } finally {
      const merged = mergeClientConsultations(apiRows).map(mapConsultationForClient);
      // If still empty, force seed read
      setConsultations(merged.length ? merged : listClientConsultations().map(mapConsultationForClient));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => loadConsultations(), 0);
    return () => window.clearTimeout(t);
  }, [loadConsultations]);

  const upcoming = useMemo(
    () => consultations.filter((c) => isOpenStatus(c.status)),
    [consultations]
  );
  const past = useMemo(
    () => consultations.filter((c) => isPastStatus(c.status)),
    [consultations]
  );

  const handleJoinMeeting = (cons) => {
    if (cons.meetingUrl) {
      window.open(cons.meetingUrl, '_blank', 'noopener,noreferrer');
      setToast('Opening meeting link');
      return;
    }
    setToast('Meeting link not available yet');
  };

  const handleViewLocation = (cons) => {
    const query = cons.location || `${cons.lawyerName} law chamber`;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      '_blank',
      'noopener,noreferrer'
    );
    setToast('Opening location in Maps');
  };

  const handleCancel = async (cons) => {
    setActionId(cons.id);
    try {
      if (!String(cons.id).startsWith('demo-') && hasRealToken()) {
        await apiPost(`/api/v1/consultations/${cons.id}/cancel`);
      } else {
        updateClientConsultationStatus(cons.id, 'cancelled');
      }
      setToast('Consultation cancelled');
      await loadConsultations();
    } catch {
      updateClientConsultationStatus(cons.id, 'cancelled');
      setToast('Consultation cancelled (offline)');
      await loadConsultations();
    } finally {
      setActionId(null);
    }
  };

  const handleComplete = async (cons) => {
    setActionId(cons.id);
    try {
      if (!String(cons.id).startsWith('demo-') && hasRealToken()) {
        await apiPost(`/api/v1/consultations/${cons.id}/complete`);
      } else {
        updateClientConsultationStatus(cons.id, 'completed');
      }
      setToast('Marked completed');
      await loadConsultations();
    } catch {
      updateClientConsultationStatus(cons.id, 'completed');
      setToast('Marked completed (offline)');
      await loadConsultations();
    } finally {
      setActionId(null);
    }
  };

  const renderCard = (cons) => {
    const status = normalizeStatus(cons.status);
    const busy = actionId === cons.id;

    return (
      <div
        key={cons.id}
        className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          {cons.type === 'Video Call' ? (
            <Video size={24} />
          ) : cons.type === 'In-person' ? (
            <MapPin size={24} />
          ) : (
            <MessageCircle size={24} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{cons.lawyerName}</h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(status)}`}
            >
              <CheckCircle2 size={12} />
              {statusLabel(status)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {cons.specialization} · {cons.type}
          </p>
          {cons.clientMessage && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{cons.clientMessage}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-600" />
              {cons.date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} className="text-blue-600" />
              {cons.time}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          {status === 'active' && (
            <button
              type="button"
              onClick={() => setChatTarget(cons)}
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
            >
              Open chat
            </button>
          )}
          {status === 'active' && cons.meetingUrl && (
            <button
              type="button"
              onClick={() => handleJoinMeeting(cons)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Join meeting
            </button>
          )}
          {status === 'active' && cons.type === 'In-person' && (
            <button
              type="button"
              onClick={() => handleViewLocation(cons)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              View location
            </button>
          )}
          {status === 'active' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleComplete(cons)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Complete
            </button>
          )}
          {(status === 'pending' || status === 'active') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleCancel(cons)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 md:pl-[260px] lg:pl-[280px]">
        <div className="mx-auto max-w-[1440px] p-4 md:p-8">
          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-[#0f2d5e] via-[#163a75] to-[#0f2d5e] px-6 py-8 text-white shadow-sm md:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">Client desk</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">My Consultations</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100/90">
                  Demo bookings stay visible so you can explore chat and status flows. New requests you create are added on top without removing demos.
                </p>
              </div>
              <button
                type="button"
                onClick={loadConsultations}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
              >
                Refresh
              </button>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 max-w-md">
              <div className="rounded-xl bg-white/10 px-3 py-2 text-center ring-1 ring-white/10">
                <p className="text-xl font-black">{upcoming.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Open</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2 text-center ring-1 ring-white/10">
                <p className="text-xl font-black">{past.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Past</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2 text-center ring-1 ring-white/10">
                <p className="text-xl font-black">{consultations.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Total</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
              <p className="mt-3 text-sm">Loading consultations…</p>
            </div>
          ) : (
            <>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#0f2d5e]">Upcoming & active</h2>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {upcoming.length} open
                  </span>
                </div>

                {upcoming.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
                    <AlertCircle className="mx-auto text-slate-400" size={28} />
                    <h3 className="mt-3 text-base font-semibold text-slate-900">No open consultations</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Find a lawyer and request a consultation to get started.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">{upcoming.map(renderCard)}</div>
                )}
              </section>

              <section className="mt-10 space-y-4">
                <h2 className="text-lg font-semibold text-[#0f2d5e]">Past consultations</h2>
                {past.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                      <AlertCircle size={24} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-slate-900">No history yet</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Completed or cancelled consultations will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">{past.map(renderCard)}</div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {chatTarget && (
        <ConsultationChat
          consultationId={chatTarget.id}
          title={`Chat with ${chatTarget.lawyerName}`}
          onClose={() => setChatTarget(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
