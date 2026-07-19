import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Scale,
  Search,
  MessageSquare,
  Users,
  Gavel,
  Shield,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Star,
  FileText,
  Building2,
  Home,
  Briefcase,
  Landmark,
  ShoppingBag,
  MapPin,
  Bot,
  Zap,
  Clock3,
  BadgeCheck,
  Mic2,
} from 'lucide-react';
import './LandingPage.css';

const promptExamples = [
  'Landlord increased rent by 40% with 7 days notice…',
  'Seller refused refund for a defective laptop…',
  'Cheque bounced under Section 138 NI Act…',
  'Need custody terms after mutual separation…',
];

const liveInsights = [
  { tag: 'Mapped', text: 'Consumer Protection Act, 2019', tone: 'blue' },
  { tag: 'Forum', text: 'District Consumer Commission', tone: 'teal' },
  { tag: 'Docs', text: 'Invoice · chats · delivery proof', tone: 'amber' },
  { tag: 'Match', text: '3 consumer-law advocates nearby', tone: 'violet' },
];

const leftHighlights = [
  { icon: Zap, label: 'AI brief', value: '< 30s', hint: 'avg. first draft' },
  { icon: BadgeCheck, label: 'Advocates', value: '500+', hint: 'verified network' },
  { icon: Clock3, label: 'Coverage', value: '12+', hint: 'practice areas' },
];

const domains = [
  { name: 'Criminal Law', icon: Gavel },
  { name: 'Family Law', icon: Users },
  { name: 'Corporate', icon: Building2 },
  { name: 'Property', icon: Home },
  { name: 'Constitutional', icon: Landmark },
  { name: 'Consumer Rights', icon: ShoppingBag },
];

const steps = [
  {
    step: '01',
    title: 'Describe your matter',
    desc: 'Write what happened in plain English. VakeelLink maps facts to Indian statutes and likely case type.',
    icon: MessageSquare,
  },
  {
    step: '02',
    title: 'Get structured research',
    desc: 'See relevant acts, case law highlights, risk flags, and a draft brief you can share with counsel.',
    icon: BookOpen,
  },
  {
    step: '03',
    title: 'Book a verified advocate',
    desc: 'Match with lawyers by practice area, city, and ratings—then book a consultation from one workspace.',
    icon: Users,
  },
];

const features = [
  {
    title: 'Indian case law search',
    desc: 'Query judgments and statutes with plain-language prompts. Get readable summaries, not walls of text.',
    icon: Search,
    points: ['RAG over Indian case corpus', 'Statute-aware answers', 'Citation-ready excerpts'],
  },
  {
    title: 'AI case curator',
    desc: 'Turn a messy dispute into a structured matter brief—domain, next steps, and documents to collect.',
    icon: Scale,
    points: ['Domain classification', 'Action checklist', 'Shareable client brief'],
  },
  {
    title: 'Verified advocate network',
    desc: 'Browse advocates by specialty and city. See ratings and book consults without endless cold calls.',
    icon: Shield,
    points: ['Domain + city filters', 'Client ratings', 'Consultation workflow'],
  },
];

const workflowPaths = [
  {
    title: 'Ask in plain English',
    desc: 'Describe your situation—AI maps statutes & next steps.',
    icon: MessageSquare,
    to: '/case-curator',
    accent: 'blue',
  },
  {
    title: 'Search case law',
    desc: 'Find relevant Indian judgments with readable summaries.',
    icon: Search,
    to: '/case-search',
    accent: 'teal',
  },
  {
    title: 'Browse statutes',
    desc: 'Jump into acts and provisions that apply to your matter.',
    icon: BookOpen,
    to: '/statutes',
    accent: 'violet',
  },
  {
    title: 'Book an advocate',
    desc: 'Filter by domain & city, then book a consultation.',
    icon: Users,
    to: '/lawyers',
    accent: 'amber',
  },
];

const marqueeItems = [
  'Delhi · NCR',
  'Mumbai',
  'Bengaluru',
  'Chennai',
  'Hyderabad',
  'Kolkata',
  'Pune',
  'Kochi',
  'Consumer Protection',
  'Family Law',
  'Property Disputes',
  'Criminal Defense',
  'Corporate Contracts',
  'Cheque Bounce',
  'Motor Accident',
  'Labour & Employment',
];

const testimonials = [
  {
    quote:
      'I finally understood which consumer forum to approach and what documents I needed—before I paid for a consult.',
    name: 'Ananya R.',
    role: 'Client · Bengaluru',
    initials: 'AR',
  },
  {
    quote:
      'The case curator brief saves me intake time. Clients arrive already organized around statutes and facts.',
    name: 'Adv. Rohan Mehta',
    role: 'Corporate counsel · Mumbai',
    initials: 'RM',
  },
  {
    quote:
      'Property dispute research used to mean days of scrolling. Here I get the relevant principles in one place.',
    name: 'Karthik S.',
    role: 'Client · Hyderabad',
    initials: 'KS',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const HERO_VIDEO = '/media/hero-legal-ai.mp4';
const HERO_POSTER = '/media/hero-legal-ai.jpg';

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [introLeaving, setIntroLeaving] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [insightIndex, setInsightIndex] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!showIntro) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      setIntroLeaving(true);
      window.setTimeout(() => setShowIntro(false), 650);
    }, 2800);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [showIntro]);

  // Typewriter for left-side AI prompt demo
  useEffect(() => {
    if (showIntro) return undefined;
    const full = promptExamples[promptIndex];
    let i = 0;
    setTyped('');
    const typeTimer = window.setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) {
        window.clearInterval(typeTimer);
        window.setTimeout(() => {
          setPromptIndex((p) => (p + 1) % promptExamples.length);
        }, 1800);
      }
    }, 28);
    return () => window.clearInterval(typeTimer);
  }, [promptIndex, showIntro]);

  // Rotate live insights under the prompt box
  useEffect(() => {
    if (showIntro) return undefined;
    const t = window.setInterval(() => {
      setInsightIndex((v) => (v + 1) % liveInsights.length);
    }, 2200);
    return () => window.clearInterval(t);
  }, [showIntro]);

  const dismissIntro = () => {
    if (introLeaving || !showIntro) return;
    setIntroLeaving(true);
    document.body.style.overflow = '';
    window.setTimeout(() => setShowIntro(false), 650);
  };

  return (
    <div className="lp">
      {/* First-launch intro animation */}
      {showIntro && (
        <div
          className={`lp-intro${introLeaving ? ' is-leaving' : ''}`}
          role="dialog"
          aria-label="Welcome to VakeelLink"
        >
          <div className="lp-intro-bg" aria-hidden>
            <video
              className="lp-intro-video"
              src={HERO_VIDEO}
              poster={HERO_POSTER}
              autoPlay
              muted
              playsInline
              loop
            />
            <div className="lp-intro-scrim" />
          </div>

          <div className="lp-intro-content">
            <div className="lp-intro-orb" aria-hidden />
            <div className="lp-intro-mark">
              <Scale size={28} />
            </div>
            <h2 className="lp-intro-title">
              Vakeel<span>Link</span>
            </h2>
            <p className="lp-intro-sub">AI legal intelligence for India</p>
            <div className="lp-intro-bar" aria-hidden>
              <span />
            </div>
            <button type="button" className="lp-intro-skip" onClick={dismissIntro}>
              Enter site
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <div className="lp-brand-mark lp-brand-mark--photo">
              <img src="/logo.png?v=2" alt="" />
            </div>
            <span className="lp-brand-name">
              Vakeel<span>Link</span>
            </span>
          </Link>

          <div className="lp-nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#domains">Practice areas</a>
            <Link to="/lawyers">Find lawyers</Link>
          </div>

          <div className="lp-nav-actions">
            <Link to="/login" className="lp-btn lp-btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
            <Link to="/signup" className="lp-btn lp-btn-primary">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-mesh" aria-hidden />
        <div className="lp-grid-bg" aria-hidden />
        <div className="lp-hero-inner">
          <motion.div
            className="lp-hero-left"
            initial="hidden"
            animate={showIntro ? 'hidden' : 'show'}
            variants={fadeUp}
            custom={0}
          >
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot">
                <Sparkles size={12} />
              </span>
              AI legal research for India
              <MapPin size={12} className="ml-0.5 opacity-70" />
            </div>

            <h1 className="lp-title">
              Know your legal options
              <span className="lp-title-accent">before you hire counsel.</span>
            </h1>

            <p className="lp-lead">
              Statute-aware AI research + verified advocates—clarify your matter, gather the right
              docs, and book counsel without the runaround.
            </p>

            {/* Live AI command panel — fills left side */}
            <div className="lp-command">
              <div className="lp-command-head">
                <div className="lp-command-live">
                  <span className="lp-command-pulse" />
                  Live AI intake
                </div>
                <div className="lp-command-tags">
                  <span>BNS / BNSS</span>
                  <span>Consumer</span>
                  <span>Property</span>
                </div>
              </div>

              <div className="lp-command-box">
                <div className="lp-command-icon">
                  <Mic2 size={16} />
                </div>
                <div className="lp-command-input">
                  <span className="lp-command-placeholder">Describe your situation…</span>
                  <p className="lp-command-typed">
                    {typed}
                    <span className="lp-caret" aria-hidden />
                  </p>
                </div>
                <Link to="/case-curator" className="lp-command-go" aria-label="Start case review">
                  <Search size={16} />
                </Link>
              </div>

              <div className="lp-insight-rail">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={liveInsights[insightIndex].text}
                    className={`lp-insight lp-insight-${liveInsights[insightIndex].tone}`}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.35 }}
                  >
                    <span>{liveInsights[insightIndex].tag}</span>
                    <strong>{liveInsights[insightIndex].text}</strong>
                  </motion.div>
                </AnimatePresence>
                <div className="lp-insight-dots" aria-hidden>
                  {liveInsights.map((_, i) => (
                    <i key={i} className={i === insightIndex ? 'is-on' : ''} />
                  ))}
                </div>
              </div>
            </div>

            <div className="lp-cta-row">
              <Link to="/case-curator" className="lp-btn lp-btn-primary lp-btn-lg">
                Start free case review
                <ArrowRight size={16} />
              </Link>
              <Link to="/signup?role=lawyer" className="lp-btn lp-btn-secondary lp-btn-lg">
                I am a lawyer
              </Link>
            </div>

            {/* Mini metric tiles */}
            <div className="lp-left-stats">
              {leftHighlights.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.label}
                    className="lp-left-stat"
                    initial={{ opacity: 0, y: 14 }}
                    animate={showIntro ? { opacity: 0, y: 14 } : { opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.08, duration: 0.4 }}
                  >
                    <div className="lp-left-stat-icon">
                      <Icon size={15} />
                    </div>
                    <div>
                      <div className="lp-left-stat-value">{item.value}</div>
                      <div className="lp-left-stat-label">
                        {item.label}
                        <span>{item.hint}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="lp-trust-row">
              <span className="lp-trust-item">
                <CheckCircle2 size={16} />
                Indian statutes & case law
              </span>
              <span className="lp-trust-item">
                <CheckCircle2 size={16} />
                Verified advocate network
              </span>
              <span className="lp-trust-item">
                <CheckCircle2 size={16} />
                Private client workspace
              </span>
            </div>
          </motion.div>

          {/* Animated hero visual + product preview */}
          <motion.div
            className="lp-preview"
            initial="hidden"
            animate={showIntro ? 'hidden' : 'show'}
            variants={fadeUp}
            custom={2}
          >
            <div className="lp-preview-glow" aria-hidden />
            <div className="lp-float-pill top">
              <Bot size={14} className="text-blue-600" />
              AI brief ready in seconds
            </div>
            <div className="lp-float-pill bottom">
              <span className="dot" />
              12 advocates matched nearby
            </div>

            <div className="lp-hero-media">
              <div className="lp-hero-media-ring" aria-hidden />
              <video
                className="lp-hero-video"
                src={HERO_VIDEO}
                poster={HERO_POSTER}
                autoPlay
                muted
                playsInline
                loop
                aria-label="Animated VakeelLink legal AI illustration"
              />
              <img
                className="lp-hero-fallback"
                src={HERO_POSTER}
                alt=""
                aria-hidden
              />
            </div>

            <div className="lp-preview-card lp-preview-card-overlay">
              <div className="lp-preview-top">
                <div className="lp-window-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="lp-preview-badge">
                  <FileText size={12} />
                  Live case preview
                </div>
              </div>

              <div className="lp-preview-body">
                <div className="lp-query-box">
                  <div className="lp-query-label">Client situation</div>
                  <div className="lp-query-text">
                    Ordered a laptop online · defective on delivery · seller refused full refund
                    after 18 days · WhatsApp + invoice available
                  </div>
                </div>

                <div className="lp-result-grid">
                  <div className="lp-result-chip">
                    <span>Likely domain</span>
                    <strong>Consumer Protection Act, 2019</strong>
                  </div>
                  <div className="lp-result-chip">
                    <span>Suggested forum</span>
                    <strong>District Consumer Commission</strong>
                  </div>
                </div>

                <div className="lp-match-row">
                  <div className="lp-avatar">MN</div>
                  <div className="lp-match-meta">
                    <h4>Adv. Meera Nair</h4>
                    <p>Consumer Rights · Kochi · 120+ matters</p>
                  </div>
                  <div className="lp-rating">
                    <Star size={12} fill="currentColor" />
                    4.8
                  </div>
                </div>

                <Link to="/signup" className="lp-btn lp-btn-primary" style={{ width: '100%' }}>
                  Start your review
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Workflow runway (replaces vanity stats) */}
      <section className="lp-runway" aria-label="What you can do">
        <div className="lp-runway-inner">
          <div className="lp-runway-label">
            <Sparkles size={14} />
            <span>Start anywhere</span>
            <em>Four ways to move your matter forward</em>
          </div>

          <div className="lp-runway-grid">
            {workflowPaths.map((path, i) => {
              const Icon = path.icon;
              return (
                <motion.div
                  key={path.title}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-30px' }}
                  variants={fadeUp}
                  custom={i}
                >
                  <Link to={path.to} className={`lp-path lp-path-${path.accent}`}>
                    <div className="lp-path-top">
                      <div className="lp-path-icon">
                        <Icon size={18} />
                      </div>
                      <span className="lp-path-num">0{i + 1}</span>
                    </div>
                    <h3>{path.title}</h3>
                    <p>{path.desc}</p>
                    <span className="lp-path-go">
                      Open
                      <ChevronRight size={14} />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="lp-marquee" aria-hidden>
          <div className="lp-marquee-track">
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <span key={`${item}-${i}`} className="lp-marquee-item">
                <i />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <motion.div
            className="lp-section-head"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <div className="lp-kicker">
              <Briefcase size={12} />
              Platform
            </div>
            <h2 className="lp-h2">Research, structure, and counsel—in one place</h2>
            <p className="lp-sub">
              Built for real Indian legal problems: consumer disputes, family matters, property
              issues, corporate contracts, and more. Concrete tools, not vague legal blogs.
            </p>
          </motion.div>

          <div className="lp-features">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.article
                  key={feature.title}
                  className="lp-feature"
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-40px' }}
                  variants={fadeUp}
                  custom={i}
                >
                  <div className="lp-feature-icon">
                    <Icon size={20} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.desc}</p>
                  <ul>
                    {feature.points.map((point) => (
                      <li key={point}>
                        <CheckCircle2 size={14} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="lp-section lp-section-alt">
        <div className="lp-container">
          <motion.div
            className="lp-section-head center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <div className="lp-kicker" style={{ justifyContent: 'center' }}>
              <Sparkles size={12} />
              Simple flow
            </div>
            <h2 className="lp-h2">From confusion to a clear next step</h2>
            <p className="lp-sub">
              Three practical steps—no legal jargon required. You stay in control; advocates get
              better briefs.
            </p>
          </motion.div>

          <div className="lp-steps">
            {steps.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.step}
                  className="lp-step"
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-40px' }}
                  variants={fadeUp}
                  custom={i}
                >
                  <div className="lp-step-top">
                    <div className="lp-step-icon">
                      <Icon size={20} />
                    </div>
                    <span className="lp-step-num">{item.step}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Domains */}
      <section id="domains" className="lp-section">
        <div className="lp-container">
          <div className="lp-domains-head">
            <motion.div
              className="lp-section-head"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <div className="lp-kicker">
                <Gavel size={12} />
                Practice areas
              </div>
              <h2 className="lp-h2">Specialists across the matters that matter</h2>
              <p className="lp-sub">
                Filter the advocate directory by domain and city. Jump straight to lawyers who
                actually practice that area of law.
              </p>
            </motion.div>
            <Link to="/lawyers" className="lp-link-inline">
              Browse full directory
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="lp-domain-grid">
            {domains.map((domain, i) => {
              const Icon = domain.icon;
              return (
                <motion.div
                  key={domain.name}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i * 0.5}
                >
                  <Link
                    to={`/lawyers?domain=${encodeURIComponent(domain.name)}`}
                    className="lp-domain"
                  >
                    <div className="lp-domain-icon">
                      <Icon size={18} />
                    </div>
                    <span>{domain.name}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="lp-section lp-section-alt">
        <div className="lp-container">
          <motion.div
            className="lp-section-head center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <div className="lp-kicker" style={{ justifyContent: 'center' }}>
              <Star size={12} />
              Trusted by clients & counsel
            </div>
            <h2 className="lp-h2">Clarity people actually use</h2>
            <p className="lp-sub">
              Whether you need a first-cut legal map or a faster client intake, VakeelLink keeps
              the path concrete.
            </p>
          </motion.div>

          <div className="lp-quotes">
            {testimonials.map((t, i) => (
              <motion.blockquote
                key={t.name}
                className="lp-quote"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
                custom={i}
              >
                <div className="lp-stars" aria-label="5 star rating">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star key={idx} size={14} fill="currentColor" />
                  ))}
                </div>
                <p>“{t.quote}”</p>
                <div className="lp-quote-author">
                  <div className="lp-avatar" style={{ width: '2.25rem', height: '2.25rem', fontSize: '0.7rem' }}>
                    {t.initials}
                  </div>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </div>
              </motion.blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Lawyer CTA */}
      <section className="lp-cta-band">
        <div className="lp-container">
          <motion.div
            className="lp-cta-panel"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <div className="lp-cta-panel-grid">
              <div>
                <h2>Practice online. Reach clients who already know their matter.</h2>
                <p>
                  Join the advocate network to manage consultations, receive structured case
                  briefs, and grow a professional digital practice across India.
                </p>
              </div>
              <div className="lp-cta-actions">
                <Link to="/signup?role=lawyer" className="lp-btn lp-btn-white">
                  Register as advocate
                </Link>
                <Link to="/login" className="lp-btn lp-btn-outline-light">
                  Lawyer sign in
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Link to="/" className="lp-brand">
                <div
                  className="lp-brand-mark lp-brand-mark--photo"
                  style={{ width: '2rem', height: '2rem', borderRadius: '0.55rem' }}
                >
                  <img src="/logo.png?v=2" alt="" />
                </div>
                <span className="lp-brand-name" style={{ fontSize: '1.05rem' }}>
                  Vakeel<span>Link</span>
                </span>
              </Link>
              <p>
                AI-powered legal research and verified advocates—so Indians can move from
                uncertainty to a clear next step.
              </p>
            </div>

            {[
              {
                title: 'Product',
                links: [
                  { label: 'Find lawyers', to: '/lawyers' },
                  { label: 'Case review', to: '/case-curator' },
                  { label: 'AI research', to: '/case-search' },
                  { label: 'Sign in', to: '/login' },
                ],
              },
              {
                title: 'For lawyers',
                links: [
                  { label: 'Join network', to: '/signup?role=lawyer' },
                  { label: 'Dashboard', to: '/login' },
                ],
              },
              {
                title: 'Company',
                links: [
                  { label: 'About', to: '#' },
                  { label: 'Privacy', to: '#' },
                  { label: 'Contact', to: '#' },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4>{col.title}</h4>
                <ul>
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lp-footer-bottom">
            <p>© {new Date().getFullYear()} VakeelLink. All rights reserved.</p>
            <p>Not a substitute for professional legal advice.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
