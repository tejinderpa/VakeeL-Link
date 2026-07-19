import { Link } from 'react-router-dom';

/** Local brand mark (Ashok Stambh / lawyer board art) — always visible offline */
const LOGO_SRC = '/advocate.jpg';

/**
 * Site logo + wordmark for sidebars.
 * Layout: logo on top, VakeelLink underneath (stacked).
 */
export default function BrandLogo({
  to = '/',
  subtitle = '',
  onNavigate,
  stacked = true,
  className = '',
}) {
  const body = (
    <div
      className={`flex min-w-0 ${
        stacked ? 'flex-col items-start gap-2' : 'flex-row items-center gap-3'
      } ${className}`}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/20 shadow-md ${
          stacked ? 'h-14 w-14' : 'h-11 w-11'
        }`}
      >
        <img
          src={LOGO_SRC}
          alt="VakeelLink"
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
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
        className="block rounded-xl outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-blue-300/50"
      >
        {body}
      </Link>
    );
  }

  return body;
}
