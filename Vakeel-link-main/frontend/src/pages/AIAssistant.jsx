import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  FileText,
  Gavel,
  Info,
  Loader2,
  Quote,
  Scale,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import { API_BASE_URL } from '../utils/api';

const AI_ENDPOINTS = ['/api/v1/query/ask', '/api/query/ask'];

const LOADING_STEPS = [
  {
    title: 'Validating query',
    detail: 'Checking the question format and preparing the legal retrieval request.',
  },
  {
    title: 'Searching knowledge base',
    detail: 'Pulling embeddings and nearby legal passages from the retrieval store.',
  },
  {
    title: 'Collecting citations',
    detail: 'Matching the most relevant sections, acts, and case references.',
  },
  {
    title: 'Drafting analysis',
    detail: 'Structuring Facts, Issues, Analysis, and Conclusion with citations.',
  },
];

const SECTION_META = {
  facts: {
    label: 'Facts',
    color: 'text-sky-700',
    border: 'border-sky-200',
    bg: 'bg-sky-50',
  },
  issues: {
    label: 'Legal Issues',
    color: 'text-amber-700',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
  },
  analysis: {
    label: 'Analysis',
    color: 'text-blue-700',
    border: 'border-blue-200',
    bg: 'bg-blue-50',
  },
  conclusion: {
    label: 'Conclusion',
    color: 'text-emerald-700',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
  },
};

function parseStructuredAnalysis(text) {
  if (!text || typeof text !== 'string') return null;

  const sections = { facts: '', issues: '', analysis: '', conclusion: '' };
  const splitRegex = /(?=(?:^|\n)\s*#*\s*(?:Facts|Issues|Analysis|Conclusion)\s*:?\s*)/i;
  const headerRegex = /^\s*#*\s*(Facts|Issues|Analysis|Conclusion)\s*:?\s*/i;

  if (!text.match(/(?:Facts|Issues|Analysis|Conclusion)\s*:/i)) {
    return null;
  }

  const parts = text
    .split(splitRegex)
    .map((p) => p.trim())
    .filter(Boolean);
  parts.forEach((part) => {
    const match = part.match(headerRegex);
    if (!match) {
      if (!sections.analysis) sections.analysis = part;
      return;
    }
    const key = match[1].toLowerCase();
    const body = part.replace(headerRegex, '').trim();
    if (key in sections) sections[key] = body;
  });

  if (!sections.facts && !sections.issues && !sections.analysis && !sections.conclusion) {
    return null;
  }
  return sections;
}

function formatDomain(domain) {
  if (!domain) return 'General Law';
  return String(domain)
    .replace(/^legal_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scorePercent(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  if (n > 1.5) return Math.min(99, Math.round(n * 10));
  return Math.max(0, Math.min(99, Math.round(n * 100)));
}

const AIAssistant = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [fullTextModalOpen, setFullTextModalOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [activeTab, setActiveTab] = useState('structured');

  useEffect(() => {
    if (!loading) {
      const t = window.setTimeout(() => setLoadingStep(0), 0);
      return () => window.clearTimeout(t);
    }
    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % LOADING_STEPS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [loading]);

  const analysisText = useMemo(() => {
    if (!response) return '';
    return response.analysis || response.summary || response.answer || '';
  }, [response]);

  const structured = useMemo(() => parseStructuredAnalysis(analysisText), [analysisText]);

  const allCitationsRaw = useMemo(() => {
    return (response?.citations || []).map((item, index) => ({
      id: `${item.source_collection || 'source'}-${item.text || item.title || 'cit'}-${index}`,
      type: item.type || 'source',
      title: item.title || item.text || 'Legal Citation',
      text: item.text || item.title || '',
      source: item.source_collection || item.source || 'Legal Store',
      excerpt: item.excerpt || 'No excerpt available from the retrieved context.',
      fullText: item.full_text || item.excerpt || 'No full text available.',
      score: Number.isFinite(Number(item.score))
        ? Number(item.score)
        : Number(response?.confidence_score || 0),
    }));
  }, [response]);

  const allCitations = useMemo(() => {
    const seen = new Set();
    return allCitationsRaw.filter((cit) => {
      // Stronger dedupe: type + normalized title + short excerpt fingerprint
      const title = String(cit.title || cit.text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      const excerpt = String(cit.excerpt || '')
        .toLowerCase()
        .slice(0, 60)
        .replace(/\s+/g, ' ')
        .trim();
      const key = `${String(cit.type || 'src').toLowerCase()}|${title}|${excerpt}`;
      if (!title || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allCitationsRaw]);

  const fallbackCitations = useMemo(() => {
    if (allCitations.length) return [];
    const seen = new Set();
    const push = (type, item, index, source) => {
      const title = String(item || '').trim();
      const key = `${type}|${title.toLowerCase()}`;
      if (!title || seen.has(key)) return null;
      seen.add(key);
      return {
        id: `${type}-${index}-${title.slice(0, 24)}`,
        type,
        title,
        text: title,
        source,
        excerpt: `${type === 'section' ? 'Section' : type === 'case' ? 'Case' : 'Act'} reference: ${title}`,
        fullText: `Full text for ${title} was listed by the model but not attached from the corpus.`,
        score: Number(response?.confidence_score || 0),
      };
    };
    return [
      ...(response?.cited_sections || []).map((item, index) => push('section', item, index, 'Statutes')),
      ...(response?.cited_cases || []).map((item, index) => push('case', item, index, 'Precedents')),
      ...(response?.cited_acts || []).map((item, index) => push('act', item, index, 'Legislations')),
    ].filter(Boolean);
  }, [allCitations.length, response]);

  const displayedCitations = allCitations.length ? allCitations : fallbackCitations;

  const handleViewFullText = (citation) => {
    setSelectedCitation(citation);
    setFullTextModalOpen(true);
  };

  const handleSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setLoading(true);
    setError('');
    setLoadingStep(0);
    setResponse(null);
    setActiveTab('structured');

    try {
      const token = localStorage.getItem('vakeellink_token');
      const authToken = token && token !== 'mock_jwt_token' ? token : null;
      let data = null;
      let lastError = null;

      for (const endpoint of AI_ENDPOINTS) {
        try {
          const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({ query: trimmedQuery }),
          });

          if (!res.ok) {
            let detail = `Request failed with status ${res.status}`;
            try {
              const body = await res.json();
              detail = body?.detail || body?.message || detail;
              if (Array.isArray(detail)) {
                detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
              }
            } catch {
              /* ignore parse errors */
            }
            if (res.status === 429) {
              lastError = new Error(
                typeof detail === 'string'
                  ? detail
                  : 'AI rate limit reached. Please wait about a minute and try again.'
              );
            } else {
              lastError = new Error(typeof detail === 'string' ? detail : `Error ${res.status}`);
            }
            if (res.status === 404) continue;
            break;
          }

          data = await res.json();
          break;
        } catch (endpointErr) {
          lastError = endpointErr;
        }
      }

      if (!data) {
        throw lastError || new Error('Failed to fetch response from the legal AI service.');
      }

      setResponse(data);
      const text = data.analysis || data.summary || data.answer || '';
      if (!parseStructuredAnalysis(text)) {
        setActiveTab('full');
      }
    } catch (err) {
      setError(err.message || 'Unable to load response. Check that the backend is running.');
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const typeBadgeClass = (type) => {
    const t = String(type || '').toLowerCase();
    if (t === 'case') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (t === 'section') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (t === 'act') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 md:pl-[260px] lg:pl-[280px]">
        <div className="mx-auto max-w-[1440px] p-4 md:p-8">
          {/* Hero banner — matches client portal style */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-[#0f2d5e] via-[#163a75] to-[#0f2d5e] px-6 py-8 text-white shadow-sm md:px-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">
                  <Sparkles size={12} /> Legal research
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">AI Assistant</h1>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/90">
                  Ask a clear question about Indian law. We retrieve authorities, then draft a structured memo
                  (Facts · Issues · Analysis · Conclusion) with de-duplicated citations.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                  Groq / Gemini
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                  RAG retrieval
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                  Not legal advice
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Left: composer */}
            <div className="space-y-4 xl:col-span-5">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Your question</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Be specific — parties, statute, and what you want to know.</p>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col">
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. My spouse filed for mutual consent divorce under HMA. Can the six-month wait be waived? What documents are needed?"
                    className="min-h-[200px] w-full resize-y border-0 bg-transparent p-5 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 md:min-h-[240px]"
                  />
                  <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      <Shield size={14} className="text-blue-600" />
                      Retrieval-grounded · Verify primary sources
                    </span>
                    <button
                      type="submit"
                      disabled={loading || !query.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          Generate analysis
                          <Sparkles size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Try a prompt</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Remedies for cruelty in divorce under HMA',
                    'Section 84 IPC insanity defense — key elements',
                    'Motor accident compensation under MV Act — multiplier',
                  ].map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() => setQuery(hint)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-[#0f2d5e]"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">How it works</h3>
                <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
                  <li>1. Your question is embedded and matched to the legal corpus.</li>
                  <li>2. Top passages are passed to the LLM (Groq, with Gemini fallback).</li>
                  <li>3. You get a structured memo plus unique citations (duplicates removed).</li>
                </ol>
              </div>
            </div>

            {/* Right: results workspace (always visible) */}
            <div className="xl:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Bot size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-[#0f2d5e]">Analysis workspace</h2>
                      <p className="truncate text-xs text-slate-500">
                        {loading
                          ? 'Synthesizing response…'
                          : response
                            ? `${formatDomain(response.domain)} · ${scorePercent(response.confidence_score)}% confidence`
                            : 'Results appear here after you generate'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-220px)] min-h-[420px] overflow-y-auto p-5">
                  {!loading && !response && !error && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                        <Scale size={26} />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-900">Ready when you are</h3>
                      <p className="mt-2 max-w-sm text-sm text-slate-500">
                        Enter a legal question on the left and click Generate. Citations will list each authority once.
                      </p>
                    </div>
                  )}

                  {loading ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-6">
                  <div className="relative">
                    <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-100 border-t-blue-600" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Scale size={22} className="text-blue-600" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      Step {loadingStep + 1} of {LOADING_STEPS.length}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-[#0f2d5e]">
                      {LOADING_STEPS[loadingStep].title}
                    </h3>
                    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                      {LOADING_STEPS[loadingStep].detail}
                    </p>
                  </div>
                  <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>
              ) : error ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 px-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <AlertTriangle size={28} />
                  </div>
                  <div className="max-w-lg">
                    <h3 className="text-lg font-semibold text-slate-900">Could not complete analysis</h3>
                    <p className="mt-2 text-sm text-slate-600">{error}</p>
                    {(error.toLowerCase().includes('rate') || error.includes('429')) && (
                      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-amber-700">
                        <Info size={14} />
                        Free API tiers may reset after a short wait.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setError('')}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      Retry query
                    </button>
                  </div>
                </div>
              ) : response ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      Domain: {formatDomain(response.domain)}
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {scorePercent(response.confidence_score)}% confidence
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {displayedCitations.length} citation
                      {displayedCitations.length === 1 ? '' : 's'}
                    </span>
                    {response.llm_provider && response.llm_provider !== 'none' && (
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        via {response.llm_provider}
                      </span>
                    )}
                  </div>

                  {(response.retrieval_status === 'degraded' || response.retrieval_notice) && (
                    <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                          {response.retrieval_status === 'degraded' ? 'Degraded retrieval' : 'Retrieval note'}
                          {response.retrieval_backend ? ` · ${response.retrieval_backend}` : ''}
                          {response.llm_provider ? ` · LLM: ${response.llm_provider}` : ''}
                        </p>
                        <p className="leading-relaxed">
                          {response.retrieval_notice ||
                            'Vector search quality was limited. Treat legal citations as provisional and verify primary sources.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <section className="space-y-3">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
                        <Shield size={14} />
                        Legal analysis
                      </div>
                      <div className="flex self-start rounded-lg border border-slate-200 bg-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab('structured')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                            activeTab === 'structured'
                              ? 'bg-blue-700 text-white'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Structured
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('full')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                            activeTab === 'full'
                              ? 'bg-blue-700 text-white'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Full text
                        </button>
                      </div>
                    </div>

                    {activeTab === 'structured' && structured ? (
                      <div className="space-y-3">
                        {Object.entries(SECTION_META).map(([key, meta]) => {
                          const body = structured[key];
                          if (!body) return null;
                          return (
                            <div
                              key={key}
                              className={`rounded-xl border p-4 md:p-5 ${meta.border} ${meta.bg}`}
                            >
                              <div
                                className={`mb-2 text-xs font-bold uppercase tracking-wider ${meta.color}`}
                              >
                                {meta.label}
                              </div>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 md:text-base">
                                {body}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : activeTab === 'structured' && !structured ? (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5">
                        <div className="flex items-start gap-2 text-sm text-slate-500">
                          <Info size={16} className="mt-0.5 shrink-0" />
                          Structured headers were not detected — showing the full analysis below.
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 md:text-base">
                          {analysisText}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 md:text-base">
                          {analysisText}
                        </p>
                      </div>
                    )}

                    {response.disclaimer && (
                      <div className="flex items-start gap-2 pt-1 text-xs italic text-slate-500">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
                        {response.disclaimer}
                      </div>
                    )}
                  </section>

                  {(response.cited_sections?.length > 0 ||
                    response.cited_acts?.length > 0 ||
                    response.cited_cases?.length > 0) && (
                    <section className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Referenced law
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(response.cited_sections || []).map((s) => (
                          <span
                            key={`sec-${s}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                          >
                            <BookOpen size={12} /> {s}
                          </span>
                        ))}
                        {(response.cited_acts || []).map((a) => (
                          <span
                            key={`act-${a}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                          >
                            <Scale size={12} /> {a}
                          </span>
                        ))}
                        {(response.cited_cases || []).map((c) => (
                          <span
                            key={`case-${c}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800"
                          >
                            <Gavel size={12} /> {c}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {displayedCitations.length > 0 ? (
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Quote size={14} className="text-blue-600" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Grounded citations
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {displayedCitations.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <span
                                className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${typeBadgeClass(item.type)}`}
                              >
                                {item.type}
                              </span>
                              <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                                {scorePercent(item.score)}% match
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              {item.source}
                            </p>
                            <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-600">
                              &ldquo;{item.excerpt}&rdquo;
                            </p>
                            <button
                              type="button"
                              onClick={() => handleViewFullText(item)}
                              className="mt-3 inline-flex items-center gap-1.5 self-start text-xs font-semibold text-blue-700 hover:text-blue-800"
                            >
                              <FileText size={13} /> Read full excerpt
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                      No document-level citations were returned. Try a more specific question with
                      acts or section numbers.
                    </div>
                  )}

                  {response.recommended_lawyers?.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Recommended specialists
                      </h3>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {response.recommended_lawyers.slice(0, 3).map((lawyer) => (
                          <Link
                            key={lawyer.id}
                            to={lawyer.id ? `/lawyers/${lawyer.id}` : '/lawyers'}
                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0f2d5e] text-xs font-bold text-white">
                              {(lawyer.name || 'A')
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {lawyer.name}
                              </div>
                              <div className="truncate text-xs text-slate-500">
                                {lawyer.specialization?.[0] || 'Advocate'}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {fullTextModalOpen && selectedCitation && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm md:p-6">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 p-4 md:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <Scale size={20} className="shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-[#0f2d5e] md:text-lg">
                    {selectedCitation.title}
                  </h3>
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    {selectedCitation.type} · {selectedCitation.source}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFullTextModalOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 md:p-8">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 md:text-base">
                {selectedCitation.fullText}
              </p>
            </div>
            <div className="flex shrink-0 justify-end border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setFullTextModalOpen(false)}
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Back to analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAssistant;
