import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  MessageSquare,
  Scale,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Video,
  MapPin,
  History,
  Zap,
  Bell,
  Settings,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import useAuth from '../components/useAuth';
import { apiGet, hasRealToken } from '../utils/api';
import {
  formatRelativeTime,
  isOpenStatus,
  mapConsultationForClient,
  normalizeStatus,
  statusBadgeClass,
  statusLabel,
} from '../utils/consultationStatus';
import { DEMO_ACTIVITY, mergeClientConsultations } from '../utils/clientCatalog';

const quickActions = [
  {
    title: 'Search Case Law',
    description: 'Find cases, statutes, and precedents.',
    path: '/case-search',
    icon: Search,
  },
  {
    title: 'AI Assistant',
    description: 'Structured analysis for your legal question.',
    path: '/assistant',
    icon: MessageSquare,
  },
  {
    title: 'Find Lawyers',
    description: 'Browse verified advocates by domain.',
    path: '/lawyers',
    icon: Scale,
  },
  {
    title: 'My Consultations',
    description: 'Upcoming appointments and active matters.',
    path: '/consultations',
    icon: CalendarDays,
  },
];

const accentStyles = {
  blue: 'border-l-blue-600 bg-blue-50 text-blue-700',
  teal: 'border-l-teal-600 bg-teal-50 text-teal-700',
  indigo: 'border-l-indigo-600 bg-indigo-50 text-indigo-700',
  orange: 'border-l-orange-500 bg-orange-50 text-orange-700',
};

function activityIcon(type) {
  if (type === 'AI_SEARCH') return <Zap size={16} className="text-blue-600" />;
  if (type === 'LAWYER_SAVE') return <CheckCircle2 size={16} className="text-emerald-600" />;
  if (type === 'CONSULTATION') return <CalendarDays size={16} className="text-indigo-600" />;
  return <AlertCircle size={16} className="text-amber-600" />;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const displayName = user?.name || user?.full_name || 'Client';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const [consultations, setConsultations] = useState([]);
  const [aiCount, setAiCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState('');
  const [headerQuery, setHeaderQuery] = useState('');

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadWarning('');
    let apiRows = [];
    let runs = 3; // baseline demo AI activity count
    try {
      if (hasRealToken()) {
        const [consRes, casesRes] = await Promise.allSettled([
          apiGet('/api/v1/consultations/mine'),
          apiGet('/api/v1/cases/?limit=5'),
        ]);
        if (consRes.status === 'fulfilled') {
          apiRows = consRes.value?.data || [];
        } else if (consRes.status === 'rejected') {
          // Keep dashboard usable; surface a soft banner instead of a crash
          setLoadWarning(
            consRes.reason?.message ||
              'Some live data could not load. Showing local/demo activity.'
          );
        }
        if (casesRes.status === 'fulfilled') {
          runs = Math.max(
            runs,
            Number(casesRes.value?.total_count || (casesRes.value?.data || []).length || 0)
          );
        }
        // cases failures are non-fatal (backend may return empty list)
      }
    } finally {
      setConsultations(mergeClientConsultations(apiRows).map(mapConsultationForClient));
      setAiCount(runs);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const openMatters = useMemo(
    () => consultations.filter((c) => isOpenStatus(c.status)).length,
    [consultations]
  );
  const activeChat = useMemo(
    () => consultations.filter((c) => normalizeStatus(c.status) === 'active').length,
    [consultations]
  );
  const completed = useMemo(
    () => consultations.filter((c) => normalizeStatus(c.status) === 'completed').length,
    [consultations]
  );

  const metricCards = [
    { label: 'Open Matters', value: openMatters, badge: 'Active', accent: 'blue' },
    { label: 'Active Chats', value: activeChat, badge: 'Live', accent: 'teal' },
    { label: 'AI Runs', value: aiCount, badge: 'History', accent: 'indigo' },
    { label: 'Completed', value: completed, badge: 'Closed', accent: 'orange' },
  ];

  const upcoming = useMemo(() => {
    const open = consultations.filter((c) => isOpenStatus(c.status));
    const q = headerQuery.trim().toLowerCase();
    const filtered = q
      ? open.filter(
          (c) =>
            c.lawyerName.toLowerCase().includes(q) ||
            c.specialization.toLowerCase().includes(q) ||
            (c.clientMessage || '').toLowerCase().includes(q)
        )
      : open;
    return filtered.slice(0, 5);
  }, [consultations, headerQuery]);

  const activity = useMemo(() => {
    const fromCons = consultations.slice(0, 4).map((c) => ({
      id: c.id,
      type: 'CONSULTATION',
      title: `${statusLabel(c.status)} · ${c.lawyerName}`,
      timestamp: formatRelativeTime(c.createdAt),
      detail: c.clientMessage || `${c.specialization} consultation`,
    }));
    // Keep demo activity rows; do not drop them when live data exists
    const demo = DEMO_ACTIVITY.filter((a) => !fromCons.some((c) => c.title === a.title));
    return [...fromCons, ...demo].slice(0, 8);
  }, [consultations]);

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 md:pl-[260px] lg:pl-[280px]">
        {loadWarning ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 md:px-6">
            <span className="font-semibold">Partial data: </span>
            {loadWarning}
            <button
              type="button"
              onClick={() => load()}
              className="ml-3 font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950"
            >
              Retry
            </button>
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 shadow-sm backdrop-blur md:px-6">
          <div className="relative ml-12 w-full max-w-md md:ml-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-700 outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-200/60"
              placeholder="Filter open consultations…"
              type="text"
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
            />
          </div>
          <div className="ml-4 flex items-center gap-3">
            <Link
              to="/consultations"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50"
              aria-label="Consultations"
            >
              <Bell size={18} />
            </Link>
            <Link
              to="/profile"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50"
              aria-label="Profile settings"
            >
              <Settings size={18} />
            </Link>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {initials}
              </div>
              <span className="hidden text-sm font-medium text-slate-900 sm:inline">
                Client Dashboard
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] p-4 md:p-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#0f2d5e]">
                Welcome back, {displayName}
              </h1>
              <div className="mt-1 flex items-center gap-2 text-slate-600">
                <CalendarDays size={16} />
                <p className="text-sm">{todayLabel}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/case-search"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300"
              >
                Search Cases
              </Link>
              <Link
                to="/lawyers"
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-800"
              >
                Find a Lawyer
              </Link>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm"
                style={{
                  borderLeftColor:
                    card.accent === 'blue'
                      ? '#2563eb'
                      : card.accent === 'teal'
                        ? '#0d9488'
                        : card.accent === 'indigo'
                          ? '#4f46e5'
                          : '#f97316',
                }}
              >
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {card.label}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${accentStyles[card.accent]}`}
                  >
                    {card.badge}
                  </span>
                </div>
                <p className="mt-3 text-3xl font-bold text-[#0f2d5e]">
                  {loading ? '—' : card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.title}
                  to={action.path}
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon size={20} />
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-[#0f2d5e]">{action.title}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        {action.description}
                      </p>
                    </div>
                    <ArrowUpRight
                      size={16}
                      className="mt-1 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600"
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <section className="space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#0f2d5e]">Upcoming Consultations</h2>
                <Link
                  to="/consultations"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  View All
                </Link>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {loading && (
                  <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                    <Loader2 className="animate-spin" size={18} /> Loading…
                  </div>
                )}
                {!loading && upcoming.length === 0 && (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No open consultations.{' '}
                    <Link to="/lawyers" className="font-semibold text-blue-600 hover:underline">
                      Find a lawyer
                    </Link>
                  </div>
                )}
                {!loading &&
                  upcoming.map((cons, idx) => (
                    <div
                      key={cons.id}
                      className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${
                        idx !== upcoming.length - 1 ? 'border-b border-slate-100' : ''
                      }`}
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        {cons.type === 'Video Call' ? (
                          <Video size={22} />
                        ) : cons.type === 'In-person' ? (
                          <MapPin size={22} />
                        ) : (
                          <MessageCircle size={22} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{cons.lawyerName}</h3>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(cons.status)}`}
                          >
                            {statusLabel(cons.status)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {cons.specialization} · {cons.type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm sm:flex-col sm:items-end sm:gap-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Clock size={14} className="text-slate-400" />
                          {cons.time}
                        </div>
                        <div className="text-xs font-medium text-slate-500">{cons.date}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                  <History size={18} className="text-blue-600" />
                  <h3 className="text-lg font-semibold text-[#0f2d5e]">Recent Activity</h3>
                </div>
                <div>
                  {!loading && activity.length === 0 && (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">
                      Activity from your consultations will show up here.
                    </p>
                  )}
                  {activity.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 px-5 py-4 ${
                        idx !== activity.length - 1 ? 'border-b border-slate-100' : ''
                      }`}
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                        {activityIcon(item.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {item.timestamp}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl bg-[#0f2d5e] p-6 text-white">
                <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-blue-400/20 blur-2xl" />
                <div className="relative z-10">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
                    Need guidance?
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">Ask the AI assistant</h3>
                  <p className="mt-2 text-sm text-blue-100/90">
                    Get structured analysis, then match with a specialist lawyer.
                  </p>
                  <Link
                    to="/assistant"
                    className="mt-5 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0f2d5e] transition-colors hover:bg-blue-50"
                  >
                    Open AI Assistant
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
