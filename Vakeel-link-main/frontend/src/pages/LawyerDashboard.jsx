import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, CalendarCheck2, CheckCircle2, CircleHelp, Clock3, Download, FileText, Filter, FolderOpen, Folder, LayoutDashboard, LineChart, LogOut, Mail, MessageCircle, Plus, Scale, Search, Settings, ShieldAlert, UserCircle2, Video, XCircle, Zap, Bot, X, Send, BookOpen, Loader2, Trash2, Upload, ChevronRight, ArrowLeft, Briefcase, Shield, Home } from 'lucide-react';
import useAuth from '../components/useAuth';
import ConsultationChat from '../components/ConsultationChat';
import { apiGet, apiPost, apiPut, hasRealToken } from '../utils/api';
import {
  formatRelativeTime,
  mapConsultationForLawyer,
  normalizeStatus,
  statusLabel,
} from '../utils/consultationStatus';
import {
  addLawyerDocument,
  buildAnalytics,
  deleteLawyerCase,
  deleteLawyerDocument,
  ensureDemoConsultations,
  formatBytes,
  getDocumentFoldersWithCounts,
  listDocumentsInFolder,
  listLawyerCases,
  listLawyerDocuments,
  listLocalConsultations,
  saveLawyerCase,
  updateLocalConsultationStatus,
} from '../utils/lawyerWorkspace';
import { formatReadableText } from '../utils/chatStore';
import {
  askLegalAi,
  buildComparisonFollowUpPrompt,
  buildComparisonPrompt,
  formatMemoParagraphs,
  gatherComparisonContexts,
  humanizeMemoText,
  parseComparisonMemo,
} from '../utils/legalAi';
import {
  getCachedComparison,
  listCachedComparisons,
  rankSimilarMatters,
  scoreMatterSimilarity,
  setCachedComparison,
} from '../utils/caseSimilarity';
import { publishLawyerProfile } from '../utils/clientCatalog';
import {
  countUnreadForLawyer,
  markConsultationRead,
  mergeLawyerConsultationSources,
  onConsultationsUpdated,
  updateSharedConsultationStatus,
} from '../utils/consultationBridge';

const CASE_TYPES = [
  { id: 'family', label: 'Family', hint: 'Divorce, custody, maintenance, domestic issues' },
  { id: 'labour', label: 'Labour', hint: 'Jobs, salary, PF, wrongful termination' },
  { id: 'criminal', label: 'Criminal', hint: 'FIR, bail, police complaints, IPC offences' },
  { id: 'property', label: 'Property', hint: 'Land, rent, partition, title disputes' },
  { id: 'consumer', label: 'Consumer', hint: 'Bank, product, service complaints' },
  { id: 'general', label: 'General', hint: 'Not sure — general civil advice' },
];

function SideNav({
  activeSection,
  onSectionChange,
  onLogout,
  onOpenNewCase,
  displayName,
  subtitle,
  unreadConsultations = 0,
}) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'consultations', label: 'Consultations', icon: CalendarDays, badge: unreadConsultations },
    { id: 'case-files', label: 'Case Files', icon: FolderOpen },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'case-comparisons', label: 'Case Comparisons', icon: BookOpen },
    { id: 'analytics', label: 'Analytics', icon: LineChart },
  ];

  const initials = (displayName || 'LP')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[260px] flex-col border-r border-white/10 bg-[#0f2d5e] text-sm text-slate-200 shadow-xl lg:w-[280px]">
      <div className="shrink-0 border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/25 text-white ring-1 ring-white/10">
            <Scale size={20} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-black tracking-tight text-white">
              Vakeel<span className="text-blue-300">Link</span>
            </div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-300/80">Advocate portal</div>
          </div>
        </div>
      </div>

      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {navItems.map(({ id, label, icon: Icon, badge }) => {
          const isActive = activeSection === id;
          const hasBadge = Number(badge) > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
                isActive
                  ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                  : hasBadge
                    ? 'bg-amber-500/10 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} className={isActive || hasBadge ? 'text-blue-300' : 'text-slate-400'} />
              <span className={`flex-1 ${hasBadge ? 'font-black' : 'font-semibold'}`}>{label}</span>
              {hasBadge ? (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-900">
                  {badge} new
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onOpenNewCase}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/30 transition-colors hover:bg-blue-500"
        >
          <Plus size={16} />
          New Case
        </button>
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/40 text-xs font-bold text-white">
            {initials || 'LP'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white" title={displayName || 'Advocate'}>
              {displayName || 'Advocate'}
            </p>
            <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">
              {subtitle || 'Lawyer portal'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSectionChange('profile')}
          className="mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-300 transition-all hover:bg-white/5 hover:text-white"
        >
          <UserCircle2 size={18} />
          Profile
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-300 transition-all hover:bg-white/5 hover:text-white"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}

function PendingScreen({ onRefresh }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
      <div className="max-w-xl rounded-[40px] border border-white/10 bg-white/[0.04] p-10 text-center shadow-2xl shadow-indigo-500/10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
          <Clock3 size={28} />
        </div>
        <h1 className="mt-6 text-4xl font-black tracking-tight">Profile under review</h1>
        <p className="mt-4 text-slate-400 leading-relaxed">
          Your lawyer account is waiting for approval. Once the verification team marks it approved, the full portal will unlock.
        </p>
        <div className="mt-8 rounded-[28px] border border-amber-500/20 bg-amber-500/10 p-5 text-left text-amber-200">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Current Status</div>
          <div className="mt-2 text-sm font-semibold">Pending verification</div>
        </div>
        <button onClick={onRefresh} className="mt-8 rounded-2xl bg-indigo-600 px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-indigo-500">
          Refresh status
        </button>
      </div>
    </div>
  );
}

function RejectedScreen({ reason, onReapply }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
      <div className="max-w-xl rounded-[40px] border border-white/10 bg-white/[0.04] p-10 text-center shadow-2xl shadow-rose-500/10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
          <ShieldAlert size={28} />
        </div>
        <h1 className="mt-6 text-4xl font-black tracking-tight">Verification rejected</h1>
        <p className="mt-4 text-slate-400 leading-relaxed">
          Your submission needs one more pass before access can be granted.
        </p>
        <div className="mt-8 rounded-[28px] border border-rose-500/20 bg-rose-500/10 p-5 text-left text-rose-200">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-300">Reason</div>
          <div className="mt-2 text-sm font-semibold">{reason}</div>
        </div>
        <button onClick={onReapply} className="mt-8 rounded-2xl bg-emerald-600 px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-emerald-500">
          Re-apply for approval
        </button>
      </div>
    </div>
  );
}

function NewCaseModal({ onClose, onGoToConsultations, onGoToCaseFiles, onSaved }) {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [caseType, setCaseType] = useState('general');
  const [incidentDate, setIncidentDate] = useState('');
  const [nextHearing, setNextHearing] = useState('');
  const [forum, setForum] = useState('');
  const [peopleInvolved, setPeopleInvolved] = useState('');
  const [opposingParty, setOpposingParty] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [reliefSought, setReliefSought] = useState('');
  const [documentsAvailable, setDocumentsAvailable] = useState('');
  const [priority, setPriority] = useState('normal');
  const [caseText, setCaseText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedType = CASE_TYPES.find((t) => t.id === caseType) || CASE_TYPES[CASE_TYPES.length - 1];
  const previewParagraphs = formatReadableText(caseText);

  const fieldClass =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';
  const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500';

  const handleSave = () => {
    if (!title.trim() || !caseText.trim()) {
      setError('Title and case narrative are required.');
      return;
    }
    if (!clientName.trim()) {
      setError('Please name the client / principal party.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const categoryLabel = `${selectedType.label} Law`;
      const record = saveLawyerCase({
        title: title.trim(),
        clientName: clientName.trim(),
        facts: caseText.trim(),
        category: categoryLabel,
        caseType,
        incidentDate,
        nextHearing,
        forum,
        peopleInvolved,
        opposingParty,
        witnesses,
        reliefSought,
        documentsAvailable,
        priority,
      });
      if (onSaved) onSaved(record);
      onClose();
      if (onGoToCaseFiles) onGoToCaseFiles();
    } catch (err) {
      setError(err.message || 'Could not save case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-md sm:items-center sm:p-6">
      <div
        className="flex max-h-[min(100dvh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New case"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#0f2d5e] to-[#1e40af] px-5 py-4 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white">
              <Scale size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">New case file</h2>
              <p className="text-xs text-blue-100">Dates, people, forum, and full narrative</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Case title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Mehta — mutual consent divorce & maintenance"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Client / principal party *</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Full name of your client"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={fieldClass}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High — urgent</option>
                <option value="critical">Critical — time-sensitive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Case type (issue area)</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CASE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCaseType(t.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-sm ${
                    caseType === t.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="block text-sm font-bold text-slate-900">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Incident / cause of action date</label>
              <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Next hearing / deadline</label>
              <input type="date" value={nextHearing} onChange={(e) => setNextHearing(e.target.value)} className={fieldClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Court / forum / police station</label>
              <input
                type="text"
                value={forum}
                onChange={(e) => setForum(e.target.value)}
                placeholder="e.g. Family Court, Saket · PS Connaught Place · Labour Court"
                className={fieldClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>People involved</label>
              <input
                type="text"
                value={peopleInvolved}
                onChange={(e) => setPeopleInvolved(e.target.value)}
                placeholder="Names & roles — e.g. Ananya Mehta (petitioner), Rohan Mehta (respondent), minor child A"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Opposing party</label>
              <input
                type="text"
                value={opposingParty}
                onChange={(e) => setOpposingParty(e.target.value)}
                placeholder="Name of opposite party / employer / builder"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Witnesses / key contacts</label>
              <input
                type="text"
                value={witnesses}
                onChange={(e) => setWitnesses(e.target.value)}
                placeholder="Witnesses, relatives, HR contact, etc."
                className={fieldClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Relief sought</label>
              <input
                type="text"
                value={reliefSought}
                onChange={(e) => setReliefSought(e.target.value)}
                placeholder="e.g. Interim maintenance, mutual consent divorce, full & final settlement"
                className={fieldClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Documents available</label>
              <input
                type="text"
                value={documentsAvailable}
                onChange={(e) => setDocumentsAvailable(e.target.value)}
                placeholder="e.g. Marriage certificate, salary slips, FIR copy, appointment letter"
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Case narrative *</label>
            <p className="mb-2 text-xs text-slate-500">
              What happened, what the client wants, and any prior proceedings. Short paragraphs work best.
            </p>
            <textarea
              value={caseText}
              onChange={(e) => setCaseText(e.target.value)}
              rows={6}
              placeholder={'What happened?\n\nWhat does the client want?\n\nPrior notices, FIRs, or court orders?'}
              className={`${fieldClass} resize-y leading-relaxed`}
            />
          </div>

          {previewParagraphs.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Readable preview</p>
              <div className="space-y-3">
                {previewParagraphs.map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onGoToConsultations) onGoToConsultations();
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open consultations
            </button>
            <button
              type="button"
              disabled={saving || !title.trim() || !caseText.trim() || !clientName.trim()}
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save to Case Files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseComparisonsSection({ localCases = [], consultations = [], onToast }) {
  const libraryMatters = useMemo(() => {
    const fromFiles = (localCases || []).map((c) => ({
      id: String(c.id),
      title: c.title || c.clientName || 'Untitled matter',
      clientName: c.clientName || c.title || 'Client',
      category: c.category || 'General Law',
      caseType: c.caseType || null,
      status: c.status || 'pending',
      facts: c.facts || c.summary || c.message || '',
      notes: c.notes || '',
      message: c.message || '',
      description: c.description || '',
      forum: c.forum || '',
      peopleInvolved: c.peopleInvolved || '',
      opposingParty: c.opposingParty || '',
      incidentDate: c.incidentDate || '',
      nextHearing: c.nextHearing || '',
      reliefSought: c.reliefSought || '',
      source: 'library',
      factChars: String(c.facts || c.summary || c.message || '').length,
    }));

    // Dedupe consultations by id and by client+message fingerprint (avoids twin chips)
    const seenIds = new Set();
    const seenFp = new Set();
    const fromConsults = [];
    for (const c of consultations || []) {
      const rawId = String(c.id ?? '');
      if (!rawId || seenIds.has(rawId)) continue;
      seenIds.add(rawId);
      const client = String(c.clientName || 'Client').trim();
      const body = String(c.message || c.clientMessage || '').trim();
      const fp = `${client.toLowerCase()}|${body.slice(0, 160).toLowerCase()}`;
      if (seenFp.has(fp)) continue;
      seenFp.add(fp);

      // Skip if an identical case file already covers this consultation text
      const coveredByFile = fromFiles.some((f) => {
        const sameClient = f.clientName.toLowerCase() === client.toLowerCase();
        const overlap =
          body &&
          f.facts &&
          (f.facts.includes(body.slice(0, 80)) || body.includes(f.facts.slice(0, 80)));
        return sameClient && overlap;
      });
      if (coveredByFile) continue;

      fromConsults.push({
        id: `consult_${rawId}`,
        title: `${client} — consultation`,
        clientName: client,
        category: c.category || 'General Law',
        caseType: null,
        status: c.status || 'pending',
        facts: body,
        message: body,
        clientMessage: body,
        notes: c.notes || '',
        source: 'consultation',
        factChars: body.length,
      });
    }

    return [...fromFiles, ...fromConsults];
  }, [localCases, consultations]);

  const [sourceFilter, setSourceFilter] = useState('all'); // all | library | rag
  const [listQuery, setListQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [ragItems, setRagItems] = useState([]);
  const [focus, setFocus] = useState('');
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(0); // 0 idle, 1 gather, 2 draft, 3 polish
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [memo, setMemo] = useState(null);
  const [rawMemo, setRawMemo] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const [contextPreview, setContextPreview] = useState([]);

  const pool = useMemo(() => {
    const base = [
      ...libraryMatters,
      ...ragItems.map((r) => ({
        id: String(r.id),
        title: r.title,
        clientName: r.title,
        category: r.category || 'Research finding',
        caseType: null,
        status: 'research',
        facts: r.summary || '',
        source: 'rag',
        factChars: String(r.summary || '').length,
      })),
    ];
    // Final id de-dupe in pool
    const seen = new Set();
    return base
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        if (sourceFilter === 'library' && item.source !== 'library' && item.source !== 'consultation') return false;
        if (sourceFilter === 'rag' && item.source !== 'rag') return false;
        if (!listQuery.trim()) return true;
        const q = listQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          (item.clientName || '').toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.facts || '').toLowerCase().includes(q)
        );
      });
  }, [libraryMatters, ragItems, sourceFilter, listQuery]);

  const selectedMatters = useMemo(() => {
    return selectedIds
      .map(
        (id) =>
          pool.find((p) => p.id === id) ||
          libraryMatters.find((p) => p.id === id) ||
          ragItems.find((r) => String(r.id) === id)
      )
      .filter(Boolean)
      .map((m) =>
        m.summary && !m.facts
          ? { ...m, facts: m.summary }
          : m
      );
  }, [selectedIds, pool, libraryMatters, ragItems]);

  /** First selected matter is the "current case" for similarity ranking */
  const anchorMatter = selectedMatters[0] || null;

  const similarityById = useMemo(() => {
    if (!anchorMatter) return {};
    const map = {};
    pool.forEach((m) => {
      if (String(m.id) === String(anchorMatter.id)) {
        map[m.id] = 100;
        return;
      }
      map[m.id] = scoreMatterSimilarity(anchorMatter, m);
    });
    return map;
  }, [anchorMatter, pool]);

  const similarSuggestions = useMemo(() => {
    if (!anchorMatter) return [];
    return rankSimilarMatters(anchorMatter, pool, { minScore: 18, limit: 6 });
  }, [anchorMatter, pool]);

  const cachedHistory = useMemo(() => listCachedComparisons().slice(0, 5), [rawMemo, memo]);

  const hasLargeMatter = selectedMatters.some((m) => (m.factChars || String(m.facts || '').length) > 1800);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        if (onToast) onToast('Select up to 4 matters for a focused comparison');
        return prev;
      }
      return [...prev, id];
    });
  };

  const clearBench = () => {
    setSelectedIds([]);
    setMemo(null);
    setRawMemo('');
    setThread([]);
    setMeta(null);
    setError('');
    setContextPreview([]);
    setRunStep(0);
  };

  const loadCachedMemo = (entry) => {
    if (!entry) return;
    const raw = humanizeMemoText(entry.rawMemo || '');
    setRawMemo(raw);
    // Re-parse so older cached dict dumps become readable prose
    setMemo(parseComparisonMemo(raw) || entry.memo);
    setMeta(entry.meta || { fromCache: true });
    setThread([]);
    if (Array.isArray(entry.matterIds) && entry.matterIds.length) {
      setSelectedIds(entry.matterIds.slice(0, 4));
    }
    if (entry.focus != null) setFocus(entry.focus);
    if (onToast) onToast('Loaded cached comparison');
  };

  const runComparison = async ({ force = false } = {}) => {
    if (selectedMatters.length < 2) {
      setError('Pick at least two matters from the left (case files, consultations, or research findings).');
      return;
    }

    // Reuse cached memo for same bench + focus unless force-refresh
    if (!force) {
      const cached = getCachedComparison(
        selectedMatters.map((m) => m.id),
        focus
      );
      if (cached?.rawMemo) {
        const raw = humanizeMemoText(cached.rawMemo);
        setRawMemo(raw);
        setMemo(parseComparisonMemo(raw));
        setMeta({ ...(cached.meta || {}), fromCache: true });
        setThread([]);
        setError('');
        if (onToast) onToast('Loaded from comparison cache');
        return;
      }
    }

    setRunning(true);
    setRunStep(1);
    setError('');
    setMemo(null);
    setRawMemo('');
    setThread([]);
    try {
      // Step 1 — gather / condense context (local, no API)
      const prepared = gatherComparisonContexts(selectedMatters);
      setContextPreview(prepared);
      setRunStep(2);
      await new Promise((r) => window.setTimeout(r, 180));

      // Attach pairwise similarity to current (anchor) case in the prompt focus
      const pairScores = selectedMatters.slice(1).map((m) => {
        const s = scoreMatterSimilarity(selectedMatters[0], m);
        return `${m.title}: ${s}% similar to current matter`;
      });
      const focusWithSim =
        [focus.trim(), pairScores.length ? `Similarity to current case — ${pairScores.join('; ')}` : '']
          .filter(Boolean)
          .join('\n');

      const prompt = buildComparisonPrompt({
        cases: selectedMatters,
        focus: focusWithSim,
        mode: 'full',
      });
      const data = await askLegalAi(prompt);
      setRunStep(3);
      const text = String(data.analysis || data.answer || '').trim();
      if (!text) {
        throw new Error(
          'No memo text was returned. Try again, or narrow the focus so the research step has a clearer target.'
        );
      }
      const parsed = parseComparisonMemo(text);
      const metaPayload = {
        provider: data.llm_provider,
        backend: data.retrieval_backend,
        confidence: data.confidence_score,
        domain: data.domain,
        cited_cases: data.cited_cases || [],
        cited_sections: data.cited_sections || [],
        cited_acts: data.cited_acts || [],
        disclaimer: data.disclaimer,
        condensedCount: prepared.filter((p) => p.condensed).length,
        fromCache: false,
        similarity: pairScores,
      };
      setRawMemo(text);
      setMemo(parsed);
      setMeta(metaPayload);
      setCachedComparison({
        matterIds: selectedMatters.map((m) => m.id),
        focus,
        rawMemo: text,
        memo: parsed,
        meta: metaPayload,
        selectedTitles: selectedMatters.map((m) => m.title),
      });
      const extra = (data.cited_cases || []).slice(0, 6).map((title, i) => ({
        id: `rag_${Date.now()}_${i}`,
        title: typeof title === 'string' ? title : String(title),
        summary: (data.summary || text).slice(0, 220),
        category: data.domain || 'Research',
        source: 'rag',
      }));
      if (extra.length) {
        setRagItems((prev) => {
          const titles = new Set(prev.map((p) => p.title));
          return [...extra.filter((e) => !titles.has(e.title)), ...prev].slice(0, 24);
        });
      }
      if (onToast) onToast('Comparison memo ready · cached for later');
    } catch (err) {
      setError(err.message || 'Comparison could not be completed. Please try again.');
      setMemo(null);
      setRawMemo('');
    } finally {
      setRunning(false);
      setRunStep(0);
    }
  };

  const runRagSearch = async () => {
    const q = listQuery.trim() || focus.trim();
    if (!q) {
      setError('Type a research phrase first — for example “interim maintenance under HMA”.');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const prompt = buildComparisonPrompt({ focus: q, mode: 'search' });
      const data = await askLegalAi(prompt);
      const cited = data.cited_cases || [];
      const analysis = data.analysis || data.answer || '';
      const items = (cited.length ? cited : [q]).slice(0, 8).map((title, i) => ({
        id: `rag_search_${Date.now()}_${i}`,
        title: typeof title === 'string' ? title : String(title),
        summary: analysis.slice(0, 280),
        category: data.domain || 'Research',
        source: 'rag',
      }));
      setRagItems((prev) => [...items, ...prev].slice(0, 30));
      setSourceFilter('all');
      if (onToast) onToast(`Added ${items.length} research finding(s) to the library`);
    } catch (err) {
      setError(err.message || 'Research search failed');
    } finally {
      setSearching(false);
    }
  };

  const askFollowUp = async (e) => {
    e.preventDefault();
    if (!followUp.trim() || !rawMemo) return;
    setFollowBusy(true);
    const question = followUp.trim();
    setFollowUp('');
    setThread((prev) => [...prev, { role: 'user', text: question }]);
    try {
      const prompt = buildComparisonFollowUpPrompt({
        cases: selectedMatters,
        priorMemo: rawMemo,
        question,
      });
      const data = await askLegalAi(prompt);
      setThread((prev) => [
        ...prev,
        { role: 'ai', text: data.analysis || data.answer || 'No additional analysis returned.' },
      ]);
    } catch (err) {
      setThread((prev) => [
        ...prev,
        { role: 'ai', text: err.message || 'Follow-up could not be completed right now.' },
      ]);
    } finally {
      setFollowBusy(false);
    }
  };

  const sectionCards = [
    { key: 'facts', label: 'Facts', hint: 'What each matter is about', tone: 'border-sky-200/80 bg-gradient-to-br from-sky-50 to-white text-sky-950' },
    { key: 'issues', label: 'Legal issues', hint: 'Questions the court / forum will care about', tone: 'border-amber-200/80 bg-gradient-to-br from-amber-50 to-white text-amber-950' },
    { key: 'analysis', label: 'Comparative analysis', hint: 'Where the matters align and diverge', tone: 'border-blue-200/80 bg-gradient-to-br from-blue-50 to-white text-blue-950' },
    { key: 'conclusion', label: 'Conclusion & next steps', hint: 'What you can do this week', tone: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white text-emerald-950' },
  ];

  const runSteps = [
    { id: 1, label: 'Gathering matter context' },
    { id: 2, label: 'Comparing issues & law' },
    { id: 3, label: 'Drafting structured memo' },
  ];

  return (
    <section className="animate-in fade-in space-y-6 duration-500">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="relative px-5 py-5 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(37,99,235,0.08),_transparent_55%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Your desk</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#0f2d5e] sm:text-3xl">
                Compare matters side by side
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Choose two to four matters, add an optional focus, and get a clear memo you can use in strategy —
                Facts, Issues, Analysis, and practical next steps. Large files are read first and condensed so the
                comparison still answers properly.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearBench}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Clear bench
              </button>
              <button
                type="button"
                disabled={running || selectedIds.length < 2}
                onClick={() => runComparison({ force: false })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0f2d5e] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 hover:bg-[#163a75] disabled:opacity-50"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Scale size={16} />}
                {running ? 'Working…' : 'Run comparison'}
              </button>
              {rawMemo && (
                <button
                  type="button"
                  disabled={running || selectedIds.length < 2}
                  onClick={() => runComparison({ force: true })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Refresh memo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: matter picker */}
        <div className="flex min-h-[580px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-5">
          <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Your matters</h3>
                <p className="mt-0.5 text-xs text-slate-500">Tap to place on the comparison bench</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                {selectedIds.length} of 4
              </span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200/50 p-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'library', label: 'My cases' },
                { id: 'rag', label: 'Research' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    sourceFilter === tab.id ? 'bg-white text-[#0f2d5e] shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runRagSearch();
                    }
                  }}
                  placeholder="Search matters or research a point of law…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
              <button
                type="button"
                onClick={runRagSearch}
                disabled={searching}
                title="Pull research findings into the list"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                Find
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {pool.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Nothing here yet. Create a matter under <strong>Case Files</strong>, accept a consultation, or search
                research findings above.
              </div>
            )}
            {anchorMatter && similarSuggestions.length > 0 && (
              <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                  Similar to current case
                </p>
                <p className="mt-0.5 truncate text-xs font-medium text-slate-600">{anchorMatter.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {similarSuggestions.map(({ matter, similarity }) => (
                    <button
                      key={matter.id}
                      type="button"
                      onClick={() => toggleSelect(matter.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-900 transition hover:bg-blue-50"
                    >
                      <span className="text-blue-600">{similarity}%</span>
                      <span className="max-w-[120px] truncate">{matter.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pool.map((item) => {
              const selected = selectedIds.includes(item.id);
              const large = (item.factChars || String(item.facts || '').length) > 1800;
              const sim = anchorMatter ? similarityById[item.id] : null;
              const isAnchor = anchorMatter && String(item.id) === String(anchorMatter.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleSelect(item.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all hover:shadow-md ${
                    selected
                      ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-500/15 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.title}
                        {isAnchor ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                            Current
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.category}
                        {item.clientName && item.clientName !== item.title ? ` · ${item.clientName}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          item.source === 'rag'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : item.source === 'consultation'
                              ? 'border border-violet-200 bg-violet-50 text-violet-700'
                              : 'border border-blue-200 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {item.source === 'rag' ? 'Research' : item.source === 'consultation' ? 'Consult' : 'File'}
                      </span>
                      {sim != null && !isAnchor && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            sim >= 45
                              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                              : sim >= 25
                                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
                          }`}
                          title="Similarity to current (first selected) case"
                        >
                          {sim}% match
                        </span>
                      )}
                      {large && (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                          Large
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                    {formatReadableText(item.facts)[0] || 'No facts recorded yet — you can still compare titles and categories.'}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <span>
                      {item.source === 'rag'
                        ? 'Research'
                        : statusLabel(normalizeStatus(item.status)) || item.status}
                    </span>
                    <span className={selected ? 'text-blue-700' : ''}>{selected ? 'On bench' : 'Add'}</span>
                  </div>
                </button>
              );
            })}
            {cachedHistory.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Cached comparisons
                </p>
                <div className="space-y-1.5">
                  {cachedHistory.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => loadCachedMemo(entry)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <p className="font-semibold text-slate-800 line-clamp-1">
                        {(entry.selectedTitles || []).join(' · ') || 'Saved memo'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Earlier'}
                        {entry.focus ? ` · ${entry.focus.slice(0, 40)}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: bench + memo */}
        <div className="flex min-h-[580px] flex-col gap-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Comparison bench</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedMatters.length < 2
                    ? 'Add at least two matters to begin'
                    : `${selectedMatters.length} matters ready${hasLargeMatter ? ' · large files will be condensed first' : ''}`}
                </p>
              </div>
            </div>

            {selectedMatters.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                <Scale className="mx-auto text-slate-300" size={28} />
                <p className="mt-3 text-sm font-medium text-slate-600">Nothing on the bench yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Select matters from the left. Mix case files, consultations, or research findings as needed.
                </p>
              </div>
            ) : (
              <ol className="mt-4 space-y-2">
                {selectedMatters.map((m, idx) => {
                  const chars = m.factChars || String(m.facts || '').length;
                  const large = chars > 1800;
                  return (
                    <li
                      key={m.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0f2d5e] text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{m.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {m.category}
                          {large ? ` · ~${Math.round(chars / 100) * 100} characters of notes` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSelect(m.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                        aria-label={`Remove ${m.title}`}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            <label className="mt-5 block text-xs font-semibold text-slate-700">
              What should we focus on? <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={3}
              placeholder="Example: Compare interim maintenance strategy and evidence checklists under HMA with final settlement claims in the labour matter."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />

            {selectedMatters.length >= 2 && (
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Match scores are vs your <strong>current</strong> matter (first on the bench). Results are cached for
                the same set of matters and focus.
              </p>
            )}

            <button
              type="button"
              disabled={running || selectedMatters.length < 2}
              onClick={() => runComparison({ force: false })}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {runStep === 1 ? 'Gathering context…' : runStep === 2 ? 'Comparing…' : 'Drafting memo…'}
                </>
              ) : (
                <>
                  <FileText size={16} />
                  Generate comparison memo
                </>
              )}
            </button>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FileText size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Memo</h3>
                  <p className="text-[11px] text-slate-500">Structured for courtroom and client prep</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {meta?.fromCache && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                    From cache
                  </span>
                )}
                {meta?.confidence != null && meta.confidence > 0 && (
                  <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    Confidence {(Number(meta.confidence) * (meta.confidence <= 1 ? 100 : 1)).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-[540px] flex-1 space-y-4 overflow-y-auto p-5">
              {!memo && !running && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50 to-white px-5 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                    <BookOpen size={22} />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">Your memo will land here</p>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                    Select matters, optionally set a focus, then generate. We gather context from each file first —
                    including large ones — then draft Facts · Issues · Analysis · Conclusion.
                  </p>
                  <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-2 text-left">
                    {sectionCards.map((s) => (
                      <div key={s.key} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold text-slate-800">{s.label}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{s.hint}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {running && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/40 px-5 py-10">
                  <div className="flex flex-col items-center text-center">
                    <Loader2 size={28} className="animate-spin text-blue-700" />
                    <p className="mt-4 text-sm font-semibold text-[#0f2d5e]">
                      {runStep === 1
                        ? 'Reading your matters and gathering context…'
                        : runStep === 2
                          ? 'Comparing issues, statutes, and strategy…'
                          : 'Writing the memo…'}
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-600">
                      {hasLargeMatter
                        ? 'One or more matters are large — key facts, legal signals, and closing posture are retained before drafting.'
                        : 'Working only from the materials you selected on the bench.'}
                    </p>
                  </div>
                  <ol className="mx-auto mt-6 max-w-xs space-y-2">
                    {runSteps.map((step) => {
                      const active = runStep === step.id;
                      const done = runStep > step.id;
                      return (
                        <li
                          key={step.id}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                            active
                              ? 'bg-white text-blue-800 shadow-sm ring-1 ring-blue-100'
                              : done
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 size={14} className="text-emerald-600" />
                          ) : active ? (
                            <Loader2 size={14} className="animate-spin text-blue-600" />
                          ) : (
                            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px]">
                              {step.id}
                            </span>
                          )}
                          {step.label}
                        </li>
                      );
                    })}
                  </ol>
                  {contextPreview.length > 0 && runStep >= 2 && (
                    <p className="mt-5 text-center text-[11px] text-slate-500">
                      Context ready for {contextPreview.length} matter
                      {contextPreview.length === 1 ? '' : 's'}
                      {contextPreview.some((c) => c.condensed)
                        ? ` · ${contextPreview.filter((c) => c.condensed).length} condensed for length`
                        : ''}
                    </p>
                  )}
                </div>
              )}

              {memo && memo.analysis && !memo.facts && !memo.issues && !memo.conclusion && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Full memo</p>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-800">
                    {formatMemoParagraphs(memo.analysis).map((para, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {memo && (memo.facts || memo.issues || memo.analysis || memo.conclusion) && (
                <div className="space-y-3">
                  {meta?.condensedCount > 0 && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
                      {meta.condensedCount} large matter{meta.condensedCount === 1 ? ' was' : 's were'} condensed before
                      drafting. The memo reflects retained lead facts, legal signals, and closing posture — not every
                      narrative sentence.
                    </p>
                  )}
                  {sectionCards.map((sec) => {
                    const body = humanizeMemoText(memo[sec.key]);
                    if (!body) return null;
                    const paragraphs = formatMemoParagraphs(body);
                    return (
                      <article key={sec.key} className={`rounded-xl border p-4 shadow-sm ${sec.tone}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-80">{sec.label}</h4>
                          <span className="hidden text-[10px] text-slate-500 sm:inline">{sec.hint}</span>
                        </div>
                        <div className="mt-2.5 space-y-2.5 text-sm leading-relaxed text-slate-800">
                          {paragraphs.map((para, i) => {
                            const isBullet = /^[•\-\*]\s+/.test(para) || /^\d+[.)]\s+/.test(para);
                            const isLabel = /:\s*$/.test(para) && para.length < 48;
                            return (
                              <p
                                key={i}
                                className={`whitespace-pre-wrap ${
                                  isLabel
                                    ? 'mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500'
                                    : isBullet
                                      ? 'pl-0.5'
                                      : ''
                                }`}
                              >
                                {para}
                              </p>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {meta && (meta.cited_cases?.length > 0 || meta.cited_sections?.length > 0 || meta.cited_acts?.length > 0) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Authorities noted</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...(meta.cited_acts || []), ...(meta.cited_sections || []), ...(meta.cited_cases || [])]
                      .slice(0, 16)
                      .map((c) => (
                        <span
                          key={c}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {c}
                        </span>
                      ))}
                  </div>
                  {meta.disclaimer && (
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{meta.disclaimer}</p>
                  )}
                </div>
              )}

              {thread.length > 0 && (
                <div className="space-y-2.5 border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Follow-up</p>
                  {thread.map((msg, i) => (
                    <div
                      key={i}
                      className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'ml-8 bg-[#0f2d5e] text-white'
                          : 'mr-6 border border-slate-200 bg-white text-slate-800 shadow-sm'
                      }`}
                    >
                      <div className="space-y-2 whitespace-pre-wrap">
                        {msg.role === 'ai'
                          ? formatMemoParagraphs(msg.text).map((p, j) => <p key={j}>{p}</p>)
                          : msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={askFollowUp} className="flex gap-2 border-t border-slate-100 bg-slate-50/50 p-4">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={!rawMemo || followBusy}
                placeholder={
                  rawMemo
                    ? 'Ask a follow-up — e.g. “What documents should I collect first?”'
                    : 'Generate a memo first, then ask follow-ups here'
                }
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!rawMemo || followBusy || !followUp.trim()}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                aria-label="Send follow-up"
              >
                {followBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function CaseFilesSection({
  onOpenNewCase,
  consultations = [],
  localCases = [],
  onOpenConsultations,
  onRefreshCases,
  onSelectCase,
  onToast,
}) {
  const fromConsultations = (consultations || []).map((c) => {
    const status = normalizeStatus(c.status);
    const progress = status === 'completed' ? 100 : status === 'active' ? 65 : status === 'pending' ? 25 : 10;
    return {
      id: c.id,
      shortId: String(c.id).slice(0, 8).toUpperCase(),
      client: c.clientName,
      type: c.category,
      status: statusLabel(status),
      rawStatus: status,
      hearing: c.submittedAt || '—',
      progress,
      message: c.message,
      source: 'consultation',
    };
  });

  const fromDrafts = (localCases || []).map((c) => {
    const rawStatus = String(c.status || 'pending').toLowerCase();
    const progress =
      rawStatus === 'completed' ? 100 : rawStatus === 'active' ? 65 : rawStatus === 'pending' ? 20 : 15;
    return {
      id: c.id,
      shortId: String(c.id).replace(/^case_/, '').replace(/^case_seed_/, '').slice(0, 10).toUpperCase(),
      client: c.clientName || c.title,
      type: c.category || 'General Law',
      status: statusLabel(rawStatus === 'draft' ? 'pending' : rawStatus),
      rawStatus: rawStatus === 'draft' ? 'pending' : rawStatus,
      hearing: c.nextHearing || formatRelativeTime(c.createdAt),
      progress,
      message: c.facts || '',
      peopleInvolved: c.peopleInvolved || '',
      forum: c.forum || '',
      opposingParty: c.opposingParty || '',
      incidentDate: c.incidentDate || '',
      priority: c.priority || 'normal',
      source: 'draft',
      raw: c,
    };
  });

  // User/local cases first (already sorted: pending → newest), then consultation matters
  const cases = [...fromDrafts, ...fromConsultations];

  const handleDeleteDraft = (id) => {
    deleteLawyerCase(id);
    if (onRefreshCases) onRefreshCases();
    if (onToast) onToast('Case draft deleted');
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f2d5e]">Case Files</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your saved drafts plus client consultation matters.
          </p>
        </div>
        <button type="button" onClick={onOpenNewCase} className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-800">
          <Plus size={16} />
          New case
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No matters yet. Create a case with <strong>New case</strong>, or wait for client consultations.{' '}
          <button type="button" onClick={onOpenConsultations} className="font-semibold text-blue-600 hover:underline">
            Open consultations
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={`${c.source}-${c.id}`}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{c.shortId}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  c.rawStatus === 'active' ? 'border border-amber-200 bg-amber-100 text-amber-700' :
                  c.rawStatus === 'completed' ? 'border border-emerald-200 bg-emerald-100 text-emerald-700' :
                  c.rawStatus === 'pending' ? 'border border-amber-200 bg-amber-50 text-amber-800' :
                  c.rawStatus === 'draft' ? 'border border-violet-200 bg-violet-50 text-violet-700' :
                  'border border-slate-200 bg-slate-100 text-slate-700'
                }`}>
                  {c.status}
                </span>
              </div>
              <h3 className="mb-1 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{c.client}</h3>
              <p className="mb-2 text-sm font-medium text-slate-500">{c.type}</p>
              {(c.peopleInvolved || c.forum || c.incidentDate) && (
                <p className="mb-2 text-[11px] leading-snug text-slate-500">
                  {c.incidentDate ? `Date ${c.incidentDate}` : ''}
                  {c.incidentDate && (c.forum || c.peopleInvolved) ? ' · ' : ''}
                  {c.forum || ''}
                  {c.forum && c.peopleInvolved ? ' · ' : ''}
                  {c.peopleInvolved ? `Parties: ${c.peopleInvolved}` : ''}
                </p>
              )}
              <div className="mb-5 max-h-28 space-y-1.5 overflow-hidden">
                {formatReadableText(c.message).slice(0, 3).map((para, idx) => (
                  <p key={idx} className="text-xs leading-relaxed text-slate-600 line-clamp-2">
                    {para}
                  </p>
                ))}
                {!c.message && <p className="text-xs text-slate-400">No description yet.</p>}
              </div>
              <div className="mt-auto space-y-3">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span className="flex items-center gap-1.5"><CalendarDays size={14} className="text-blue-500" /> {c.hearing}</span>
                  <span className="font-bold text-slate-700">{c.progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600 transition-all duration-1000" style={{ width: `${c.progress}%` }} />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (c.source === 'consultation') onOpenConsultations();
                      else if (onSelectCase) onSelectCase(c.raw || c);
                      else if (onToast) onToast(`Opened: ${c.client}`);
                    }}
                    className="flex-1 rounded-lg bg-blue-50 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >
                    {c.source === 'consultation' ? 'Open consultations' : 'View details'}
                  </button>
                  {c.source === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(c.id)}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-rose-600 hover:bg-rose-50"
                      title="Delete draft"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const FOLDER_ICON_MAP = {
  heart: Scale,
  briefcase: Briefcase,
  shield: Shield,
  home: Home,
  cart: FileText,
  scale: Scale,
  file: FileText,
  folder: Folder,
};

function DocumentsSection({ onToast }) {
  const [folders, setFolders] = useState(() => getDocumentFoldersWithCounts());
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');

  const activeFolder = folders.find((f) => f.id === activeFolderId) || null;

  const refreshFolders = () => setFolders(getDocumentFoldersWithCounts());

  const openFolder = (folderId) => {
    setActiveFolderId(folderId);
    setDocs(listDocumentsInFolder(folderId));
    setQuery('');
  };

  const closeFolder = () => {
    setActiveFolderId(null);
    setDocs([]);
    setQuery('');
    refreshFolders();
  };

  const refreshOpenFolder = () => {
    if (activeFolderId) setDocs(listDocumentsInFolder(activeFolderId));
    refreshFolders();
  };

  const visibleDocs = docs.filter((d) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.notes?.toLowerCase().includes(q) ||
      d.caseLabel?.toLowerCase().includes(q)
    );
  });

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeFolderId) return;
    if (file.size > 2 * 1024 * 1024) {
      if (onToast) onToast('Please choose a file under 2 MB for browser storage');
      return;
    }
    setUploading(true);
    try {
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsDataURL(file);
      });
      addLawyerDocument({
        name: file.name,
        folderId: activeFolderId,
        caseLabel: activeFolder?.label || 'General',
        notes: notes.trim(),
        contentBase64,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });
      setNotes('');
      refreshOpenFolder();
      if (onToast) onToast(`Added “${file.name}” to ${activeFolder?.label || 'folder'}`);
    } catch {
      if (onToast) onToast('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (doc) => {
    if (!doc.contentBase64) {
      if (onToast) {
        onToast(
          doc.seed
            ? 'Sample document — re-upload your own file to enable download'
            : 'No file content stored for this entry'
        );
      }
      return;
    }
    const a = document.createElement('a');
    a.href = doc.contentBase64;
    a.download = doc.name || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (onToast) onToast(`Downloading ${doc.name}`);
  };

  const handleDelete = (id) => {
    deleteLawyerDocument(id);
    refreshOpenFolder();
    if (onToast) onToast('Document removed');
  };

  const totalDocs = folders.reduce((sum, f) => sum + (f.count || 0), 0);

  // ── Folder grid (home) ────────────────────────────────────────────────────
  if (!activeFolder) {
    return (
      <section className="animate-in fade-in space-y-6 duration-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">Document vault</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#0f2d5e]">Documents</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Organised by practice area. Open a folder to view, upload, or manage filings (stored offline in this browser, max 2&nbsp;MB each).
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total files</p>
            <p className="text-2xl font-black text-[#0f2d5e]">{totalDocs}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {folders.map((folder) => {
            const Icon = FOLDER_ICON_MAP[folder.icon] || Folder;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => openFolder(folder.id)}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ring-1 ${folder.ring || 'ring-transparent'}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${folder.accent} opacity-80`} />
                <div className="relative z-10 flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/90 text-[#0f2d5e] shadow-sm ring-1 ring-slate-200/80">
                    <Icon size={22} />
                  </div>
                  <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200/70">
                    {folder.count} file{folder.count === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="relative z-10 mt-4">
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-800">{folder.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{folder.description}</p>
                  {folder.latestName && (
                    <p className="mt-3 truncate text-[11px] font-medium text-slate-500">
                      Latest: {folder.latestName}
                    </p>
                  )}
                </div>
                <div className="relative z-10 mt-4 flex items-center gap-1 text-xs font-bold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100">
                  Open folder <ChevronRight size={14} />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // ── Inside a folder ───────────────────────────────────────────────────────
  const ActiveFolderIcon = FOLDER_ICON_MAP[activeFolder.icon] || Folder;

  return (
    <section className="animate-in fade-in space-y-5 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
            <button type="button" onClick={closeFolder} className="hover:text-blue-700">
              Documents
            </button>
            <ChevronRight size={12} className="text-slate-400" />
            <span className="text-[#0f2d5e]">{activeFolder.label}</span>
          </nav>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0f2d5e] text-white shadow-sm">
              <ActiveFolderIcon size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#0f2d5e] sm:text-3xl">{activeFolder.label}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{activeFolder.description}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={closeFolder}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            All folders
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? 'Uploading…' : 'Add document'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Upload into this folder</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Files stay in <strong>{activeFolder.label}</strong>. Optional note helps you find them later.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional note (e.g. “Client Mehta — maintenance petition annexure”)"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15"
          />
          <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 py-3 text-sm font-bold text-blue-800 hover:bg-blue-50">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Choose file (max 2 MB)
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <FolderOpen size={16} className="text-blue-700" />
              {docs.length} document{docs.length === 1 ? '' : 's'}
            </div>
            <div className="relative min-w-0 sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search in folder…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {visibleDocs.length === 0 && (
              <div className="px-6 py-14 text-center text-sm text-slate-500">
                {docs.length === 0
                  ? 'This folder is empty. Add a document with the upload control.'
                  : 'No documents match your search.'}
              </div>
            )}
            {visibleDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{doc.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatBytes(doc.size)} · {doc.date ? new Date(doc.date).toLocaleDateString() : '—'}
                      {doc.seed ? ' · Sample' : ''}
                    </p>
                    {doc.notes && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{doc.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:pl-4">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download size={14} />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsSection({ consultations = [], localCases = [], onOpenConsultations, onOpenCaseFiles }) {
  const docs = listLawyerDocuments();
  const stats = buildAnalytics({ consultations, cases: localCases, documents: docs });
  const maxMonth = Math.max(1, ...stats.months.map((m) => m.count));

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f2d5e]">Analytics & Insights</h2>
          <p className="mt-1 text-sm text-slate-500">Live numbers from your consultations, case files, and documents.</p>
        </div>
        <button
          type="button"
          onClick={onOpenConsultations}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          View consultations report
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Consultations</p>
          <p className="mt-1 text-3xl font-black text-[#0f2d5e]">{stats.totalConsultations}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Case files</p>
          <p className="mt-1 text-3xl font-black text-[#0f2d5e]">{stats.totalCases}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Documents</p>
          <p className="mt-1 text-3xl font-black text-[#0f2d5e]">{stats.totalDocuments}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Open matters</p>
          <p className="mt-1 text-3xl font-black text-[#0f2d5e]">{stats.openMatters}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Completion rate</h3>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Live</span>
          </div>
          <div className="flex items-center justify-center py-6">
            <div className="relative flex h-52 w-52 items-center justify-center rounded-full border-[12px] border-slate-100 shadow-inner">
              <div className="absolute inset-0 rotate-45 transform rounded-full border-[12px] border-emerald-500 border-l-transparent border-t-transparent transition-all duration-1000" />
              <div className="z-10 text-center">
                <span className="text-5xl font-black tracking-tight text-slate-900">{stats.winRate}<span className="text-3xl text-slate-500">%</span></span>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Closed / active</p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-6 text-center gap-4">
            <div>
              <p className="text-3xl font-black text-emerald-600">{stats.byStatus.completed}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Completed</p>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-700">{stats.byStatus.active + stats.byStatus.pending}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Active + pending</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Monthly Consultations</h3>
            <button type="button" onClick={onOpenCaseFiles} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              Open case files
            </button>
          </div>
          <div className="flex flex-1 items-end gap-3 pb-4 pt-8 min-h-[200px]">
            {stats.months.map((month) => {
              const height = Math.max(8, Math.round((month.count / maxMonth) * 100));
              return (
                <div key={month.key} className="group relative flex flex-1 flex-col items-center gap-2">
                  <div className="absolute -top-8 hidden rounded-md bg-slate-800 px-2 py-1 text-xs font-bold text-white shadow-lg group-hover:block">
                    {month.count}
                  </div>
                  <div className="relative w-full overflow-hidden rounded-t-lg bg-blue-100 transition-all duration-500 group-hover:bg-blue-600" style={{ height: `${height}%` }}>
                    <div className="absolute bottom-0 h-1/2 w-full bg-gradient-to-t from-blue-600/20 to-transparent" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{month.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#0f2d5e]">Practice snapshot</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Zap size={12} />
                  {stats.byStatus.draft} draft case{stats.byStatus.draft === 1 ? '' : 's'} · {stats.totalDocuments} document{stats.totalDocuments === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/30">
                <LineChart size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileSection({ user, consultationStats = {}, onProfileSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({
    name: user?.name || user?.full_name || '',
    email: user?.email || '',
    phone: '',
    gender: user?.gender || '',
    specialization: 'Civil & Commercial Law',
    experience_years: 8,
    location: 'New Delhi, India',
    bar_council_id: '',
    fee_per_consultation: 3500,
    is_online: true,
    is_verified: true,
    languages: 'English, Hindi',
    areas_of_practice: 'Civil litigation, Contract drafting, Family mediation, Consumer disputes',
    bio:
      'I am a practising advocate with a focus on clear, practical legal advice for individuals and small businesses. ' +
      'My approach is simple: understand the facts carefully, explain the law in plain language, map realistic options, ' +
      'and move decisively on strategy — whether that means negotiation, mediation, or court proceedings.\n\n' +
      'I assist clients with civil and commercial disputes, family and matrimonial counsel, consumer complaints, ' +
      'and day-to-day contract and compliance questions. Consultations on VakeelLink are confidential and structured ' +
      'so you leave with next steps, not just jargon.',
  });

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      try {
        if (!hasRealToken()) {
          setLoading(false);
          return;
        }
        const data = await apiGet('/api/v1/lawyers/me/profile');
        if (cancelled || !data) return;
        setForm((prev) => ({
          ...prev,
          name: data.name || prev.name,
          email: data.email || user?.email || prev.email,
          phone: data.phone || data.phone_number || prev.phone,
          gender: data.gender || prev.gender || user?.gender || '',
          specialization: data.specialization
            ? String(data.specialization).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            : prev.specialization,
          experience_years: Number(data.experience_years ?? prev.experience_years),
          location: data.location || prev.location,
          bar_council_id: data.bar_council_id || prev.bar_council_id,
          fee_per_consultation: Number(data.fee_per_consultation ?? prev.fee_per_consultation),
          is_online: data.is_online !== undefined ? Boolean(data.is_online) : prev.is_online,
          is_verified: data.is_verified !== undefined ? Boolean(data.is_verified) : prev.is_verified,
          languages: Array.isArray(data.languages)
            ? data.languages.join(', ')
            : data.languages || prev.languages,
          areas_of_practice: Array.isArray(data.areas_of_practice)
            ? data.areas_of_practice.join(', ')
            : data.areas_of_practice || prev.areas_of_practice,
          bio: data.bio || prev.bio,
        }));
      } catch (err) {
        console.error('Profile fetch error:', err);
        setToast(err.message || 'Could not load profile from server — showing defaults');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.gender]);

  const initials = (form.name || 'AD')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const languages = form.languages
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const areas_of_practice = form.areas_of_practice
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      name: form.name.trim(),
      bio: form.bio.trim(),
      specialization: form.specialization.trim().toLowerCase().replace(/\s+/g, ' '),
      location: form.location.trim(),
      experience_years: Number(form.experience_years) || 0,
      fee_per_consultation: Number(form.fee_per_consultation) || 0,
      is_online: Boolean(form.is_online),
      is_verified: Boolean(form.is_verified),
      phone: form.phone.trim() || null,
      languages,
      areas_of_practice,
      bar_council_id: form.bar_council_id || null,
    };

    // Always publish to client-visible catalog (same browser / offline)
    const publicCard = {
      id: user?.id || `local-lawyer-${(user?.email || 'advocate').replace(/[^a-z0-9]/gi, '-')}`,
      ...payload,
      specializationLabel: form.specialization.trim(),
      email: form.email || user?.email,
      gender: form.gender || null,
    };
    try {
      publishLawyerProfile(publicCard);
    } catch {
      // non-fatal
    }

    try {
      if (hasRealToken()) {
        await apiPut('/api/v1/lawyers/me/profile', payload);
      }
      if (onProfileSaved) {
        onProfileSaved({
          name: form.name.trim(),
          full_name: form.name.trim(),
          gender: form.gender || null,
          specialization: form.specialization.trim(),
          id: publicCard.id,
        });
      }
      setToast('Profile saved — visible on client Find Lawyers & profile pages');
    } catch (err) {
      // Local publish already done; still update sidebar
      if (onProfileSaved) {
        onProfileSaved({
          name: form.name.trim(),
          full_name: form.name.trim(),
          gender: form.gender || null,
          specialization: form.specialization.trim(),
          id: publicCard.id,
        });
      }
      setToast(err.message || 'Saved locally for clients; server sync failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-blue-600">
          <Loader2 className="animate-spin" size={36} />
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Loading profile…</p>
        </div>
      </div>
    );
  }

  const activeCount = consultationStats.active || 0;
  const pendingCount = consultationStats.pending || 0;
  const completedCount = consultationStats.completed || 0;

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f2d5e]">Advocate profile</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            This is how clients see you on VakeelLink. Keep your bio, practice areas, and fees accurate so the right matters reach you.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition-colors hover:bg-blue-800 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Save changes
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Identity card */}
        <div className="space-y-6 lg:col-span-1">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-[#0f2d5e] via-blue-800 to-[#0f2d5e]" />
            <div className="relative z-10 pt-8">
              <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#0f2d5e] to-blue-600 text-3xl font-black text-white shadow-xl ring-4 ring-white">
                {initials}
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{form.name || 'Your name'}</h3>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Scale size={12} />
                {form.specialization || 'Practice area'}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {form.is_verified && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Verified counsel
                  </span>
                )}
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    form.is_online
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  {form.is_online ? 'Available now' : 'Away'}
                </span>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-2 border-t border-slate-100 pt-6">
                <div>
                  <p className="text-2xl font-black text-slate-800">{form.experience_years || 0}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Years</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">{activeCount}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Active</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">{completedCount}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Done</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Chamber details</h4>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <Mail size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span className="break-all">{form.email || '—'}</span>
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>{form.phone || 'Add a contact number'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Scale size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>{form.location || 'Add city / court complex'}</span>
              </li>
              <li className="flex items-start gap-2">
                <FileText size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>Bar ID: {form.bar_council_id || 'Not on file'}</span>
              </li>
            </ul>
            {pendingCount > 0 && (
              <p className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {pendingCount} pending consultation request{pendingCount === 1 ? '' : 's'} waiting in Consultations.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f2d5e] p-6 text-white shadow-sm">
            <h4 className="text-sm font-bold">Professional standards</h4>
            <p className="mt-2 text-xs leading-relaxed text-blue-100/90">
              Maintain client confidentiality, disclose conflicts early, and keep fee estimates transparent.
              VakeelLink consultations should end with clear action items and document checklists where relevant.
            </p>
          </div>
        </div>

        {/* Editable form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSave} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 md:px-8">
              <h3 className="flex items-center gap-2 text-lg font-bold text-[#0f2d5e]">
                <UserCircle2 size={20} className="text-blue-600" />
                Professional information
              </h3>
              <p className="mt-1 text-xs text-slate-500">Fields marked for public display appear on your directory profile.</p>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 sm:grid-cols-2 md:p-8">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Full name (as on vakalatnama)</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => onChange('name', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
                <input
                  type="email"
                  value={form.email}
                  disabled
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Phone / WhatsApp</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => onChange('phone', e.target.value)}
                  placeholder="+91 98XXX XXXXX"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Gender (optional)</label>
                <select
                  value={form.gender || ''}
                  onChange={(e) => onChange('gender', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Primary specialization</label>
                <input
                  type="text"
                  value={form.specialization}
                  onChange={(e) => onChange('specialization', e.target.value)}
                  placeholder="e.g. Family Law, Criminal Defence"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Years of practice</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience_years}
                  onChange={(e) => onChange('experience_years', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">City / court complex</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => onChange('location', e.target.value)}
                  placeholder="e.g. Saket Courts, New Delhi"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Bar Council ID
                  {form.is_verified && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">ON FILE</span>
                  )}
                </label>
                <input
                  type="text"
                  value={form.bar_council_id}
                  disabled
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Fee per consultation (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={form.fee_per_consultation}
                  onChange={(e) => onChange('fee_per_consultation', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="flex items-center gap-3 sm:col-span-2">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={form.is_online}
                    onChange={(e) => onChange('is_online', e.target.checked)}
                  />
                  <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-500 peer-checked:after:translate-x-full" />
                </label>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Show as available for new consultations</p>
                  <p className="text-xs text-slate-500">Clients prefer advocates marked online for urgent chat requests.</p>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Areas of practice <span className="font-medium normal-case text-slate-400">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.areas_of_practice}
                  onChange={(e) => onChange('areas_of_practice', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Languages <span className="font-medium normal-case text-slate-400">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.languages}
                  onChange={(e) => onChange('languages', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Professional bio</label>
                <textarea
                  rows={7}
                  value={form.bio}
                  onChange={(e) => onChange('bio', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Tip: mention courts you regularly appear in, typical matters, and how first consultations work.
                </p>
              </div>

              <div className="sm:col-span-2 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Save profile
                </button>
                <button
                  type="button"
                  onClick={() => setToast('Profile preview uses the public lawyer directory card')}
                  className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Preview note
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
    </section>
  );
}

export default function LawyerDashboard() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.name || user?.full_name || 'Advocate';
  const sidebarSubtitle = user?.gender
    ? `${String(user.gender).charAt(0).toUpperCase()}${String(user.gender).slice(1)} · Advocate`
    : user?.specialization
      ? String(user.specialization)
      : 'Lawyer portal';
  const [approvalStatus, setApprovalStatus] = useState(() => localStorage.getItem('vakeellink_lawyer_approval_status') || 'approved');
  const [activeSection, setActiveSection] = useState('dashboard');
  const [rejectionReason] = useState('Bar Council ID mismatch with the uploaded verification documents.');
  const [consultations, setConsultations] = useState([]);
  const [consultationsLoading, setConsultationsLoading] = useState(true);
  const [localCases, setLocalCases] = useState(() => listLawyerCases());
  const [selectedCaseDetail, setSelectedCaseDetail] = useState(null);
  const [headerSearch, setHeaderSearch] = useState('');
  const [chatTarget, setChatTarget] = useState(null);
  /** Accepted but still chatting — keep card out of "Active" until chat closes. */
  const [chatHoldIds, setChatHoldIds] = useState(() => new Set());
  const [acceptingId, setAcceptingId] = useState(null);

  const [consultationQuery, setConsultationQuery] = useState('');
  const [consultationFilter, setConsultationFilter] = useState('all');
  const [consultationSort, setConsultationSort] = useState('latest');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: `Hello ${displayName}. Ask about strategy, statutes, or case framing — or open Consultations for live client matters.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const refreshLocalCases = useCallback(() => {
    setLocalCases(listLawyerCases());
  }, []);

  const [unreadCount, setUnreadCount] = useState(0);

  const applyMergedConsultations = useCallback(
    (remoteRows = []) => {
      const lawyerId = user?.id;
      ensureDemoConsultations(lawyerId, displayName);
      // Include ALL local workspace rows so demo-lawyer bookings are not dropped
      const localRows = listLocalConsultations(null);
      const merged = mergeLawyerConsultationSources({
        user,
        remoteRows,
        localRows,
      });
      const mapped = merged.map((row) => {
        const m = mapConsultationForLawyer(row);
        const status = normalizeStatus(row.status || m.status);
        const unread =
          Boolean(row.unread) ||
          (status === 'pending' &&
            (row.source === 'client_booking' ||
              row.source === 'local' ||
              String(row.id || '').startsWith('booking_')));
        return {
          ...m,
          status,
          statusLabel: statusLabel(status),
          unread: unread && status === 'pending',
          source: row.source,
          clientMessage: m.message,
        };
      });
      // Pending/unread first
      mapped.sort((a, b) => {
        if (Boolean(a.unread) !== Boolean(b.unread)) return a.unread ? -1 : 1;
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
      setConsultations(mapped);
      const unread = mapped.filter((c) => c.unread).length;
      setUnreadCount(unread || countUnreadForLawyer(user));
      return mapped;
    },
    [user, displayName]
  );

  const loadConsultations = useCallback(async () => {
    setConsultationsLoading(true);
    try {
      let remoteRows = [];
      if (hasRealToken()) {
        try {
          const payload = await apiGet('/api/v1/consultations/mine');
          remoteRows = payload?.data || [];
        } catch (err) {
          setFeedbackMessage(
            err?.message || 'Live server unavailable — showing local + client bookings'
          );
        }
      }
      const mapped = applyMergedConsultations(remoteRows);
      if (mapped.some((c) => c.unread)) {
        setFeedbackMessage(`${mapped.filter((c) => c.unread).length} new request(s) need action`);
      }
    } catch {
      applyMergedConsultations([]);
      setFeedbackMessage('Using offline consultations');
    } finally {
      setConsultationsLoading(false);
    }
  }, [applyMergedConsultations]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      loadConsultations();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadConsultations]);

  // Live refresh when client books in another tab/window of same browser
  useEffect(() => {
    const unsub = onConsultationsUpdated(() => {
      loadConsultations();
    });
    return unsub;
  }, [loadConsultations]);

  useEffect(() => {
    if (activeSection !== 'consultations' && activeSection !== 'case-files' && activeSection !== 'analytics') {
      return undefined;
    }
    const t = window.setTimeout(() => {
      loadConsultations();
      refreshLocalCases();
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeSection, loadConsultations, refreshLocalCases]);

  // When lawyer opens Consultations, keep pending bold until they act; mark viewed after short delay optional — we mark on accept/decline/open only

  const handleSendAiMessage = async (e) => {
    e.preventDefault();
    if (!aiInput.trim() || aiBusy) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: aiInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setAiMessages(prev => [...prev, userMessage]);
    const question = aiInput;
    setAiInput('');
    setAiBusy(true);

    try {
      const data = await askLegalAi(question);
      const text =
        data.analysis ||
        data.answer ||
        'I could not generate a response. Try Case Comparisons for structured research.';
      setAiMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'ai',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (err) {
      setAiMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'ai',
        text: err.message || 'AI backend is unavailable. Check GROQ_API_KEY / GEMINI keys and restart the API.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setAiBusy(false);
    }
  };

  const handleHeaderSearch = (e) => {
    if (e.key !== 'Enter') return;
    const q = headerSearch.trim().toLowerCase();
    if (!q) return;
    if (q.includes('consult')) setActiveSection('consultations');
    else if (q.includes('doc')) setActiveSection('documents');
    else if (q.includes('compar') || q.includes('precedent')) setActiveSection('case-comparisons');
    else if (q.includes('analytic') || q.includes('report')) setActiveSection('analytics');
    else if (q.includes('profile') || q.includes('setting')) setActiveSection('profile');
    else if (q.includes('case') || q.includes('file') || q.includes('draft')) setActiveSection('case-files');
    else {
      setActiveSection('consultations');
      setConsultationQuery(headerSearch.trim());
    }
    setFeedbackMessage(`Navigated for “${headerSearch.trim()}”`);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeSection]);

  useEffect(() => {
    if (!feedbackMessage) return undefined;
    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [feedbackMessage]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const filteredConsultations = consultations
    .filter((request) => {
      const normalized = consultationQuery.trim().toLowerCase();
      const matchesSearch = !normalized || [request.clientName, request.category, request.message].join(' ').toLowerCase().includes(normalized);
      const status = normalizeStatus(request.status);
      const matchesFilter =
        consultationFilter === 'all' ||
        status === consultationFilter ||
        (consultationFilter === 'accepted' && status === 'active') ||
        (consultationFilter === 'declined' && status === 'cancelled');
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (consultationSort === 'latest') {
        return String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id));
      }
      if (consultationSort === 'oldest') {
        return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
      }
      return a.clientName.localeCompare(b.clientName);
    });

  const isHeldInChat = useCallback(
    (id) => {
      const key = String(id || '');
      if (!key) return false;
      if (chatHoldIds.has(key)) return true;
      if (chatTarget && String(chatTarget.id) === key) return true;
      return false;
    },
    [chatHoldIds, chatTarget]
  );

  const pendingCount = consultations.filter((request) => normalizeStatus(request.status) === 'pending').length;
  const activeCount = consultations.filter(
    (request) => normalizeStatus(request.status) === 'active' && !isHeldInChat(request.id)
  ).length;
  const completedCount = consultations.filter((request) => normalizeStatus(request.status) === 'completed').length;
  // Active list: only settled active (not mid-chat after Accept)
  const activeConsultations = filteredConsultations.filter(
    (request) => normalizeStatus(request.status) === 'active' && !isHeldInChat(request.id)
  );
  // Pending + mid-chat holds stay here so Accept does not jump the card away
  const passiveConsultations = filteredConsultations.filter((request) => {
    if (isHeldInChat(request.id)) return true;
    return normalizeStatus(request.status) !== 'active';
  });

  const recentActivity = useMemo(() => {
    return consultations.slice(0, 6).map((c) => ({
      id: c.id,
      title: `${statusLabel(c.status)} · ${c.clientName}`,
      detail: `${c.category} · ${c.message?.slice(0, 80) || 'Consultation'}`,
      timeAgo: formatRelativeTime(c.createdAt),
      type: normalizeStatus(c.status) === 'active' ? 'success' : normalizeStatus(c.status) === 'pending' ? 'message' : 'verify',
    }));
  }, [consultations]);

  const scheduledToday = useMemo(() => {
    return consultations
      .filter((c) => normalizeStatus(c.status) === 'active')
      .slice(0, 4)
      .map((c) => ({
        id: c.id,
        time: c.scheduledAt
          ? new Date(c.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Chat available',
        title: c.clientName,
        detail: `${c.category} · ${c.mode || 'chat'}`,
        active: true,
      }));
  }, [consultations]);

  const applyLocalStatus = (requestId, nextStatus) => {
    updateLocalConsultationStatus(requestId, nextStatus);
    updateSharedConsultationStatus(requestId, nextStatus);
    markConsultationRead(requestId);
    setConsultations((prev) =>
      prev.map((c) =>
        String(c.id) === String(requestId)
          ? {
              ...c,
              status: nextStatus,
              statusLabel: statusLabel(nextStatus),
              unread: false,
            }
          : c
      )
    );
    setUnreadCount((n) => Math.max(0, n - 1));
  };

  const updateRequestStatus = async (requestId, status) => {
    try {
      if (status === 'accepted' || status === 'active') {
        // Prefer acceptAndStartChat for UX — this path kept for compatibility
        try {
          if (!String(requestId).startsWith('booking_') && !String(requestId).startsWith('demo-')) {
            await apiPost(`/api/v1/consultations/${requestId}/accept`);
          }
        } catch {
          // offline ok
        }
        applyLocalStatus(requestId, 'active');
        setFeedbackMessage('Request accepted');
      } else if (status === 'declined' || status === 'cancelled') {
        try {
          if (!String(requestId).startsWith('booking_') && !String(requestId).startsWith('demo-')) {
            await apiPost(`/api/v1/consultations/${requestId}/decline`);
          }
        } catch {
          // offline ok
        }
        applyLocalStatus(requestId, 'cancelled');
        setFeedbackMessage('Request declined');
        await loadConsultations();
      } else {
        setFeedbackMessage('Unsupported action');
      }
    } catch (err) {
      setFeedbackMessage(err.message || 'Action failed');
    }
  };

  /**
   * Accept → open chat immediately.
   * Card stays under Pending / "In session" until the lawyer closes chat,
   * then it appears under Active Consultations (no jarring jump mid-accept).
   */
  const acceptAndStartChat = async (request) => {
    if (!request?.id) return;
    setAcceptingId(request.id);
    const id = request.id;
    let acceptedOk = true;

    try {
      if (!String(id).startsWith('booking_') && !String(id).startsWith('demo-')) {
        try {
          await apiPost(`/api/v1/consultations/${id}/accept`);
        } catch {
          acceptedOk = false;
        }
      }
      applyLocalStatus(id, 'active');
      setChatHoldIds((prev) => {
        const next = new Set(prev);
        next.add(String(id));
        return next;
      });
      setChatTarget({
        ...request,
        status: 'active',
        statusLabel: statusLabel('active'),
        unread: false,
      });
      setFeedbackMessage(
        acceptedOk
          ? `Chat opened with ${request.clientName || 'client'}. Consultation moves to Active when you close chat.`
          : `Chat opened (offline accept). Finish the conversation, then close to settle the list.`
      );
    } catch (err) {
      setFeedbackMessage(err.message || 'Could not accept request');
    } finally {
      setAcceptingId(null);
    }
  };

  const completeConsultation = async (requestId) => {
    try {
      if (!String(requestId).startsWith('booking_') && !String(requestId).startsWith('demo-')) {
        await apiPost(`/api/v1/consultations/${requestId}/complete`);
      }
      updateSharedConsultationStatus(requestId, 'completed');
      updateLocalConsultationStatus(requestId, 'completed');
      markConsultationRead(requestId);
      setChatHoldIds((prev) => {
        const next = new Set(prev);
        next.delete(String(requestId));
        return next;
      });
      setFeedbackMessage('Marked completed');
      await loadConsultations();
    } catch {
      updateSharedConsultationStatus(requestId, 'completed');
      updateLocalConsultationStatus(requestId, 'completed');
      setFeedbackMessage('Marked completed (offline)');
      await loadConsultations();
    }
  };

  const openChat = (request) => {
    const st = normalizeStatus(request.status);
    if (st !== 'active' && st !== 'pending') {
      setFeedbackMessage('This consultation is closed');
      return;
    }
    if (st === 'pending') {
      // Accept + open in one step
      acceptAndStartChat(request);
      return;
    }
    setChatHoldIds((prev) => {
      const next = new Set(prev);
      next.add(String(request.id));
      return next;
    });
    setChatTarget(request);
  };

  const closeChatSession = () => {
    const closed = chatTarget;
    setChatTarget(null);
    if (!closed?.id) return;
    setChatHoldIds((prev) => {
      const next = new Set(prev);
      next.delete(String(closed.id));
      return next;
    });
    // Now the card settles into Active Consultations
    if (normalizeStatus(closed.status) === 'active' || normalizeStatus(
      consultations.find((c) => String(c.id) === String(closed.id))?.status
    ) === 'active') {
      setFeedbackMessage(
        `Session with ${closed.clientName || 'client'} saved under Active Consultations`
      );
    }
    // Soft refresh without wiping UI
    loadConsultations();
  };

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (approvalStatus === 'pending') {
    return <PendingScreen onRefresh={() => setApprovalStatus('approved')} />;
  }

  if (approvalStatus === 'rejected') {
    return <RejectedScreen reason={rejectionReason} onReapply={() => setApprovalStatus('pending')} />;
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <SideNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onLogout={handleLogout}
        onOpenNewCase={() => setIsNewCaseModalOpen(true)}
        displayName={displayName}
        subtitle={sidebarSubtitle}
        unreadConsultations={unreadCount}
      />

      <main className="min-h-screen min-w-0 pl-[260px] lg:pl-[280px]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-sm backdrop-blur sm:h-16 sm:px-6">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-200/60"
              placeholder="Search sections or clients… (press Enter)"
              type="text"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              onKeyDown={handleHeaderSearch}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('consultations')}
              className="relative rounded-full p-2 text-slate-500 transition-transform hover:bg-slate-50 active:scale-95"
              aria-label="Consultations"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('profile')}
              className="rounded-full p-2 text-slate-500 transition-transform hover:bg-slate-50 active:scale-95"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsAIChatOpen(true)}
              className="rounded-full p-2 text-slate-500 transition-transform hover:bg-slate-50 active:scale-95"
              aria-label="Help"
            >
              <CircleHelp size={18} />
            </button>
            <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {(displayName || 'LP').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
              </div>
              <div className="min-w-0">
                <p className="max-w-[140px] truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Dashboard</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
          {activeSection === 'dashboard' ? (
            <>
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <h1 className="text-3xl font-semibold text-[#0f2d5e]">Welcome back, {displayName}</h1>
                  <div className="mt-1 flex items-center gap-2 text-slate-600">
                    <CalendarDays size={16} />
                    <p>{todayLabel}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={loadConsultations}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('consultations')}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-800"
                  >
                    {unreadCount > 0 ? `View ${unreadCount} new request${unreadCount === 1 ? '' : 's'}` : 'View consultations'}
                  </button>
                </div>
              </div>

              <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Total consultations" value={String(consultations.length)} badge="All time" accent="blue" icon={CalendarCheck2} />
                <MetricCard label="Pending requests" value={String(pendingCount)} badge={unreadCount ? `${unreadCount} new` : pendingCount ? 'Action required' : 'Clear'} accent="orange" icon={Clock3} />
                <MetricCard label="Active chats" value={String(activeCount)} badge="Live" accent="teal" icon={MessageCircle} />
                <MetricCard label="Completed" value={String(completedCount)} badge="Closed" accent="yellow" icon={CheckCircle2} />
              </div>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <section className="space-y-6 lg:col-span-2">
                  <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 p-6">
                      <h3 className="text-xl font-semibold text-[#0f2d5e]">Recent Activity</h3>
                      <button type="button" onClick={() => setActiveSection('consultations')} className="text-sm font-medium text-blue-600 hover:underline">View All</button>
                    </div>
                    <div>
                      {consultationsLoading && (
                        <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                          <Loader2 className="animate-spin" size={16} /> Loading…
                        </div>
                      )}
                      {!consultationsLoading && recentActivity.length === 0 && (
                        <p className="p-8 text-center text-sm text-slate-500">No consultation activity yet.</p>
                      )}
                      {recentActivity.map((item) => (
                        <ActivityItem key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                </section>

                <aside className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-xl font-semibold text-[#0f2d5e]">Active matters</h3>
                    <div className="space-y-4">
                      {scheduledToday.length === 0 && (
                        <p className="text-sm text-slate-500">
                          No active sessions. Accept chat requests from Consultations.
                        </p>
                      )}
                      {scheduledToday.map((meeting) => (
                        <div key={meeting.id} className={`border-l-4 pl-4 ${meeting.active ? 'border-blue-600' : 'border-slate-200'}`}>
                          <p className="text-xs font-bold uppercase text-slate-500">{meeting.time}</p>
                          <p className="font-semibold text-slate-900">{meeting.title}</p>
                          <p className="text-xs text-slate-500">{meeting.detail}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('consultations')}
                      className="mt-6 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                    >
                      Open consultations
                    </button>
                  </div>
                </aside>
              </div>
            </>
          ) : activeSection === 'consultations' ? (
            <section className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-3xl font-semibold text-[#0f2d5e]">Consultations</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Client bookings appear here. New unread requests stay bold until you accept or decline.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      loadConsultations();
                      setFeedbackMessage('Consultations refreshed');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Loader2 size={14} className={consultationsLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <div className="grid grid-cols-3 gap-2 sm:flex">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active</p>
                      <p className="text-xl font-bold text-emerald-700">{activeCount}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending</p>
                      <p className="text-xl font-black text-amber-800">{pendingCount}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">New</p>
                      <p className="text-xl font-black text-rose-600">{unreadCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              {unreadCount > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold">
                    {unreadCount} new consultation request{unreadCount === 1 ? '' : 's'} need your action
                  </p>
                  <p className="text-xs font-medium text-amber-800">
                    Accept opens chat immediately — the request moves to Active only after you close the chat.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={consultationQuery}
                    onChange={(event) => setConsultationQuery(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/70"
                    placeholder="Search requests..."
                    type="text"
                  />
                </div>

                <div className="flex gap-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    <Filter size={16} />
                    <select
                      className="bg-transparent font-medium outline-none"
                      value={consultationFilter}
                      onChange={(event) => setConsultationFilter(event.target.value)}
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    <Download size={16} />
                    <select
                      className="bg-transparent font-medium outline-none"
                      value={consultationSort}
                      onChange={(event) => setConsultationSort(event.target.value)}
                    >
                      <option value="latest">Latest</option>
                      <option value="oldest">Oldest</option>
                      <option value="client">Client</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Active Consultations
                  </h3>
                  <div className="space-y-4">
                    {consultationsLoading && (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
                        <Loader2 className="animate-spin" size={16} /> Loading consultations…
                      </div>
                    )}
                    {!consultationsLoading && activeConsultations.length ? activeConsultations.map((request) => (
                      <article key={request.id} className="rounded-xl border border-l-4 border-l-blue-600 border-slate-200 bg-white p-5 shadow-sm transition-all">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-blue-50 text-sm font-bold text-blue-700">
                              {(request.clientName || 'C').slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-semibold text-slate-900">{request.clientName}</h3>
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Active</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">{request.category}</span>
                                <span>• {request.submittedAt}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openChat(request)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0f2d5e] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#143974]"
                            >
                              <MessageCircle size={16} />
                              Open Chat
                            </button>
                            <button
                              type="button"
                              onClick={() => completeConsultation(request.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Complete
                            </button>
                          </div>
                        </div>
                        <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm italic leading-relaxed text-slate-700">
                          &quot;{request.message}&quot;
                        </p>
                      </article>
                    )) : !consultationsLoading && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                        No active consultations match your current filters.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Pending / Passive Consultations
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                        {unreadCount} unread
                      </span>
                    )}
                  </h3>
                  <div className="space-y-4">
                    {passiveConsultations.length ? passiveConsultations.map((request) => {
                      const status = normalizeStatus(request.status);
                      const inSession = isHeldInChat(request.id);
                      const isNew = Boolean(request.unread) && status === 'pending' && !inSession;
                      return (
                      <article
                        key={request.id}
                        className={`rounded-xl border p-5 shadow-sm transition-all ${
                          inSession
                            ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-200/50'
                            : isNew
                            ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-300/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-bold ${
                              inSession
                                ? 'border-blue-300 bg-blue-100 text-blue-800'
                                : isNew
                                ? 'border-amber-300 bg-amber-100 text-amber-900'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}>
                              {(request.clientName || 'C').slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className={`text-lg text-slate-900 ${isNew || inSession ? 'font-black' : 'font-semibold'}`}>
                                  {request.clientName}
                                </h3>
                                {inSession && (
                                  <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                                    In chat
                                  </span>
                                )}
                                {isNew && (
                                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                                    New
                                  </span>
                                )}
                                {status === 'pending' && !inSession && (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</span>
                                )}
                                {status === 'cancelled' && (
                                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">Cancelled</span>
                                )}
                                {status === 'completed' && (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Completed</span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">{request.category}</span>
                                <span>• {request.submittedAt}</span>
                                {inSession && (
                                  <span className="font-semibold text-blue-700">· Chat open — closes to Active</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {inSession ? (
                              <button
                                type="button"
                                onClick={() => openChat(request)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#0f2d5e] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#143974]"
                              >
                                <MessageCircle size={16} />
                                Return to chat
                              </button>
                            ) : status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={acceptingId === request.id}
                                  onClick={() => acceptAndStartChat(request)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {acceptingId === request.id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 size={16} />
                                  )}
                                  Accept & chat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateRequestStatus(request.id, 'declined')}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                                >
                                  <XCircle size={16} />
                                  Decline
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-medium text-slate-500">{statusLabel(status)}</span>
                            )}
                          </div>
                        </div>

                        <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm italic leading-relaxed text-slate-700">
                          &quot;{request.message}&quot;
                        </p>
                      </article>
                    ); }) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                        No pending or passive consultations match your current filters.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : activeSection === 'case-files' ? (
            <CaseFilesSection
              consultations={consultations}
              localCases={localCases}
              onOpenNewCase={() => setIsNewCaseModalOpen(true)}
              onOpenConsultations={() => setActiveSection('consultations')}
              onRefreshCases={refreshLocalCases}
              onSelectCase={(c) => setSelectedCaseDetail(c)}
              onToast={setFeedbackMessage}
            />
          ) : activeSection === 'documents' ? (
            <DocumentsSection onToast={setFeedbackMessage} />
          ) : activeSection === 'case-comparisons' ? (
            <CaseComparisonsSection
              localCases={localCases}
              consultations={consultations}
              onToast={setFeedbackMessage}
            />
          ) : activeSection === 'analytics' ? (
            <AnalyticsSection
              consultations={consultations}
              localCases={localCases}
              onOpenConsultations={() => setActiveSection('consultations')}
              onOpenCaseFiles={() => setActiveSection('case-files')}
            />
          ) : activeSection === 'profile' ? (
            <ProfileSection
              user={user}
              consultationStats={{
                active: activeCount,
                pending: pendingCount,
                completed: completedCount,
              }}
              onProfileSaved={(partial) => {
                if (typeof updateUser === 'function') updateUser(partial);
              }}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Unknown section. <button type="button" className="font-semibold text-blue-600" onClick={() => setActiveSection('dashboard')}>Return to Dashboard</button>
            </div>
          )}
        </div>

        {/* Floating Action Button */}
        <button 
          onClick={() => setIsAIChatOpen(!isAIChatOpen)}
          className={`fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95 ${isAIChatOpen ? 'bg-slate-800' : 'bg-blue-700'}`}
        >
          {isAIChatOpen ? <X size={24} /> : <MessageCircle size={28} />}
        </button>

        {/* Sliding AI Chatbot Panel */}
        {isAIChatOpen && (
          <div className="fixed bottom-28 right-8 z-50 flex h-[600px] w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="flex items-center justify-between bg-[#0f2d5e] p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">VakeelLink AI</h3>
                  <p className="text-[10px] text-blue-200">Context: {displayName}</p>
                </div>
              </div>
              <button onClick={() => setIsAIChatOpen(false)} className="rounded-full p-1 hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">
              {aiMessages.map(msg => (
                <div key={msg.id} className={`flex max-w-[85%] flex-col ${msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                  <div className={`rounded-2xl p-3 text-sm shadow-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                  <span className="mt-1 text-[10px] text-slate-400">{msg.timestamp}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendAiMessage} className="border-t border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                <input 
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask your AI assistant..."
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <button type="submit" disabled={!aiInput.trim() || aiBusy} className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors">
                  {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </form>
          </div>
        )}

        {feedbackMessage && (
          <div className="fixed bottom-8 right-28 z-50 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {feedbackMessage}
          </div>
        )}

        {chatTarget && (
          <ConsultationChat
            consultationId={chatTarget.id}
            title={`Chat with ${chatTarget.clientName}`}
            onClose={closeChatSession}
          />
        )}

        {isNewCaseModalOpen && (
          <NewCaseModal
            onClose={() => setIsNewCaseModalOpen(false)}
            onGoToConsultations={() => {
              setIsNewCaseModalOpen(false);
              setActiveSection('consultations');
            }}
            onGoToCaseFiles={() => {
              setIsNewCaseModalOpen(false);
              setActiveSection('case-files');
            }}
            onSaved={() => {
              refreshLocalCases();
              setFeedbackMessage('Case saved to Case Files');
            }}
          />
        )}

        {selectedCaseDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-[#0f2d5e]">{selectedCaseDetail.title || selectedCaseDetail.clientName}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {selectedCaseDetail.category || 'General Law'}
                    {selectedCaseDetail.clientName ? ` · ${selectedCaseDetail.clientName}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedCaseDetail(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs sm:grid-cols-2">
                {selectedCaseDetail.incidentDate && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-slate-400">Incident date</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selectedCaseDetail.incidentDate}</dd>
                  </div>
                )}
                {selectedCaseDetail.nextHearing && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-slate-400">Next hearing</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selectedCaseDetail.nextHearing}</dd>
                  </div>
                )}
                {selectedCaseDetail.forum && (
                  <div className="sm:col-span-2">
                    <dt className="font-bold uppercase tracking-wider text-slate-400">Forum</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selectedCaseDetail.forum}</dd>
                  </div>
                )}
                {selectedCaseDetail.peopleInvolved && (
                  <div className="sm:col-span-2">
                    <dt className="font-bold uppercase tracking-wider text-slate-400">People involved</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selectedCaseDetail.peopleInvolved}</dd>
                  </div>
                )}
                {selectedCaseDetail.opposingParty && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-slate-400">Opposing party</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selectedCaseDetail.opposingParty}</dd>
                  </div>
                )}
                {selectedCaseDetail.priority && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-slate-400">Priority</dt>
                    <dd className="mt-0.5 font-medium capitalize text-slate-800">{selectedCaseDetail.priority}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 max-h-56 space-y-3 overflow-y-auto pr-1">
                {formatReadableText(selectedCaseDetail.facts || selectedCaseDetail.message).map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700">
                    {para}
                  </p>
                ))}
                {!selectedCaseDetail.facts && !selectedCaseDetail.message && (
                  <p className="text-sm text-slate-500">No facts recorded.</p>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCaseDetail(null);
                    setActiveSection('case-comparisons');
                    setFeedbackMessage('Open Case Comparisons — select this matter plus another to compare');
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open comparisons
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCaseDetail(null)}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MetricCard({ label, value, badge, accent, icon: Icon }) {
  const accentClasses = {
    blue: 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
    orange: 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white',
    yellow: 'bg-yellow-50 text-yellow-600 group-hover:bg-yellow-600 group-hover:text-white',
    teal: 'bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white',
  };

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-slate-300">
      <div className="mb-4 flex items-start justify-between">
        <div className={`rounded-lg p-2 transition-colors ${accentClasses[accent]}`}>
          <Icon size={20} />
        </div>
        <span className="rounded bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">{badge}</span>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <h3 className="mt-1 text-3xl font-bold text-[#0f2d5e]">{value}</h3>
    </div>
  );
}

function ActivityItem({ item }) {
  const typeStyles = {
    success: { wrapper: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 },
    video: { wrapper: 'bg-blue-100 text-blue-600', icon: Video },
    message: { wrapper: 'bg-orange-100 text-orange-600', icon: Mail },
    verify: { wrapper: 'bg-slate-100 text-slate-600', icon: UserCircle2 },
  };
  const { wrapper, icon: Icon } = typeStyles[item.type] || typeStyles.verify;

  return (
    <div className="flex items-start gap-4 border-b border-slate-50 p-6 transition-colors hover:bg-slate-50">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${wrapper}`}>
        <Icon size={20} />
      </div>
      <div className="flex-1">
        <div className="flex justify-between gap-4">
          <p className="text-base font-semibold text-slate-900">{item.title}</p>
          <span className="text-xs text-slate-400">{item.timeAgo}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>
      </div>
    </div>
  );
}