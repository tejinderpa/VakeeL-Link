import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Site logo + wordmark for sidebars.
 * Prefers hosted brand mark (vakeelbhaiya.com), falls back to /logo.png.
 * Layout: logo on top, VakeelLink underneath (professional stacked mark).
 */
export default function BrandLogo({
  to = '/',
  subtitle = '',
  onNavigate,
  stacked = true,
  className = '',
}) {
  // Prefer shared brand URL, then local assets
  const [src, setSrc] = useState('https://vakeelbhaiya.com/x');
  const [failed, setFailed] = useState(false);

  const handleError = () => {
    if (src === 'https://vakeelbhaiya.com/x') {
      setSrc('/logo.svg');
      return;
    }
    if (src === '/logo.svg') {
      setSrc('/logo.png');
      return;
    }
    setFailed(true);
  };

  const body = (
    <div
      className={`flex min-w-0 ${
        stacked ? 'flex-col items-start gap-2' : 'flex-row items-center gap-3'
      } ${className}`}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15 shadow-sm ${
          stacked ? 'h-12 w-12' : 'h-10 w-10'
        }`}
      >
        {!failed ? (
          <img
            src={src}
            alt="VakeelLink"
            className="h-full w-full object-cover"
            onError={handleError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500/40 to-blue-800/50 text-lg font-black text-white">
            V
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div
          className={`truncate font-black tracking-tight text-white ${
            stacked ? 'text-base leading-tight' : 'text-lg'
          }`}
        >
          Vakeel<span className="text-blue-300">Link</span>
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-300/80">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        onClick={onNavigate}
        className="block outline-none transition opacity-100 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-blue-300/50 rounded-xl"
      >
        {body}
      </Link>
    );
  }

  return body;
}
