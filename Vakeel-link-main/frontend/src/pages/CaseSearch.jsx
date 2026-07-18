import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  Scale,
  Gavel,
  Calendar,
  Tag,
  FileText,
  Quote,
  X,
  CheckCircle2,
  Filter,
  Users,
  MessageSquare,
  Loader2,
  Sparkles,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import { askLegalAi } from '../utils/legalAi';

const MOCK_CASES = [
  {
    id: 1,
    name: 'Maneka Gandhi vs Union of India',
    citation: '1978 AIR 597',
    court: 'Supreme Court',
    year: 1978,
    domain: 'Constitutional Law',
    judges: ['Justice Y.V. Chandrachud', 'Justice V.R. Krishna Iyer'],
    summary:
      'The court established that the procedure established by law must be just, fair, and reasonable, and not arbitrary, fanciful, or oppressive. This case significantly expanded the scope of Article 21.',
    fullText:
      "This landmark judgment expanded the interpretation of Article 21 of the Indian Constitution. The Supreme Court held that the right to life and personal liberty cannot be curtailed except by a procedure that is just, fair, and reasonable. The court overruled the earlier A.K. Gopalan case and held that Fundamental Rights are not mutually exclusive but are interrelated. Justice V.R. Krishna Iyer observed that the expression 'procedure established by law' in Article 21 must be read in conjunction with Articles 14 and 19, creating what is now known as the 'golden triangle' of fundamental rights.",
  },
  {
    id: 2,
    name: 'Vishaka vs State of Rajasthan',
    citation: '1997 (6) SCC 241',
    court: 'Supreme Court',
    year: 1997,
    domain: 'Constitutional Law',
    judges: ['Justice J.S. Verma', 'Justice Sujata Manohar'],
    summary:
      'Landmark judgment that laid down guidelines to prevent sexual harassment of women at the workplace, before the enactment of the POSH Act.',
    fullText:
      'In this landmark PIL, the Supreme Court of India laid down exhaustive guidelines — popularly known as the Vishaka Guidelines — to be mandatorily followed by employers to prevent and address sexual harassment of women at workplaces. The court held that gender equality and the right to work with dignity are Fundamental Rights under Articles 14, 15, and 21 of the Constitution. These guidelines remained the law of the land until the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 was enacted.',
  },
  {
    id: 3,
    name: 'State of Maharashtra vs Madhkar Narayan',
    citation: '1991 AIR 207',
    court: 'Supreme Court',
    year: 1991,
    domain: 'Criminal Law',
    judges: ['Justice K.N. Singh'],
    summary:
      'The court held that every woman is entitled to her privacy and no one can trespass into her privacy at any time.',
    fullText:
      'The Supreme Court in this judgment strongly affirmed the right to privacy of women. The court categorically stated that every woman is entitled to sexual privacy and it is not open to any and every person to violate her privacy as and when he wishes. The judgment reinforced that consent is central to any sexual act and its absence constitutes a criminal offence regardless of the social standing or character of the woman.',
  },
  {
    id: 4,
    name: 'Lakhanpal vs National Insurance Co.',
    citation: '2021 ACJ 1450',
    court: 'High Court',
    year: 2021,
    domain: 'Motor Accident',
    judges: ['Justice Sureshwar Thakur'],
    summary:
      'Compensation awarded for permanent disability in a motor accident claim. Court applied structured formula for loss of future earnings and medical expenses.',
    fullText:
      "The claimant suffered 40% permanent disability following a road accident involving an uninsured vehicle. The High Court applied the multiplier method as laid down by the Supreme Court in Sarla Verma vs Delhi Transport Corporation. The court awarded enhanced compensation including loss of earning capacity, pain and suffering, and future medical expenses. The court emphasized that just compensation must be awarded without being niggardly and the victim's rehabilitation must be the primary consideration.",
  },
  {
    id: 5,
    name: 'Naveen Kohli vs Neelu Kohli',
    citation: '2006 (4) SCC 558',
    court: 'Supreme Court',
    year: 2006,
    domain: 'Family Law',
    judges: ['Justice R.C. Lahoti', 'Justice G.P. Mathur'],
    summary:
      'The Supreme Court recommended amendment to the Hindu Marriage Act to include irretrievable breakdown of marriage as a ground for divorce.',
    fullText:
      'The Supreme Court in this significant matrimonial case held that where there has been a complete breakdown of marital relationship, compelling the parties to live together would serve no useful purpose. The court recommended to the Parliament to consider adding irretrievable breakdown of marriage as an additional ground for divorce under the Hindu Marriage Act 1955. The judgment noted that both parties had been living separately for several years and forcing continuation of a dead marriage caused more harm than allowing a dignified separation.',
  },
  {
    id: 6,
    name: 'S.P. Gupta vs President Of India And Ors.',
    citation: 'AIR 1982 SC 149',
    court: 'Supreme Court',
    year: 1981,
    domain: 'Constitutional Law',
    judges: ['Justice P.N. Bhagwati'],
    summary:
      "Known as the Judges' Transfer case, it dealt with the independence of the judiciary and the appointment/transfer of judges.",
    fullText:
      "This case is a cornerstone of judicial independence in India. Justice P.N. Bhagwati, writing for the majority, held that the 'opinion' of the Chief Justice of India does not have primacy over the executive in judicial appointments. However, he emphasized that any appointment must be made through a process of 'consultation' which must be effective and not a mere formality. This case also significantly liberalized the rule of 'locus standi', paving the way for Public Interest Litigation (PIL) in India.",
  },
  {
    id: 7,
    name: 'Aruna Ramchandra Shanbaug vs Union Of India',
    citation: '2011 (4) SCC 454',
    court: 'Supreme Court',
    year: 2011,
    domain: 'Criminal Law',
    judges: ['Justice Markandey Katju', 'Justice Gyan Sudha Misra'],
    summary:
      'Landmark case on passive euthanasia in India. The court allowed passive euthanasia under strict guidelines.',
    fullText:
      'In response to a petition filed by Pinki Virani for the mercy killing of Aruna Shanbaug, who had been in a vegetative state for 37 years, the Supreme Court of India laid down guidelines for passive euthanasia. The court distinguished between active and passive euthanasia, allowing the latter in exceptional circumstances under judicial supervision. It held that the right to life under Article 21 includes the right to live with dignity, which also extends to the process of dying.',
  },
];

const CaseSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tempSearchQuery, setTempSearchQuery] = useState('');
  const [activeCourt, setActiveCourt] = useState('All Courts');
  const [selectedCase, setSelectedCase] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [aiHits, setAiHits] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiMeta, setAiMeta] = useState(null);

  const [tempFilters, setTempFilters] = useState({
    yearFrom: '',
    yearTo: '',
    judgeName: '',
    domains: [],
  });

  const [appliedFilters, setAppliedFilters] = useState({
    yearFrom: '',
    yearTo: '',
    judgeName: '',
    domains: [],
  });

  const [isTransitioning, setIsTransitioning] = useState(false);

  const domains = [
    'Constitutional Law',
    'Criminal Law',
    'Consumer Law',
    'Family Law',
    'Labour Law',
    'Motor Accident',
  ];

  const getDomainStyles = (domain) => {
    switch (domain) {
      case 'Constitutional Law':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Criminal Law':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Family Law':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'Consumer Law':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Labour Law':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Motor Accident':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const filteredCases = useMemo(() => {
    return MOCK_CASES.filter((c) => {
      const matchesSearch =
        searchQuery === '' ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.citation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.summary.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCourt = activeCourt === 'All Courts' || c.court === activeCourt;

      const matchesYearFrom =
        appliedFilters.yearFrom === '' || c.year >= parseInt(appliedFilters.yearFrom, 10);
      const matchesYearTo =
        appliedFilters.yearTo === '' || c.year <= parseInt(appliedFilters.yearTo, 10);
      const matchesJudge =
        appliedFilters.judgeName === '' ||
        c.judges.some((j) => j.toLowerCase().includes(appliedFilters.judgeName.toLowerCase()));
      const matchesDomain =
        appliedFilters.domains.length === 0 || appliedFilters.domains.includes(c.domain);

      return (
        matchesSearch && matchesCourt && matchesYearFrom && matchesYearTo && matchesJudge && matchesDomain
      );
    });
  }, [searchQuery, activeCourt, appliedFilters]);

  const handleCite = (citation) => {
    navigator.clipboard.writeText(citation);
    setToast({ show: true, message: 'Citation copied to clipboard' });
    setTimeout(() => setToast({ show: false, message: '' }), 2500);
  };

  const toggleDomainFilter = (domain) => {
    setTempFilters((prev) => ({
      ...prev,
      domains: prev.domains.includes(domain)
        ? prev.domains.filter((d) => d !== domain)
        : [...prev.domains, domain],
    }));
  };

  const handleApplyFilters = async () => {
    const q = tempSearchQuery.trim();
    setIsTransitioning(true);
    setSearchQuery(q);
    setAppliedFilters(tempFilters);
    setAiError('');
    setTimeout(() => {
      setIsTransitioning(false);
      if (window.innerWidth < 768) {
        window.scrollTo({ top: 400, behavior: 'smooth' });
      }
    }, 200);

    // Live legal AI / RAG when the user types a real query
    if (q.length >= 4) {
      setAiLoading(true);
      try {
        const data = await askLegalAi(
          `Legal research query for Indian case law and statutes: ${q}. ` +
            `Return relevant analysis and list important cases, sections, and acts.`
        );
        const fromCited = (data.cited_cases || []).map((name, i) => ({
          id: `ai-case-${i}-${name}`,
          name: typeof name === 'string' ? name : String(name),
          citation: 'AI / corpus match',
          court: 'Retrieved authority',
          year: new Date().getFullYear(),
          domain: data.domain ? String(data.domain).replace(/^legal_/, '').replace(/_/g, ' ') : 'General',
          judges: [],
          summary: (data.summary || data.analysis || '').slice(0, 280),
          fullText: data.analysis || data.answer || data.summary || '',
          fromAi: true,
        }));
        const fromCitations = (data.citations || []).slice(0, 8).map((c, i) => ({
          id: `ai-cit-${i}`,
          name: c.title || c.text || c.citation_text || `Citation ${i + 1}`,
          citation: c.source_collection || c.source || 'Legal store',
          court: 'Corpus',
          year: new Date().getFullYear(),
          domain: data.domain ? String(data.domain).replace(/^legal_/, '').replace(/_/g, ' ') : 'General',
          judges: [],
          summary: c.excerpt || c.text || '',
          fullText: c.full_text || c.excerpt || c.text || '',
          fromAi: true,
        }));
        const merged = [...fromCited, ...fromCitations];
        // de-dupe by normalized name (no duplicate authorities in the list)
        const seen = new Set();
        setAiHits(
          merged.filter((m) => {
            const key = String(m.name || '')
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
        );
        setAiMeta({
          provider: data.llm_provider,
          analysis: data.analysis || data.answer,
          domain: data.domain,
        });
      } catch (err) {
        setAiHits([]);
        setAiMeta(null);
        setAiError(err.message || 'Live legal search unavailable — showing library matches only.');
      } finally {
        setAiLoading(false);
      }
    } else {
      setAiHits([]);
      setAiMeta(null);
    }
  };

  const clearFilters = () => {
    const defaultFilters = {
      yearFrom: '',
      yearTo: '',
      judgeName: '',
      domains: [],
    };
    setTempFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setActiveCourt('All Courts');
    setSearchQuery('');
    setTempSearchQuery('');
    setAiHits([]);
    setAiMeta(null);
    setAiError('');
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 pl-0 md:pl-[260px] lg:pl-[280px]">
        <div className="mx-auto max-w-[1440px] p-4 md:p-8">
          <header className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">Research</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#0f2d5e]">Case search</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Search landmark judgments in the library, and run live legal AI research (Groq / Gemini + retrieval) on your query.
            </p>
          </header>

          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-3 px-2">
              <Search className="shrink-0 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by case name, citation, or legal query..."
                className="w-full bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                value={tempSearchQuery}
                onChange={(e) => setTempSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              />
            </div>
            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={isTransitioning || aiLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              {aiLoading ? <Loader2 size={16} className="animate-spin" /> : null}
              Search {aiLoading ? '' : <ArrowRight size={16} />}
            </button>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {['All Courts', 'Supreme Court', 'High Court', 'Tribunals'].map((court) => (
              <button
                key={court}
                onClick={() => setActiveCourt(court)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  activeCourt === court
                    ? 'border-blue-600 bg-blue-700 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {court}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-8 xl:flex-row">
            <div className="min-w-0 flex-1 space-y-4">
              {aiLoading && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
                  <Loader2 size={16} className="animate-spin" />
                  Searching legal knowledge base with AI…
                </div>
              )}
              {aiError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {aiError}
                </div>
              )}
              {aiMeta?.analysis && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#0f2d5e]">
                    <Sparkles size={16} className="text-blue-600" />
                    AI research brief
                    {aiMeta.provider && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {aiMeta.provider}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-6 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {aiMeta.analysis}
                  </p>
                </div>
              )}

              {aiHits.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">
                    Live retrieval · {aiHits.length} hit{aiHits.length === 1 ? '' : 's'}
                  </p>
                  {aiHits.map((c) => (
                    <article
                      key={c.id}
                      className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm ring-1 ring-emerald-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="text-base font-semibold text-[#0f2d5e]">{c.name}</h2>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          RAG
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCase(c)}
                          className="rounded-lg bg-[#0f2d5e] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Read
                        </button>
                        <Link
                          to={`/lawyers?domain=${encodeURIComponent(c.domain)}`}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                        >
                          Find lawyers
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <p className="text-sm text-slate-500">
                Library · <span className="font-semibold text-slate-800">{filteredCases.length}</span>{' '}
                landmark judgment{filteredCases.length === 1 ? '' : 's'}
              </p>

              <div
                className={`space-y-4 transition-opacity ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}
              >
                {filteredCases.map((c) => (
                  <article
                    key={c.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold text-[#0f2d5e]">{c.name}</h2>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            {c.court} · {c.year}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getDomainStyles(c.domain)}`}
                          >
                            {c.domain}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Citation
                        </p>
                        <p className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-700">
                          {c.citation}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">
                      {c.summary}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      <button
                        onClick={() => setSelectedCase(c)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#0f2d5e] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#143974]"
                      >
                        <FileText size={15} /> Read judgment
                      </button>
                      <button
                        onClick={() => handleCite(c.citation)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <Quote size={15} /> Copy cite
                      </button>
                      <Link
                        to={`/lawyers?domain=${encodeURIComponent(c.domain)}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        <Users size={15} /> Find lawyers
                      </Link>
                      <Link
                        to="/assistant"
                        state={{ prefill: `Analyze and summarize: ${c.name} (${c.citation}). ${c.summary}` }}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <MessageSquare size={15} /> Ask AI
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {filteredCases.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Search size={28} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">No judgments found</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Try broadening your search or clearing filters.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800"
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </div>

            <aside className="w-full shrink-0 xl:w-80">
              <div className="sticky top-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[#0f2d5e]">
                    <Filter size={16} className="text-blue-600" /> Filters
                  </h3>
                  <button
                    onClick={clearFilters}
                    className="text-xs font-semibold text-slate-400 hover:text-rose-600"
                  >
                    Clear all
                  </button>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Date range
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="From"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={tempFilters.yearFrom}
                        onChange={(e) =>
                          setTempFilters((prev) => ({ ...prev, yearFrom: e.target.value }))
                        }
                      />
                      <span className="text-slate-300">–</span>
                      <input
                        type="number"
                        placeholder="To"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={tempFilters.yearTo}
                        onChange={(e) =>
                          setTempFilters((prev) => ({ ...prev, yearTo: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Bench / judge
                    </label>
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={14}
                      />
                      <input
                        type="text"
                        placeholder="Judge name..."
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={tempFilters.judgeName}
                        onChange={(e) =>
                          setTempFilters((prev) => ({ ...prev, judgeName: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Legal domain
                    </label>
                    <div className="space-y-2">
                      {domains.map((domain) => (
                        <label key={domain} className="flex cursor-pointer items-center gap-2.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                            checked={tempFilters.domains.includes(domain)}
                            onChange={() => toggleDomainFilter(domain)}
                          />
                          <span className="text-sm text-slate-700">{domain}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleApplyFilters}
                    disabled={isTransitioning}
                    className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
                  >
                    {isTransitioning ? 'Applying…' : 'Apply filters'}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {selectedCase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 md:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Scale size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#0f2d5e] md:text-xl">
                    {selectedCase.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">
                      {selectedCase.citation}
                    </span>
                    <span>{selectedCase.court}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-6">
              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Year', val: selectedCase.year, icon: Calendar },
                  { label: 'Bench', val: selectedCase.judges.join(', '), icon: Gavel },
                  { label: 'Domain', val: selectedCase.domain, icon: Tag },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <stat.icon size={12} />
                      {stat.label}
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{stat.val}</p>
                  </div>
                ))}
              </div>
              <p className="text-base leading-relaxed text-slate-700">{selectedCase.fullText}</p>
            </div>

            <div className="flex flex-col justify-end gap-2 border-t border-slate-100 p-4 sm:flex-row">
              <button
                onClick={() => handleCite(selectedCase.citation)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Copy citation
              </button>
              <button
                onClick={() => setSelectedCase(null)}
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg">
          <CheckCircle2 size={18} className="text-emerald-600" />
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default CaseSearch;
