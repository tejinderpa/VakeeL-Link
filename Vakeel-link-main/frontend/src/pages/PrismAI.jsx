import { useEffect, useMemo, useState } from 'react';
import { 
  AlertTriangle, 
  Bot, 
  CheckCircle2, 
  Clock3, 
  ChevronRight, 
  Cpu, 
  ExternalLink, 
  FileText, 
  Gavel, 
  History, 
  Info, 
  Layers, 
  Layout, 
  Loader2, 
  MessageSquare, 
  Quote, 
  Scale, 
  Search, 
  Shield, 
  Sparkles, 
  Terminal, 
  UserRound, 
  Zap, 
  X 
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import useAuth from '../components/useAuth';
import { API_BASE_URL } from '../utils/api';

const PRISM_TOOLS = [
  { id: 'research', name: 'Know Your Kanoon', icon: Search, description: 'Research statutes and precedents' },
  { id: 'doc_chat', name: 'Talk with IK Doc', icon: MessageSquare, description: 'Analyze specific legal documents' },
  { id: 'draft', name: 'DocGen Hub', icon: FileText, description: 'AI-assisted legal drafting' },
  { id: 'predict', name: 'Case Predict AI', icon: Gavel, description: 'Predict case outcomes' },
];

const LOADING_STEPS = [
  { title: 'Initializing Prism Engine', detail: 'Connecting to Qdrant vector store and Groq LLM.' },
  { title: 'Neural Retrieval', detail: 'Finding exact matches and semantic siblings in the legal corpus.' },
  { title: 'Contextual Synthesis', detail: 'Aggregating facts, issues, and analysis from retrieved documents.' },
  { title: 'Generating Prism Report', detail: 'Formatting citations and structuring the final intelligence report.' },
];

const PrismAI = () => {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState('research');
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [fullTextModalOpen, setFullTextModalOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [activeSection, setActiveSection] = useState('summary');
  const [documentContext, setDocumentContext] = useState(null);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % LOADING_STEPS.length);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [loading]);

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResponse(null);
    setLoadingStep(0);
    setStatusMessage(documentContext ? `Analyzing query against ${documentContext.title}...` : 'Engaging VakeelLink Prism AI protocols...');

    try {
      const token = localStorage.getItem('vakeellink_token');
      const authToken = token && token !== 'mock_jwt_token' ? token : null;
      
      // If we have document context, we might want to tell the backend to focus on it
      // For now, we'll just prepend the context to the query to mimic the behavior
      const effectiveQuery = documentContext 
        ? `[CONTEXT: ${documentContext.title}] ${query}\n\nRELEVANT TEXT: ${documentContext.full_text || documentContext.excerpt}` 
        : query;

      const endpoints = ['/api/v1/query/ask', '/api/query/ask'];
      let data = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({ query: effectiveQuery }),
          });

          if (!res.ok) {
            let detail = `Prism engine error (${res.status})`;
            try {
              const body = await res.json();
              detail = body?.detail || detail;
              if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
            } catch { /* ignore */ }
            lastError = new Error(
              res.status === 429
                ? (typeof detail === 'string' ? detail : 'Rate limit reached. Wait a minute and retry.')
                : (typeof detail === 'string' ? detail : 'Prism engine encountered an error.')
            );
            if (res.status === 404) continue;
            break;
          }

          data = await res.json();
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!data) throw lastError || new Error('Unable to connect to Prism AI');
      setResponse(data);
    } catch (err) {
      setError(err.message || 'Unable to connect to Prism AI');
    } finally {
      setLoading(false);
    }
  };

  const handleEngageDocument = (citation) => {
    setDocumentContext(citation);
    setActiveTool('doc_chat');
    setResponse(null);
    setQuery(`Summarize this document and explain its relevance to my matter.`);
    setFullTextModalOpen(false);
  };

  const handleViewFullText = (citation) => {
    setSelectedCitation(citation);
    setFullTextModalOpen(true);
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
  };

  // Process summary into sections if possible
  const structuredAnalysis = useMemo(() => {
    if (!response?.analysis && !response?.summary && !response?.answer) return null;

    const text = response.analysis || response.summary || response.answer || '';
    if (!/(?:Facts|Issues|Analysis|Conclusion)\s*:/i.test(text)) return null;

    const sections = { facts: '', issues: '', analysis: '', conclusion: '' };
    const splitRegex = /(?=(?:^|\n)\s*#*\s*(?:Facts|Issues|Analysis|Conclusion)\s*:?\s*)/i;
    const headerRegex = /^\s*#*\s*(Facts|Issues|Analysis|Conclusion)\s*:?\s*/i;

    text.split(splitRegex).map((p) => p.trim()).filter(Boolean).forEach((part) => {
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
  }, [response]);

  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-100 selection:bg-indigo-500/30 font-inter">
      <UserSidebar />

      <main className="flex-1 md:ml-[280px] flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-[#020617]/50 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Cpu className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Prism <span className="text-indigo-400">AI</span>
                <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] font-black uppercase tracking-widest text-indigo-300">Advanced</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">IndianKanoon Grounded Legal Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prism Core Online</span>
             </div>
             <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-sm font-bold text-white">
                {getInitials(user?.name)}
             </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Tools */}
          <aside className="w-[300px] border-r border-white/5 bg-slate-950/20 p-6 flex flex-col gap-4 overflow-y-auto hidden xl:flex">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Prism Suite</div>
            {PRISM_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all text-left ${
                  activeTool === tool.id 
                  ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 shadow-lg shadow-indigo-500/10' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <tool.icon size={18} />
                  <span className="font-bold text-sm">{tool.name}</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-70">{tool.description}</p>
              </button>
            ))}
            
            <div className="mt-auto p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-600/10 border border-indigo-500/20">
               <div className="flex items-center gap-2 text-indigo-300 mb-2">
                  <Shield size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ethics First</span>
               </div>
               <p className="text-[10px] text-slate-500 leading-relaxed italic">
                 Prism AI only uses verified legal data from IndianKanoon and official gazettes.
               </p>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(99,102,241,0.1),transparent_70%)] pointer-events-none" />
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-8">
                
                {/* Input Section */}
                <section className={`transition-all duration-500 ${response || loading ? 'opacity-50 blur-sm pointer-events-none scale-95' : 'opacity-100 scale-100'}`}>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-black text-white tracking-tight">Legal Research <span className="text-indigo-400">Engine</span></h2>
                      <p className="text-slate-400 text-sm">Ask complex legal questions and get structured analysis with citations.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[32px] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-focus-within:opacity-50" />
                      <div className="relative bg-[#08111f] border border-white/10 rounded-[32px] p-2 flex flex-col gap-2">
                        {documentContext && (
                          <div className="px-6 pt-4 flex items-center justify-between">
                             <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                                <FileText size={12} className="text-indigo-400" />
                                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest truncate max-w-[240px]">Context: {documentContext.title}</span>
                             </div>
                             <button 
                               onClick={() => setDocumentContext(null)}
                               className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest"
                             >
                               Clear Context
                             </button>
                          </div>
                        )}
                        <textarea
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Describe your legal query in detail... (e.g., 'What are the recent Supreme Court judgments on Right to Privacy vs National Security?')"
                          className="w-full h-40 bg-transparent border-none focus:ring-0 text-slate-100 placeholder:text-slate-500 p-6 text-base leading-relaxed resize-none outline-none"
                        />
                        <div className="flex items-center justify-between px-4 pb-2">
                          <div className="flex gap-2">
                             <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">Natural Language</span>
                             <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">Citation Search</span>
                          </div>
                          <button
                            type="submit"
                            disabled={loading || !query.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                          >
                            Execute Analysis <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </form>

                    <div className="grid grid-cols-3 gap-4">
                       {[
                         { title: 'Precedents', detail: '4.2M Cases' },
                         { title: 'Statutes', detail: '80K Acts' },
                         { title: 'Latency', detail: '< 2.5s' }
                       ].map(i => (
                         <div key={i.title} className="p-4 bg-white/5 border border-white/5 rounded-2xl text-center">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{i.title}</div>
                            <div className="text-sm font-bold text-indigo-300">{i.detail}</div>
                         </div>
                       ))}
                    </div>
                  </div>
                </section>

                {/* Loading State */}
                {loading && (
                  <div className="py-20 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in duration-500">
                    <div className="relative">
                      <div className="w-24 h-24 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Terminal size={24} className="text-indigo-400 animate-pulse" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Prism Logic Active</div>
                      <h3 className="text-xl font-black text-white">{LOADING_STEPS[loadingStep].title}</h3>
                      <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">{LOADING_STEPS[loadingStep].detail}</p>
                    </div>
                    <div className="w-full max-w-xs h-1 bg-white/5 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-indigo-500 transition-all duration-500" 
                         style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }} 
                       />
                    </div>
                  </div>
                )}

                {/* Error State */}
                {error && !loading && (
                  <div className="p-8 rounded-[32px] border border-rose-500/20 bg-rose-500/5 text-center space-y-4">
                    <AlertTriangle className="mx-auto text-rose-400" size={28} />
                    <h3 className="text-lg font-black text-white">Analysis failed</h3>
                    <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">{error}</p>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="px-6 py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Response Section */}
                {response && (
                  <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-8 pb-20">
                    
                    {/* Results Overview Bar */}
                    <div className="flex items-center justify-between p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl backdrop-blur-xl">
                       <div className="flex items-center gap-6 flex-wrap">
                          <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Domain</div>
                            <div className="text-sm font-bold text-indigo-300 uppercase">{response.domain || 'General Law'}</div>
                          </div>
                          <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
                          <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Citations</div>
                            <div className="text-sm font-bold text-white">{(response.citations || []).length} Verified</div>
                          </div>
                          <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
                          <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence</div>
                            <div className="text-sm font-bold text-emerald-400">{Math.min(99, Math.round(Number(response.confidence_score || 0) * 100))}%</div>
                          </div>
                       </div>
                       <button 
                         onClick={() => { setResponse(null); setQuery(''); setError(''); }}
                         className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
                       >
                         <X size={20} />
                       </button>
                    </div>

                    {response.retrieval_notice && (
                      <div className="flex gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-100/90 text-sm">
                        <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{response.retrieval_notice}</p>
                      </div>
                    )}

                    {/* Main Analysis Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      
                      {/* Left Side: Summary & Sections */}
                      <div className="lg:col-span-8 space-y-6">
                        <div className="bg-[#08111f] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl">
                          <div className="px-8 py-6 border-b border-white/5 bg-white/2 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <Sparkles className="text-indigo-400" size={20} />
                                <h3 className="font-black text-white uppercase tracking-tighter text-xl">Intelligence Report</h3>
                             </div>
                             <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                <button 
                                  onClick={() => setActiveSection('summary')}
                                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'summary' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                                >
                                  Summary
                                </button>
                                <button 
                                  onClick={() => setActiveSection('structural')}
                                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'structural' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                                >
                                  Structural
                                </button>
                             </div>
                          </div>

                          <div className="p-8">
                             {activeSection === 'summary' ? (
                               <div className="prose prose-invert max-w-none">
                                  <p className="text-slate-100 leading-9 text-lg font-medium whitespace-pre-wrap">
                                    {response.analysis || response.summary || response.answer}
                                  </p>
                               </div>
                             ) : (
                               <div className="space-y-8">
                                  {structuredAnalysis ? (
                                    <>
                                      {structuredAnalysis.facts && (
                                        <div className="space-y-3">
                                          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Relevant Facts</div>
                                          <div className="p-5 bg-white/2 border border-white/5 rounded-2xl text-slate-300 leading-relaxed text-sm">
                                            {structuredAnalysis.facts}
                                          </div>
                                        </div>
                                      )}
                                      {structuredAnalysis.issues && (
                                        <div className="space-y-3">
                                          <div className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em]">Legal Issues</div>
                                          <div className="p-5 bg-white/2 border border-white/5 rounded-2xl text-slate-300 leading-relaxed text-sm">
                                            {structuredAnalysis.issues}
                                          </div>
                                        </div>
                                      )}
                                      <div className="space-y-3">
                                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Analysis of Law</div>
                                        <div className="p-5 bg-white/2 border border-white/5 rounded-2xl text-slate-300 leading-relaxed text-sm">
                                          {structuredAnalysis.analysis}
                                        </div>
                                      </div>
                                      {structuredAnalysis.conclusion && (
                                        <div className="space-y-3">
                                          <div className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Final Conclusion</div>
                                          <div className="p-5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-slate-300 leading-relaxed text-sm">
                                            {structuredAnalysis.conclusion}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                                       <Info className="text-slate-600" size={32} />
                                       <p className="text-slate-500 text-sm italic max-w-xs">
                                         Structured analysis is only available for longer reports. Please use the Summary view for this query.
                                       </p>
                                       <button onClick={() => setActiveSection('summary')} className="text-indigo-400 text-[10px] font-black uppercase tracking-widest border-b border-indigo-500/30 pb-0.5">Return to Summary</button>
                                    </div>
                                  )}
                               </div>
                             )}
                          </div>
                          
                          <div className="px-8 py-4 bg-slate-900/50 border-t border-white/5 flex items-center justify-between">
                             <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 italic">
                                <Shield size={12} /> AI generated guidance • IndianKanoon Dataset
                             </div>
                             <div className="flex gap-4">
                                <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Copy Report</button>
                                <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Export PDF</button>
                             </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Citations & Documents */}
                      <div className="lg:col-span-4 space-y-6">
                        <div className="bg-[#08111f] border border-white/10 rounded-[40px] p-8 shadow-xl">
                          <div className="flex items-center gap-2 mb-8">
                             <Quote size={20} className="text-indigo-400" />
                             <h3 className="font-black text-white uppercase tracking-tighter text-lg">Citations</h3>
                          </div>

                          <div className="space-y-6">
                            {/* Detailed Citations if available */}
                            {response.citations?.length > 0 && (
                              <div className="space-y-4">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Matches</div>
                                {response.citations.map((cit, idx) => (
                                  <article 
                                    key={idx} 
                                    className="group p-4 bg-white/2 border border-white/5 rounded-[24px] hover:border-indigo-500/30 hover:bg-indigo-500/[0.02] transition-all cursor-pointer"
                                    onClick={() => handleViewFullText(cit)}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                       <div className="flex items-center gap-2">
                                          <div className={`w-2 h-2 rounded-full ${cit.type === 'case' ? 'bg-indigo-400' : cit.type === 'section' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{cit.type}</span>
                                       </div>
                                       <span className="text-[9px] font-black text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded border border-indigo-400/20">{(Number(cit.score || 0) * 100).toFixed(0)}% Match</span>
                                    </div>
                                    <h4 className="mt-2 text-sm font-black text-white leading-tight group-hover:text-indigo-300 transition-colors line-clamp-2">{cit.title}</h4>
                                    <div className="mt-3 flex items-center justify-between">
                                       <span className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]">{cit.source_collection}</span>
                                       <div className="flex items-center gap-1 text-indigo-400 group-hover:translate-x-1 transition-transform">
                                          <span className="text-[9px] font-black uppercase tracking-widest">Full Text</span>
                                          <ChevronRight size={12} />
                                       </div>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            )}

                            {/* Cited Sections */}
                            {response.cited_sections?.length > 0 && (
                              <div className="space-y-3">
                                <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-2">Cited Sections</div>
                                {response.cited_sections.map((sec, idx) => (
                                  <div key={idx} className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl text-[11px] font-bold text-amber-200/80 flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-amber-400" />
                                    {sec}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Cited Acts */}
                            {response.cited_acts?.length > 0 && (
                              <div className="space-y-3">
                                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest px-2">Cited Acts</div>
                                {response.cited_acts.map((act, idx) => (
                                  <div key={idx} className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[11px] font-bold text-emerald-200/80 flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-emerald-400" />
                                    {act}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Cited Cases */}
                            {response.cited_cases?.length > 0 && (
                              <div className="space-y-3">
                                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2">Cited Cases</div>
                                {response.cited_cases.map((caseName, idx) => (
                                  <div key={idx} className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-[11px] font-bold text-indigo-200/80 flex items-center gap-2">
                                    <Gavel size={12} className="text-indigo-400/50" />
                                    {caseName}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Empty State */}
                            {!(response.citations?.length || response.cited_sections?.length || response.cited_acts?.length || response.cited_cases?.length) && (
                              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                                 <Layers size={32} className="text-slate-600" />
                                 <p className="text-xs text-slate-500 italic">No specific document matches found for this query.</p>
                              </div>
                            )}
                          </div>

                          {response.recommended_lawyers?.length > 0 && (
                            <div className="mt-10 pt-10 border-t border-white/5 space-y-6">
                               <div className="flex items-center gap-2">
                                  <UserRound size={20} className="text-indigo-400" />
                                  <h3 className="font-black text-white uppercase tracking-tighter text-lg">Specialists</h3>
                               </div>
                               <div className="space-y-3">
                                  {response.recommended_lawyers.slice(0, 2).map((lawyer, idx) => (
                                    <div key={idx} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                                       <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white">
                                          {lawyer.name.split(' ').map(n => n[0]).join('')}
                                       </div>
                                       <div>
                                          <div className="text-sm font-black text-white">{lawyer.name}</div>
                                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{lawyer.specialization?.[0] || 'Advocate'}</div>
                                       </div>
                                    </div>
                                  ))}
                               </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="max-w-4xl mx-auto p-6 bg-slate-900/50 border border-white/5 rounded-3xl text-[10px] font-medium text-slate-500 leading-relaxed text-center uppercase tracking-widest">
                       <AlertTriangle size={14} className="inline mr-2 mb-0.5 text-amber-500" />
                       {response.disclaimer || 'Disclaimer: This intelligence report is generated by Prism AI and does not constitute formal legal advice. Always verify with a licensed professional.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Full Text Modal */}
      {fullTextModalOpen && selectedCitation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/60 animate-in fade-in duration-300">
          <div className="w-full max-w-5xl h-[85vh] bg-[#020617] border border-white/10 rounded-[48px] shadow-2xl overflow-hidden flex flex-col relative">
            <div className="absolute top-8 right-8 z-20">
               <button 
                 onClick={() => setFullTextModalOpen(false)}
                 className="p-3 bg-white/5 hover:bg-red-500/20 border border-white/10 rounded-2xl text-slate-400 hover:text-red-400 transition-all"
               >
                 <X size={24} />
               </button>
            </div>
            
            <header className="px-12 pt-12 pb-8 border-b border-white/5 bg-slate-900/20">
               <div className="flex items-center gap-3 text-indigo-400 mb-4">
                  <Scale size={20} />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em]">Official Legal Document</span>
               </div>
               <h3 className="text-3xl font-black text-white leading-tight max-w-3xl">{selectedCitation.title}</h3>
               <div className="mt-6 flex items-center gap-4">
                  <span className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-300">
                    Type: {selectedCitation.type}
                  </span>
                  <span className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Source: {selectedCitation.source_collection}
                  </span>
                  <span className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Relevance: {(Number(selectedCitation.score || 0) * 100).toFixed(0)}%
                  </span>
               </div>
            </header>

            <div className="flex-1 overflow-y-auto px-12 py-10 custom-scrollbar">
               <div className="max-w-4xl mx-auto">
                  <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-10 font-serif text-lg leading-10 text-slate-200 whitespace-pre-wrap selection:bg-indigo-500/40">
                    {selectedCitation.full_text || selectedCitation.excerpt || 'Full text not available for this citation.'}
                  </div>
               </div>
            </div>

            <footer className="px-12 py-8 bg-slate-900/20 border-t border-white/5 flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Retrieved via Prism RAG Core v4.2 • Secured Encryption
                  </div>
                  <button 
                    onClick={() => handleEngageDocument(selectedCitation)}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-lg shadow-indigo-500/10"
                  >
                    <MessageSquare size={14} />
                    Talk with this IK Doc
                  </button>
               </div>
               <button 
                 onClick={() => setFullTextModalOpen(false)}
                 className="px-10 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest transition-all"
               >
                 Dismiss Document
               </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrismAI;
