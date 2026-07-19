import { Link, useLocation } from 'react-router-dom';
import { Scale, Shield } from 'lucide-react';
import useAuth from './useAuth';

/**
 * Professional blue status strip across portal pages.
 * Sits at the very top; offset for sidebars is handled by parent layout padding.
 */
export default function PortalTopBar() {
  const { user } = useAuth();
  const location = useLocation();

  const path = location.pathname || '';
  const isAuth = path === '/login' || path === '/signup';
  const isLanding = path === '/';
  // Lawyer dashboard has its own chrome strip
  const isLawyerDash = path.startsWith('/dashboard/lawyer');

  if (isAuth || isLanding || isLawyerDash) return null;

  const role =
    user?.role === 'lawyer' || user?.role === 'advocate'
      ? 'Advocate workspace'
      : user
        ? 'Client portal'
        : 'Legal research platform';

  const hasSidebar =
    path.startsWith('/dashboard') ||
    path.startsWith('/assistant') ||
    path.startsWith('/case-search') ||
    path.startsWith('/lawyers') ||
    path.startsWith('/consultations') ||
    path.startsWith('/profile') ||
    path.startsWith('/statutes') ||
    path.startsWith('/archive') ||
    path.startsWith('/case-curator') ||
    path.startsWith('/my-cases');

  return (
    <div
      className={`portal-top-strip sticky top-0 z-[70] w-full bg-gradient-to-r from-[#0a2348] via-[#0f2d5e] to-[#1e3a8a] text-white shadow-md ${
        hasSidebar ? 'md:pl-[260px] lg:pl-[280px]' : ''
      }`}
      role="banner"
    >
      <div className="mx-auto flex h-9 max-w-[1600px] items-center justify-between gap-3 px-4 text-[11px] font-medium tracking-wide sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-1.5 font-semibold text-white/95 transition hover:text-white">
            <Scale size={14} className="text-blue-200" />
            <span className="hidden sm:inline">
              Vakeel<span className="text-blue-200">Link</span>
            </span>
          </Link>
          <span className="hidden h-3 w-px bg-white/20 sm:block" />
          <span className="truncate text-blue-100/90">{role}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-blue-100/90 sm:gap-3">
          <span className="hidden items-center gap-1 md:inline-flex">
            <Shield size={12} className="text-emerald-300" />
            Confidential counsel
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-50 ring-1 ring-white/15">
            India · Live
          </span>
        </div>
      </div>
    </div>
  );
}
