import { Link } from 'react-router-dom';
import { Scale, CheckCircle2 } from 'lucide-react';
import './AuthBrandPanel.css';

// Client: Lady Justice image from Legodesk Indian Judiciary article
const CLIENT_IMAGE = '/media/auth-client-judicial.jpg?v=legodesk';
const LAWYER_IMAGE = '/media/auth-lawyer-judicial.jpg';

/**
 * Left brand panel for Login / Signup — judicial imagery for client & lawyer.
 * @param {'client' | 'lawyer'} role
 * @param {'login' | 'signup'} mode
 */
export default function AuthBrandPanel({ role = 'client', mode = 'login' }) {
  const isLawyer = role === 'lawyer';
  const imageSrc = isLawyer ? LAWYER_IMAGE : CLIENT_IMAGE;

  const title =
    mode === 'signup'
      ? isLawyer
        ? 'Join as a verified advocate.'
        : 'Create your client account.'
      : isLawyer
        ? 'Advocate workspace awaits.'
        : 'Your legal workspace, ready when you are.';

  const subtitle =
    mode === 'signup'
      ? isLawyer
        ? 'Receive consultation requests, manage case files, and grow your practice online.'
        : 'Research the law, organise your matter, and connect with the right advocate.'
      : isLawyer
        ? 'Sign in to manage consultations, case files, and client requests.'
        : 'Sign in to research case law, track matters, and stay connected with advocates.';

  const bullets =
    mode === 'signup'
      ? isLawyer
        ? ['Consultation request inbox', 'Case file workspace', 'Verified advocate profile']
        : ['Structured case review', 'Lawyer directory access', 'Consultation booking']
      : isLawyer
        ? ['Secure client consultations', 'Practice dashboard', 'Verified profile access']
        : ['Private client workspace', 'AI-assisted research', 'Book verified advocates'];

  const footer = isLawyer
    ? mode === 'signup'
      ? 'Bar Council ID required for advocate verification.'
      : 'Licensed advocates only. Secure professional access.'
    : mode === 'signup'
      ? 'Free to start. No credit card required.'
      : 'Secure access for clients and licensed advocates.';

  return (
    <div className="auth-brand">
      <img
        key={imageSrc}
        className="auth-brand-img"
        src={imageSrc}
        alt={isLawyer ? 'Courtroom — advocate portal' : 'Lady Justice — Indian judiciary client portal'}
      />
      <div className="auth-brand-scrim" aria-hidden />
      <div className="auth-brand-glow" aria-hidden />

      <div className="auth-brand-content">
        <Link to="/" className="auth-brand-logo">
          <div className="auth-brand-mark">
            <Scale size={20} />
          </div>
          <span>
            Vakeel<span>Link</span>
          </span>
        </Link>

        <div className="auth-brand-body">
          <div className="auth-brand-pill">
            {isLawyer ? 'Advocate portal' : 'Client portal'}
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>

          <ul>
            {bullets.map((item) => (
              <li key={item}>
                <CheckCircle2 size={16} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand-foot">{footer}</p>
      </div>
    </div>
  );
}
