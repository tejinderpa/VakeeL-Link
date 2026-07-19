import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuth from './useAuth';
import {
  MessageSquare,
  Search,
  Users,
  Calendar,
  User,
  Scale,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/dashboard/user', icon: LayoutDashboard, match: (p) => p.startsWith('/dashboard/user') },
  { name: 'AI Assistant', path: '/assistant', icon: MessageSquare, match: (p) => p.startsWith('/assistant') },
  { name: 'Case Search', path: '/case-search', icon: Search, match: (p) => p.startsWith('/case-search') },
  { name: 'Find Lawyers', path: '/lawyers', icon: Users, match: (p) => p.startsWith('/lawyers') },
  { name: 'My Consultations', path: '/consultations', icon: Calendar, match: (p) => p.startsWith('/consultations') },
  { name: 'Profile', path: '/profile', icon: User, match: (p) => p.startsWith('/profile') },
];

const UserSidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const mainScrollContainer = document.querySelector('main.overflow-y-auto');
    if (mainScrollContainer) {
      mainScrollContainer.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate('/');
  };

  const displayName = user?.name || user?.full_name || 'Client';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-3 z-[60] rounded-xl bg-[#0f2d5e] p-2.5 text-white shadow-md transition hover:bg-[#163a75] md:hidden"
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-full w-[260px] flex-col border-r border-white/10 bg-[#0f2d5e] text-sm text-slate-200 shadow-xl transition-transform duration-300 ease-in-out lg:w-[280px]
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="shrink-0 border-b border-white/10 px-5 py-5">
          <Link to="/" onClick={() => setIsOpen(false)} className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/25 text-white ring-1 ring-white/10">
              <Scale size={20} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-white">
                Vakeel<span className="text-blue-300">Link</span>
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-300/80">
                Client portal
              </div>
            </div>
          </Link>
        </div>

        <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match(location.pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-blue-300' : 'text-slate-400'} />
                <span className="font-semibold">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-4">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/40 text-xs font-bold text-white">
              {initials || 'CL'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white" title={displayName}>
                {displayName}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">
                {user?.email || 'Client account'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-300 transition-all hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            <span className="font-semibold">Logout</span>
          </button>
        </div>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}
    </>
  );
};

export default UserSidebar;
