import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import './AuthBrandPanel.css';

// Hero art from high-court advocate page (Lady Justice) + gavel panel for advocates
const CLIENT_IMAGE = '/media/auth-high-court.jpg?v=2';
const LAWYER_IMAGE = '/media/auth-lawyer-alt.jpg?v=2';
const LOGO_SRC = '/advocate.jpg';

const COPY = {
  client: {
    login: {
      pill: 'Client portal',
      title: 'Your legal workspace, ready when you are.',
      subtitle:
        'Sign in to research case law, track matters, and stay connected with advocates.',
      bullets: ['Private client workspace', 'AI-assisted research', 'Book verified advocates'],
      footer: 'Secure access for clients and licensed advocates.',
    },
    signup: {
      pill: 'Client portal',
      title: 'Create your client account.',
      subtitle: 'Research the law, organise your matter, and connect with the right advocate.',
      bullets: ['Structured case review', 'Lawyer directory access', 'Consultation booking'],
      footer: 'Free to start. No credit card required.',
    },
  },
  lawyer: {
    login: {
      pill: 'Advocate portal',
      title: 'Advocate workspace awaits.',
      subtitle: 'Sign in to manage consultations, case files, and client requests.',
      bullets: ['Secure client consultations', 'Practice dashboard', 'Verified profile access'],
      footer: 'Licensed advocates only. Secure professional access.',
    },
    signup: {
      pill: 'Advocate portal',
      title: 'Join as a verified advocate.',
      subtitle: 'Receive consultation requests, manage case files, and grow your practice online.',
      bullets: ['Consultation request inbox', 'Case file workspace', 'Verified advocate profile'],
      footer: 'Bar Council ID required for advocate verification.',
    },
  },
};

function preload(urls) {
  urls.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

/**
 * Left brand panel for Login / Signup — soft crossfade between client / advocate art.
 * @param {'client' | 'lawyer'} role
 * @param {'login' | 'signup'} mode
 */
export default function AuthBrandPanel({ role = 'client', mode = 'login' }) {
  const isLawyer = role === 'lawyer';
  const targetSrc = isLawyer ? LAWYER_IMAGE : CLIENT_IMAGE;
  const copy = COPY[isLawyer ? 'lawyer' : 'client'][mode === 'signup' ? 'signup' : 'login'];

  const [activeSrc, setActiveSrc] = useState(targetSrc);
  const [prevSrc, setPrevSrc] = useState(null);
  const [imgReady, setImgReady] = useState(false);
  const [textKey, setTextKey] = useState(`${role}-${mode}`);
  const activeRef = useRef(targetSrc);

  useEffect(() => {
    preload([CLIENT_IMAGE, LAWYER_IMAGE]);
  }, []);

  useEffect(() => {
    setTextKey(`${role}-${mode}`);
  }, [role, mode]);

  // Soft crossfade: wait for the next image, keep previous underlay, then fade
  useEffect(() => {
    if (targetSrc === activeRef.current) {
      // Ensure first paint still fades in
      setImgReady(true);
      return undefined;
    }

    let cancelled = false;
    let fadeTimer;
    const previous = activeRef.current;
    const img = new Image();
    img.src = targetSrc;

    const apply = () => {
      if (cancelled) return;
      setPrevSrc(previous);
      activeRef.current = targetSrc;
      setActiveSrc(targetSrc);
      setImgReady(false);
      requestAnimationFrame(() => {
        if (!cancelled) setImgReady(true);
      });
      fadeTimer = window.setTimeout(() => {
        if (!cancelled) setPrevSrc(null);
      }, 720);
    };

    if (img.complete) apply();
    else {
      img.onload = apply;
      img.onerror = apply;
    }

    return () => {
      cancelled = true;
      if (fadeTimer) window.clearTimeout(fadeTimer);
    };
  }, [targetSrc]);

  return (
    <div className="auth-brand" data-role={isLawyer ? 'lawyer' : 'client'}>
      {prevSrc ? (
        <img
          className="auth-brand-img auth-brand-img--under"
          src={prevSrc}
          alt=""
          aria-hidden
          draggable={false}
        />
      ) : null}
      <img
        className={`auth-brand-img auth-brand-img--active ${imgReady ? 'is-ready' : ''}`}
        src={activeSrc}
        alt={
          isLawyer
            ? 'Gavel and scales — advocate portal'
            : 'Lady Justice — high court advocate portal'
        }
        draggable={false}
      />
      <div className="auth-brand-scrim" aria-hidden />
      <div className="auth-brand-glow" aria-hidden />

      <div className="auth-brand-content">
        <Link to="/" className="auth-brand-logo">
          <div className="auth-brand-mark auth-brand-mark--photo">
            <img src={LOGO_SRC} alt="" draggable={false} />
          </div>
          <span>
            Vakeel<span>Link</span>
          </span>
        </Link>

        <div className="auth-brand-body" key={textKey}>
          <div className="auth-brand-pill">{copy.pill}</div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>

          <ul>
            {copy.bullets.map((item) => (
              <li key={item}>
                <CheckCircle2 size={16} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand-foot">{copy.footer}</p>
      </div>
    </div>
  );
}
