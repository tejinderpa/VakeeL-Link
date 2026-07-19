import { useLocation } from 'react-router-dom';

/**
 * Thin wire accent for the main content column only — never over the sidebar.
 * On refresh / navigation, slanted hatch lines sweep left → right.
 */
export default function PortalTopBar() {
  const location = useLocation();
  const path = location.pathname || '';
  const sweepKey = `${location.pathname}?${location.search}`;

  // Routes that use the fixed left sidebar (client + advocate shells)
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
      className={`portal-wire-bar sticky top-0 z-[35] ${
        hasSidebar ? 'portal-wire-bar--content-only' : 'w-full'
      }`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="portal-wire-track">
        <div key={sweepKey} className="portal-wire-sweep" />
      </div>
    </div>
  );
}
