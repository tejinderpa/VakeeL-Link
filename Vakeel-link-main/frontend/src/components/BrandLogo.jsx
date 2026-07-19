import { Link } from 'react-router-dom';

const LOGO_SRC = '/advocate.jpg';

/**
 * Site logo + wordmark.
 * Logo and "VakeelLink" sit side by side; wordmark height tracks the logo.
 */
export default function BrandLogo({
  to = '/',
  subtitle = '',
  onNavigate,
  size = 'md', // sm | md | lg
  className = '',
}) {
  const dim =
    size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  const titleSize =
    size === 'lg' ? 'text-[1.35rem]' : size === 'sm' ? 'text-base' : 'text-xl';
  const titleLeading = size === 'lg' ? 'leading-[2.75rem]' : size === 'sm' ? 'leading-9' : 'leading-11';

  const body = (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/20 shadow-md ${dim}`}
      >
        <img
          src={LOGO_SRC}
          alt="VakeelLink"
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
      </div>
      <div className="flex min-w-0 flex-col justify-center">
        <div
          className={`truncate font-black tracking-tight text-white ${titleSize} ${titleLeading}`}
          style={{
            // Keep visual height roughly aligned with logo box
            height: size === 'lg' ? '3rem' : size === 'sm' ? '2.25rem' : '2.75rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          Vakeel<span className="text-blue-300">Link</span>
        </div>
        {subtitle ? (
          <div className="-mt-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-300/80">
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
