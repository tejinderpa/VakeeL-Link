import { Link, useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search, Scale } from 'lucide-react';

/**
 * Friendly 404 for unknown routes and soft "not available" states.
 * Keeps users on-brand instead of a blank crash or silent home redirect.
 */
export default function NotFound({
  code = '404',
  title = 'Page not found',
  description = 'This page does not exist, or the feature is not available yet. Your session is fine — try one of the links below.',
  showHome = true,
} = {}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-[#f6f7fb] text-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-8 sm:p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Scale size={28} strokeWidth={1.75} />
        </div>
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-blue-700 mb-2">{code}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0f2d5e] tracking-tight mb-3">{title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-8">{description}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={16} />
            Go back
          </button>
          {showHome && (
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
            >
              <Home size={16} />
              Home
            </Link>
          )}
          <Link
            to="/case-search"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
          >
            <Search size={16} />
            Case search
          </Link>
        </div>
      </div>
    </div>
  );
}
