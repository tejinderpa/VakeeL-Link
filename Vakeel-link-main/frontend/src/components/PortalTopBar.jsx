import { useLocation } from 'react-router-dom';

/**
 * Thin wire-like top accent for every page.
 * On refresh and every navigation, slanted hatch lines sweep left → right.
 */
export default function PortalTopBar() {
  const location = useLocation();
  // Key forces remount so the sweep CSS animation restarts
  const sweepKey = `${location.pathname}?${location.search}`;

  return (
    <div className="portal-wire-bar sticky top-0 z-[80] w-full" role="presentation" aria-hidden="true">
      <div className="portal-wire-track">
        <div key={sweepKey} className="portal-wire-sweep" />
      </div>
    </div>
  );
}
