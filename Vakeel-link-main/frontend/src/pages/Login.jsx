import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import useAuth from '../components/useAuth';
import AuthBrandPanel from '../components/AuthBrandPanel';
import AuthPortalToggle from '../components/AuthPortalToggle';
import { ArrowRight, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL, networkErrorMessage } from '../utils/api';
import {
  normalizePortal,
  resolveAuthPortal,
  signupPathForPortal,
  writeStoredPortal,
} from '../utils/authPortal';

const normalizeRole = (role) => {
  if (!role) return 'user';
  const value = String(role).toLowerCase();
  if (value === 'lawyer' || value === 'advocate') return 'lawyer';
  return 'user';
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const resolved = useMemo(
    () => resolveAuthPortal({ state: location.state, searchParams }),
    [location.state, searchParams]
  );

  const [portal, setPortal] = useState(resolved.portal);
  const [portalLocked, setPortalLocked] = useState(resolved.locked);
  const [formData, setFormData] = useState({
    email: location.state?.email || '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [error, setError] = useState('');

  const successMessage = location.state?.message;

  // Sync when URL/state changes (e.g. signup → login handoff)
  useEffect(() => {
    const next = resolveAuthPortal({ state: location.state, searchParams });
    setPortal(next.portal);
    setPortalLocked(next.locked);
    writeStoredPortal(next.portal);
  }, [location.state, searchParams]);

  // Soft page entrance
  useEffect(() => {
    const t = window.requestAnimationFrame(() => setPageReady(true));
    return () => window.cancelAnimationFrame(t);
  }, []);

  // Prefill email from signup handoff once
  useEffect(() => {
    if (location.state?.email && !formData.email) {
      setFormData((prev) => ({ ...prev, email: location.state.email }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.email]);

  const handlePortalChange = (next, { unlock } = {}) => {
    const p = normalizePortal(next);
    setPortal(p);
    writeStoredPortal(p);
    if (unlock) setPortalLocked(false);
    // Keep URL in sync; clear roleLocked from history so unlock sticks after URL update
    const params = new URLSearchParams(searchParams);
    params.set('role', p);
    navigate(
      { pathname: '/login', search: `?${params.toString()}` },
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
    setLoading(true);
    setError('');

    const allowMock = String(import.meta.env.VITE_ALLOW_MOCK_AUTH || '').toLowerCase() === 'true';

    try {
      let response;
      try {
        response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email.trim(),
            password: formData.password,
          }),
        });
      } catch (networkErr) {
        throw new Error(networkErrorMessage(networkErr, API_BASE_URL));
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        let detail =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
              : typeof data?.message === 'string'
                ? data.message
                : 'Invalid email or password';

        if (/getaddrinfo|11001|failed to resolve|cannot reach supabase/i.test(detail)) {
          detail =
            'Cannot reach Supabase (DNS). Your SUPABASE_URL project host may be deleted or paused. ' +
            'Fix backend/.env SUPABASE_URL from the Supabase dashboard, restart the API, then try again. ' +
            'Or sign up again — the API will create an offline account while Supabase is down.';
        }
        if (response.status === 401 || /authentication failed|invalid credentials/i.test(detail)) {
          detail =
            portal === 'lawyer'
              ? 'Invalid email or password for this advocate account. Use a lawyer signup (with Bar Council ID), or try the demo: lawyer@example.com / lawyer123'
              : 'Invalid email or password. If you just registered offline, use the same email/password, or create an account first.';
        }
        throw new Error(detail);
      }

      const data = await response.json();
      const apiRole = data.user?.role || data.role || 'client';
      const role = normalizeRole(apiRole);
      const fullName = data.user?.full_name || data.user?.name || formData.email.split('@')[0];
      const userData = {
        id: data.user?.id || data.user_id,
        email: data.user?.email || formData.email.trim(),
        role,
        name: fullName,
        full_name: fullName,
      };

      if (!data.access_token) {
        throw new Error('Login succeeded but no access token was returned.');
      }

      if (portal === 'lawyer' && role !== 'lawyer') {
        throw new Error(
          'This account is registered as a client, not an advocate. ' +
            'Sign up with role Advocate (Bar Council ID required), or switch to the Client portal.'
        );
      }

      login(userData, data.access_token);
      localStorage.removeItem('vakeellink_pending_registration');
      writeStoredPortal(role === 'lawyer' ? 'lawyer' : 'client');

      const redirect = location.state?.from || (role === 'lawyer' ? '/dashboard/lawyer' : '/dashboard/user');
      navigate(redirect);
    } catch (err) {
      if (allowMock) {
        const pendingRegistration = JSON.parse(
          localStorage.getItem('vakeellink_pending_registration') || 'null'
        );
        const role = normalizeRole(
          pendingRegistration && pendingRegistration.email === formData.email
            ? pendingRegistration.role
            : formData.email.includes('lawyer')
              ? 'lawyer'
              : portal === 'lawyer'
                ? 'lawyer'
                : 'user'
        );
        const userData = {
          id: null,
          email: formData.email,
          role,
          name: pendingRegistration?.fullName || 'Demo User',
        };
        login(userData, 'mock_jwt_token');
        navigate(role === 'lawyer' ? '/dashboard/lawyer' : '/dashboard/user');
        return;
      }
      setError(err.message || 'Invalid email or password');
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
        <AuthBrandPanel role={portal} mode="login" />

        <div className="flex flex-col justify-center px-4 py-12 sm:px-8 lg:px-12 xl:px-20">
          <div
            className={`mx-auto w-full max-w-md transition-all duration-500 ease-out ${
              pageReady ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            <Link to="/" className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-slate-200 shadow-sm">
                <img src="/advocate.jpg" alt="" className="h-full w-full object-cover" />
              </div>
              <span className="flex h-11 items-center text-xl font-black tracking-tight text-[#0f2d5e]">
                Vakeel<span className="text-blue-600">Link</span>
              </span>
            </Link>

            <h1 className="text-3xl font-bold tracking-tight text-[#0f2d5e]">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to your {portal === 'lawyer' ? 'advocate' : 'client'} account.
              {portalLocked ? ' Your portal is already selected from registration.' : ''}
            </p>

            <AuthPortalToggle
              portal={portal}
              locked={portalLocked}
              onChange={handlePortalChange}
            />

            {successMessage && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 animate-[auth-rise_0.4s_ease-out]">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-500"
                  >
                    Password
                  </label>
                  <Link to="#" className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link
                to={signupPathForPortal(portal)}
                state={{ role: portal, roleLocked: true }}
                className="font-semibold text-blue-700 hover:text-blue-800"
              >
                Create one
              </Link>
            </p>

            {portal === 'lawyer' ? (
              <p className="mt-4 text-center text-xs text-slate-400">
                Demo advocate:{' '}
                <span className="font-medium text-slate-500">lawyer@example.com</span>
                {' / '}
                <span className="font-medium text-slate-500">lawyer123</span>
                . New advocates need a Bar Council ID (e.g. D/1234/2019).
              </p>
            ) : (
              <p className="mt-4 text-center text-xs text-slate-400">
                New here? Create a free client account — your portal choice carries to sign-in.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
