import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Star,
  Verified,
  MapPin,
  Briefcase,
  Calendar,
  MessageSquare,
  ShieldCheck,
  Scale,
  Shield,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import useAuth from '../components/useAuth';
import { apiGet, apiPost, hasRealToken } from '../utils/api';
import {
  getDemoLawyerById,
  getPublishedLawyerById,
  normalizeLawyerCard,
  onLawyersCatalogUpdated,
} from '../utils/clientCatalog';
import { bookConsultationForLawyer } from '../utils/consultationBridge';

export default function LawyerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lawyer, setLawyer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showBook, setShowBook] = useState(false);
  const [domain, setDomain] = useState('');
  const [message, setMessage] = useState('');
  const [booking, setBooking] = useState(false);
  const [toast, setToast] = useState('');

  const CASE_TYPE_OPTIONS = [
    { value: 'family', label: 'Family / matrimonial', plain: 'Divorce, custody, maintenance' },
    { value: 'labour', label: 'Labour / employment', plain: 'Salary, termination, PF' },
    { value: 'criminal', label: 'Criminal / police', plain: 'FIR, bail, complaints' },
    { value: 'property', label: 'Property / land', plain: 'Title, rent, partition' },
    { value: 'consumer', label: 'Consumer / services', plain: 'Bank, product, insurance' },
    { value: 'general', label: 'General civil', plain: 'Not sure — general advice' },
  ];

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const applyCard = (card) => {
      if (!card) return;
      setLawyer({
        ...card,
        specialization: card.specializationLabel || card.specialization,
        specializationRaw: card.specialization,
      });
      setDomain(card.specialization || 'general');
    };

    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      // 1) Published profile edits from lawyer portal (highest priority for live updates)
      const published = getPublishedLawyerById(id);
      // 2) Demo catalog for stable demo ids
      const demo = getDemoLawyerById(id);
      if (published) applyCard(published);
      else if (demo) applyCard(demo);

      try {
        const data = await apiGet(`/api/v1/lawyers/${id}`, { auth: false });
        const card = normalizeLawyerCard(data);
        // Published local edits still win over stale API
        const final = published ? normalizeLawyerCard({ ...card, ...published }) : card;
        applyCard(final);
      } catch (err) {
        if (!published && !demo) {
          setError(err.message || 'Failed to load profile');
          setLawyer(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
    // Re-apply when lawyer saves profile in another tab / same session
    const unsub = onLawyersCatalogUpdated(() => {
      const published = getPublishedLawyerById(id);
      if (published) applyCard(published);
    });
    return unsub;
  }, [id]);

  const openBookModal = () => {
    if (!user) {
      navigate('/login?role=client', { state: { from: `/lawyers/${id}` } });
      return;
    }
    if (user.role === 'lawyer') {
      setToast('Switch to a client account to request consultations.');
      return;
    }
    if (!user) {
      navigate('/login?role=client', { state: { from: `/lawyers/${id}` } });
      return;
    }
    // Allow offline / local-token clients to book (bridge + local API store)
    setShowBook(true);
  };

  const handleBook = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      setToast('Please select a case type so we route the right matter');
      return;
    }
    setBooking(true);
    try {
      const clientMessage = message
        .trim()
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n\n');
      const domainVal = domain.trim().toLowerCase();
      let apiId = null;
      let apiOk = false;

      // Always try backend first (handles local-auth + demo lawyer ids via file store)
      if (hasRealToken()) {
        try {
          const created = await apiPost('/api/v1/consultations/', {
            lawyer_id: id,
            domain: domainVal,
            client_message: clientMessage || undefined,
            mode: 'chat',
            client_name: user?.name || user?.full_name || user?.email || 'Client',
            lawyer_name: lawyer?.name || 'Advocate',
          });
          apiId = created?.id || created?.data?.id || null;
          apiOk = true;
        } catch (apiErr) {
          console.warn('Consultation API failed, using local bridge', apiErr);
        }
      }

      // Always write shared local inbox so lawyer portal sees it even if API missed
      bookConsultationForLawyer({
        lawyerId: id,
        lawyerName: lawyer?.name,
        domain: domainVal,
        clientMessage,
        mode: 'chat',
        clientName: user?.name || user?.full_name || user?.email || 'Client',
        clientId: user?.id || null,
        status: 'pending',
        apiId,
      });

      setShowBook(false);
      setToast(
        apiOk
          ? 'Consultation requested — lawyer can refresh Consultations to accept'
          : 'Consultation saved offline — lawyer will see it after Refresh'
      );
      setTimeout(() => navigate('/consultations'), 900);
    } catch (err) {
      setToast(err.message || 'Could not request consultation');
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8ff]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
          <p className="text-sm font-medium">Loading lawyer profile…</p>
        </div>
      </div>
    );
  }

  if (!lawyer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#faf8ff]">
        <div className="rounded-full bg-rose-50 p-6 text-rose-600">
          <Shield size={40} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#0f2d5e]">Profile unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">{error || 'Could not load this lawyer.'}</p>
        </div>
        <Link
          to="/lawyers"
          className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Return to directory
        </Link>
      </div>
    );
  }

  const nameParts = (lawyer.name || 'A').split(' ').filter(Boolean);
  const monogram = (nameParts[1] || nameParts[0] || 'A').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#faf8ff] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 md:pl-[260px] lg:pl-[280px]">
        <div className="border-b border-slate-200 bg-gradient-to-r from-[#0f2d5e] via-[#163a75] to-[#0f2d5e] px-4 pb-24 pt-10 md:px-8">
          <Link to="/lawyers" className="text-sm font-medium text-blue-200 hover:text-white">
            ← Back to directory
          </Link>
        </div>

        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <section className="-mt-16 space-y-8 pb-20">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
              <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
                <div className="relative shrink-0">
                  <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-slate-100 text-4xl font-black text-[#0f2d5e] shadow-md md:h-40 md:w-40">
                    {lawyer.avatar ? (
                      <img src={lawyer.avatar} alt={lawyer.name} className="h-full w-full object-cover" />
                    ) : (
                      monogram
                    )}
                  </div>
                  {lawyer.is_online && (
                    <div className="absolute -bottom-2 -right-2 flex items-center gap-1.5 rounded-full border-2 border-white bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      Online
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 text-center md:text-left">
                  <div className="flex flex-col items-center gap-2 md:flex-row md:items-center md:gap-3">
                    <h1 className="text-3xl font-bold tracking-tight text-[#0f2d5e] md:text-4xl">
                      {lawyer.name}
                    </h1>
                    {lawyer.is_verified !== false && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        <ShieldCheck size={12} /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-lg font-semibold text-slate-600">{lawyer.specialization}</p>

                  <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
                    {lawyer.location && (
                      <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                        <MapPin size={14} className="text-blue-600" />
                        {lawyer.location}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      <Briefcase size={14} className="text-blue-600" />
                      {lawyer.experience_years}+ yrs practice
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-center gap-3 md:justify-start">
                    <div className="flex items-center gap-0.5 text-amber-500">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={18}
                          fill={s <= Math.round(lawyer.rating || 0) ? 'currentColor' : 'none'}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-bold text-slate-800">
                      {lawyer.rating || '—'}{' '}
                      <span className="font-medium text-slate-500">
                        ({lawyer.review_count} reviews)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="space-y-8 lg:col-span-8">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-blue-700">
                    Professional profile
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-slate-700">
                    {lawyer.bio || 'This advocate has not added a detailed bio yet.'}
                  </p>
                </section>

                {lawyer.areas_of_practice?.length > 0 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-blue-700">
                      Specializations
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {lawyer.areas_of_practice.map((area) => (
                        <span
                          key={area}
                          className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {(lawyer.lawyer_reviews || []).length > 0 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-blue-700">
                      Recent reviews
                    </h2>
                    <div className="mt-4 space-y-4">
                      {lawyer.lawyer_reviews.slice(0, 5).map((review) => (
                        <div key={review.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {review.reviewer_name || 'Client'}
                            </p>
                            <span className="text-xs font-bold text-amber-600">
                              {review.rating}/5
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{review.comment}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-6 lg:col-span-4">
                <div className="sticky top-24 space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-bold text-[#0f2d5e]">Request consultation</h3>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Secure client access
                    </p>

                    <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          <MessageSquare size={18} />
                        </div>
                        <span className="text-sm font-semibold text-slate-700">Initial briefing</span>
                      </div>
                      <span className="text-lg font-bold text-[#0f2d5e]">
                        {lawyer.consultation_fee}
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      <button
                        type="button"
                        onClick={openBookModal}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-800"
                      >
                        <Calendar size={18} />
                        Schedule session
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToast('Tip: run AI analysis first, then attach context when booking.');
                          navigate('/assistant');
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <FileText size={18} />
                        Prepare with AI
                      </button>
                    </div>

                    <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Confidential · Verified credentials
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                      <Scale size={18} className="mx-auto text-slate-400" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Ethics compliant
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                      <Verified size={18} className="mx-auto text-slate-400" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Verified identity
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {showBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#0f2d5e]">Request consultation</h3>
                <p className="mt-1 text-sm text-slate-500">with {lawyer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBook(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleBook} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  What is your issue about?
                </label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  required
                >
                  <option value="" disabled>
                    Select case type…
                  </option>
                  {CASE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.plain}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                  Pick the closest match even if you are unsure about court names (kacheri). The lawyer will guide next steps.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Describe your matter
                </label>
                <p className="mb-1.5 text-[11px] text-slate-500">
                  Use short paragraphs (blank line between points) so the advocate can read it easily.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  placeholder={'What happened?\n\nWhat do you want to achieve?\n\nAny documents or dates?'}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBook(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={booking}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {booking && <Loader2 size={16} className="animate-spin" />}
                  Send request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
