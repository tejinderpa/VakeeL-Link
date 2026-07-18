import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  User,
  Mail,
  Lock,
  FileText,
  Scale,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import AuthBrandPanel from '../components/AuthBrandPanel';
import AuthPortalToggle from '../components/AuthPortalToggle';
import { API_BASE_URL, networkErrorMessage } from '../utils/api';
import {
  loginPathForPortal,
  normalizePortal,
  resolveAuthPortal,
  writeStoredPortal,
} from '../utils/authPortal';

const BAR_NUMBER_REGEX = /^[A-Z]{1,4}\/\d{1,6}\/\d{4}$/;

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const resolved = useMemo(
    () => resolveAuthPortal({ state: location.state, searchParams }),
    [location.state, searchParams]
  );

  const [portal, setPortal] = useState(resolved.portal);
  const [portalLocked, setPortalLocked] = useState(resolved.locked);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    barRegistration: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  // Smooth expand/collapse for Bar Council field
  const [showBarField, setShowBarField] = useState(resolved.portal === 'lawyer');

  useEffect(() => {
    const next = resolveAuthPortal({ state: location.state, searchParams });
    setPortal(next.portal);
    setPortalLocked(next.locked);
    writeStoredPortal(next.portal);
    setShowBarField(next.portal === 'lawyer');
  }, [location.state, searchParams]);

  useEffect(() => {
    const t = window.requestAnimationFrame(() => setPageReady(true));
    return () => window.cancelAnimationFrame(t);
  }, []);

  // Animate bar field in/out when portal changes
  useEffect(() => {
    if (portal === 'lawyer') {
      setShowBarField(true);
      return undefined;
    }
    const t = window.setTimeout(() => setShowBarField(false), 280);
    return () => window.clearTimeout(t);
  }, [portal]);

  const barNumber = formData.barRegistration.trim().toUpperCase();
  const isLawyer = portal === 'lawyer';
  const isBarNumberValid = !isLawyer || BAR_NUMBER_REGEX.test(barNumber);
  const showBarNumberError =
    isLawyer && formData.barRegistration.trim().length > 0 && !isBarNumberValid;

  const handlePortalChange = (next, { unlock } = {}) => {
    const p = normalizePortal(next);
    setPortal(p);
    writeStoredPortal(p);
    if (unlock) setPortalLocked(false);
    const params = new URLSearchParams(searchParams);
    params.set('role', p);
    navigate(
      { pathname: '/signup', search: `?${params.toString()}` },
      {
        replace: true,
        state: unlock
          ? { ...(location.state || {}), role: p, roleLocked: false }
          : { ...(location.state || {}), role: p, roleLocked: portalLocked },
      }
    );
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLawyer && !formData.barRegistration.trim()) {
        throw new Error('Bar Number is required for lawyer registration.');
      }
      if (isLawyer && !BAR_NUMBER_REGEX.test(barNumber)) {
        throw new Error('Bar Number must be in format STATE/NUMBER/YEAR (e.g., D/1234/2019).');
      }

      const payload = {
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: isLawyer ? 'lawyer' : 'client',
        bar_council_id: isLawyer ? barNumber : undefined,
      };

      const allowMock = String(import.meta.env.VITE_ALLOW_MOCK_AUTH || '').toLowerCase() === 'true';
      let backendRegistered = false;
      let backendError = null;
      let backendMessage = null;

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          backendRegistered = true;
          backendMessage =
            typeof data?.message === 'string'
              ? data.message
              : 'Account created successfully. Please sign in.';
        } else {
          backendError =
            typeof data?.detail === 'string'
              ? data.detail
              : typeof data?.message === 'string'
                ? data.message
                : 'Registration failed';

          if (/rate limit|too many/i.test(backendError)) {
            backendError =
              'Supabase email rate limit hit. Restart the API if you just updated it, ' +
              'then try signup again (offline account will be created), or login with demo: ' +
              'lawyer@example.com / lawyer123';
          }
        }
      } catch (networkErr) {
        backendError = networkErrorMessage(networkErr, API_BASE_URL);
      }

      if (!backendRegistered && !allowMock) {
        throw new Error(backendError || 'Registration failed');
      }

      writeStoredPortal(portal);

      localStorage.setItem(
        'vakeellink_pending_registration',
        JSON.stringify({
          role: isLawyer ? 'lawyer' : 'user',
          fullName: formData.fullName,
          email: formData.email,
          barRegistration: formData.barRegistration,
        })
      );

      // Handoff: login opens with same portal already selected + locked
      navigate(loginPathForPortal(portal), {
        state: {
          role: portal,
          roleLocked: true,
          email: formData.email.trim(),
          message: backendRegistered
            ? backendMessage || 'Account created successfully. Please sign in.'
            : 'Account saved in demo mode. Please sign in.',
        },
      });
    } catch (err) {
      setError(
        err.message ||
          'Registration failed. Please verify your details, including Bar Number for lawyers.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen bg-[#faf8ff] text-slate-900 transition-opacity duration-500 ease-out ${
        pageReady ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="grid min-h-screen lg:grid-cols-2">
        <AuthBrandPanel role={portal} mode="signup" />

        <div className="flex flex-col justify-center px-4 py-12 sm:px-8 lg:px-12 xl:px-16">
          <div
            className={`mx-auto w-full max-w-md transition-all duration-500 ease-out ${
              pageReady ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f2d5e] text-white">
                <Scale size={18} />
              </div>
              <span className="text-lg font-bold text-[#0f2d5e]">
                Vakeel<span className="text-blue-600">Link</span>
              </span>
            </Link>

            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[#0f2d5e]">Create account</h1>
                <p className="mt-2 text-sm text-slate-500">
                  {portalLocked
                    ? `Continue as ${isLawyer ? 'advocate' : 'client'} — portal is pre-selected.`
                    : 'Choose your role to get started.'}
                </p>
              </div>
              <Link
                to={loginPathForPortal(portal)}
                state={{ role: portal, roleLocked: true }}
                className="shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Sign in
              </Link>
            </div>

            <AuthPortalToggle
              portal={portal}
              locked={portalLocked}
              onChange={handlePortalChange}
            />

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Full name
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="fullName"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Your full name"
                    autoComplete="name"
                    required
                    type="text"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    type="email"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Min. 8 characters"
                    minLength="8"
                    autoComplete="new-password"
                    required
                    type="password"
                  />
                </div>
              </div>

              {/* Smooth height transition for Bar Council field */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  isLawyer && showBarField
                    ? 'max-h-40 opacity-100'
                    : 'max-h-0 opacity-0 pointer-events-none'
                }`}
                aria-hidden={!isLawyer}
              >
                <div className="pb-1">
                  <label
                    htmlFor="barRegistration"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
                  >
                    Bar Council ID
                  </label>
                  <div className="relative">
                    <FileText
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      id="barRegistration"
                      name="barRegistration"
                      value={formData.barRegistration}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          barRegistration: e.target.value.toUpperCase(),
                        });
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      placeholder="e.g. D/1234/2019"
                      required={isLawyer}
                      tabIndex={isLawyer ? 0 : -1}
                      type="text"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Format: STATE/NUMBER/YEAR (example: D/1234/2019)
                  </p>
                  {showBarNumberError && (
                    <p className="mt-1.5 text-xs font-semibold text-rose-600">
                      Invalid format. Use STATE/NUMBER/YEAR.
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <label className="flex items-start gap-3 py-1">
                <input
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  required
                  type="checkbox"
                />
                <span className="text-xs leading-relaxed text-slate-500">
                  I confirm the details are accurate and agree to the{' '}
                  <span className="font-semibold text-blue-700">Terms</span> and{' '}
                  <span className="font-semibold text-blue-700">Privacy Policy</span>.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !isBarNumberValid}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Creating account…</span>
                  </>
                ) : (
                  <>
                    Create {isLawyer ? 'advocate' : 'client'} account
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
