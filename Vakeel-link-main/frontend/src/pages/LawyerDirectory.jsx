import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Star,
  Verified,
  Briefcase,
  Award,
  Users,
  ArrowRight,
  HelpCircle,
  Scale,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import { mergeLawyersCatalog } from '../utils/clientCatalog';
import { API_BASE_URL } from '../utils/api';

const DOMAIN_MAP = {
  'criminal law': 'criminal',
  criminal: 'criminal',
  'labour law': 'labour',
  'labor law': 'labour',
  labour: 'labour',
  'family law': 'family',
  family: 'family',
  'property law': 'property',
  property: 'property',
  'consumer law': 'consumer',
  consumer: 'consumer',
  'constitutional law': 'constitutional',
  constitutional: 'constitutional',
  general: 'general',
  'general law': 'general',
};

/** Plain-language guide so clients can pick the right kacheri / specialist */
const DOMAIN_GUIDES = [
  {
    domain: 'family',
    title: 'Family & matrimonial',
    plain: 'Divorce, alimony, child custody, domestic violence, or marriage registration issues.',
    court: 'Family Court / Magistrate',
  },
  {
    domain: 'labour',
    title: 'Jobs & labour',
    plain: 'Salary dues, PF, illegal termination, workplace harassment, or industrial disputes.',
    court: 'Labour Court / Industrial Tribunal',
  },
  {
    domain: 'criminal',
    title: 'Criminal / police',
    plain: 'FIR, bail, thrashing, cheating complaints, or defending a police case.',
    court: 'Sessions / Magistrate Court',
  },
  {
    domain: 'property',
    title: 'Land & property',
    plain: 'Title disputes, partition, rent, builder issues, or inheritance of house/land.',
    court: 'Civil Court / revenue forums',
  },
  {
    domain: 'consumer',
    title: 'Consumer & services',
    plain: 'Banks, insurance, e-commerce, telecom, or defective products/services.',
    court: 'Consumer Commission',
  },
  {
    domain: 'constitutional',
    title: 'Rights & writs',
    plain: 'Fundamental rights, government action challenges, or high-court writs.',
    court: 'High Court / Supreme Court',
  },
];

const toTitleCase = (value = '') =>
  value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export default function LawyerDirectory() {
  const navigate = useNavigate();
  const [lawyers, setLawyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localQuery, setLocalQuery] = useState('');
  const [searchParams] = useSearchParams();
  const domainFilter = searchParams.get('domain');

  const fetchLawyers = async () => {
    setLoading(true);
    let apiRows = [];
    try {
      const baseUrl = `${API_BASE_URL}/api/v1/lawyers`;
      const params = new URLSearchParams({
        page: '1',
        limit: '60',
        sort_by: 'ranked',
      });
      // Always fetch full catalog, filter client-side so demos stay visible
      const res = await fetch(`${baseUrl}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        apiRows = data?.data || [];
      }
    } catch (error) {
      console.error(error);
    } finally {
      let merged = mergeLawyersCatalog(apiRows);
      if (domainFilter) {
        const nd =
          DOMAIN_MAP[String(domainFilter).toLowerCase().trim()] ||
          String(domainFilter).toLowerCase().trim();
        merged = merged.filter((l) => {
          const hay = `${l.specialization || ''} ${l.specializationLabel || ''}`.toLowerCase();
          return hay.includes(nd) || hay.includes(String(domainFilter).toLowerCase());
        });
      }
      setLawyers(merged);
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchLawyers();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when domain filter changes
  }, [domainFilter]);

  const visibleLawyers = lawyers.filter((lawyer) => {
    if (!localQuery.trim()) return true;
    const q = localQuery.toLowerCase();
    return (
      lawyer.name?.toLowerCase().includes(q) ||
      lawyer.specializationLabel?.toLowerCase().includes(q) ||
      lawyer.location?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 md:pl-[260px] lg:pl-[280px]">
        <div className="mx-auto max-w-[1440px] p-4 md:p-8">
          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-[#0f2d5e] via-[#163a75] to-[#0f2d5e] px-6 py-8 text-white shadow-sm md:px-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">Directory</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              {domainFilter
                ? `${toTitleCase(domainFilter)} specialists`
                : 'Find the right lawyer for your issue'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100/90">
              {domainFilter
                ? `Advocates who handle ${toTitleCase(domainFilter)} matters — including verified demo profiles and live logins.`
                : 'Pick an issue area below, then open a full profile. Demo advocates stay available even when the cloud directory is empty.'}
            </p>
          </div>

          <header className="mb-8">
            <p className="text-sm leading-relaxed text-slate-600">
              Not sure about courts or practice areas? Start with what your problem feels like — we map it to the right specialist.
            </p>

            <div className="relative mt-6 max-w-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                placeholder="Search by name, specialty, or city..."
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-800 outline-none transition-shadow focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            {!domainFilter && (
              <div className="mt-8">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0f2d5e]">
                  <HelpCircle size={16} className="text-blue-600" />
                  What is your issue about? (tap one)
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {DOMAIN_GUIDES.map((g) => (
                    <button
                      key={g.domain}
                      type="button"
                      onClick={() => navigate(`/lawyers?domain=${encodeURIComponent(g.domain)}`)}
                      className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <Scale size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900">{g.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">{g.plain}</p>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                            Typical forum: {g.court}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {domainFilter && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
                  Filter: {toTitleCase(domainFilter)}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/lawyers')}
                  className="text-xs font-semibold text-slate-600 underline hover:text-blue-700"
                >
                  Clear filter · show all
                </button>
              </div>
            )}
          </header>

          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0f2d5e]">
              {domainFilter ? 'Matching experts' : 'Top experts'}
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? 'Loading…' : `${visibleLawyers.length} results`}
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
              <p className="mt-4 text-sm text-slate-500">Loading lawyer directory…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visibleLawyers.length > 0 ? (
                visibleLawyers.map((lawyer) => (
                  <div
                    key={lawyer.id}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-lg font-bold text-[#0f2d5e]">
                        {lawyer.avatar ? (
                          <img
                            src={lawyer.avatar}
                            alt={lawyer.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          lawyer.name?.charAt(0) || 'L'
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-base font-semibold text-slate-900">
                            {lawyer.name}
                          </h3>
                          <Verified size={14} className="shrink-0 text-blue-600" />
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {lawyer.specializationLabel || 'Specialist'}
                        </p>
                        {lawyer.location && (
                          <p className="mt-0.5 text-xs text-slate-400">{lawyer.location}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-amber-500">
                          <Star size={13} fill="currentColor" />
                          <span className="text-sm font-bold text-slate-900">
                            {lawyer.rating || '4.8'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          Rating
                        </p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-blue-600">
                          <Briefcase size={13} />
                          <span className="text-sm font-bold text-slate-900">
                            {lawyer.experience_years}+
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          Years
                        </p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-emerald-600">
                          <Award size={13} />
                          <span className="text-sm font-bold text-slate-900">
                            {lawyer.cases_solved || '—'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          Cases
                        </p>
                      </div>
                    </div>

                    <Link
                      to={`/lawyers/${lawyer.id}`}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-[#0f2d5e] transition-colors hover:border-blue-200 hover:bg-blue-50"
                    >
                      View profile
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                ))
              ) : (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
                  <Users size={36} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">
                    No matching legal experts found
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
