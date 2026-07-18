import { Link } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

/**
 * Full-page error UI for unexpected failures (API / runtime).
 * Prefer this over uncaught crashes so Vercel "looks down" less often.
 */
export default function ErrorPage({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. You can retry or return home — the rest of the app may still work.',
  detail = '',
  onRetry,
} = {}) {
  return (
    <div className="min-h-screen w-full bg-[#f6f7fb] text-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-8 sm:p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <AlertTriangle size={28} strokeWidth={1.75} />
        </div>
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-amber-700 mb-2">Error</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0f2d5e] tracking-tight mb-3">{title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{description}</p>
        {detail ? (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-6 break-words text-left font-mono">
            {detail}
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {typeof onRetry === 'function' && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={16} />
              Try again
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
          >
            <Home size={16} />
            Home
          </Link>
          <Link
            to="/dashboard/user"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
