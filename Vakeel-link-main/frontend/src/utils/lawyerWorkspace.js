/**
 * Browser-local workspace for lawyer portal (cases, documents, seeded demos).
 * Used when Supabase is unavailable or for drafts the lawyer creates themselves.
 */

const CASES_KEY = 'vakeellink_lawyer_cases';
const DOCS_KEY = 'vakeellink_lawyer_documents';
const CONSULT_KEY = 'vakeellink_local_consultations';
const LEGACY_DRAFTS_KEY = 'vakeellink_case_drafts';
/** Bump this to wipe old case store and re-seed category dummies once. */
const CASES_SEED_VERSION = 'v3_all_categories_pending';
const CASES_SEED_FLAG = 'vakeellink_lawyer_cases_seed_version';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Newest first; pending always sorted above other statuses. */
function sortCases(cases) {
  const rank = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending') return 0;
    if (s === 'active' || s === 'draft') return 1;
    if (s === 'completed') return 2;
    return 3;
  };
  return [...(cases || [])].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function buildDummyCases() {
  const base = Date.now();
  const mk = (offsetMin, data) => ({
    id: `case_seed_${data.caseType}_${offsetMin}`,
    title: data.title,
    clientName: data.clientName,
    category: data.category,
    caseType: data.caseType,
    facts: data.facts,
    status: data.status || 'pending',
    source: 'seed',
    createdAt: new Date(base - offsetMin * 60_000).toISOString(),
    updatedAt: new Date(base - offsetMin * 60_000).toISOString(),
  });

  // One sample matter per practice category (readable multi-paragraph facts)
  return [
    mk(10, {
      caseType: 'family',
      category: 'Family Law',
      title: 'Mehta — mutual consent divorce',
      clientName: 'Ananya Mehta',
      status: 'pending',
      facts:
        'Parties have lived separately since March 2025 and seek mutual consent divorce under the Hindu Marriage Act.\n\n' +
        'Issues: interim maintenance, child visitation schedule for one minor, and division of jewellery.\n\n' +
        'Documents available: marriage certificate, Aadhaar of both parties, and a draft settlement note.',
    }),
    mk(40, {
      caseType: 'labour',
      category: 'Labour Law',
      title: 'Sharma — wrongful termination',
      clientName: 'Vikram Sharma',
      status: 'pending',
      facts:
        'Client was terminated without notice after 4 years of service at a private IT firm.\n\n' +
        'Claims unpaid salary for two months, gratuity, and full & final settlement.\n\n' +
        'Has appointment letter, last three salary slips, and termination email.',
    }),
    mk(80, {
      caseType: 'criminal',
      category: 'Criminal Law',
      title: 'Khan — anticipatory bail (cheating FIR)',
      clientName: 'Imran Khan',
      status: 'pending',
      facts:
        'FIR registered under cheating provisions after a business partnership dispute.\n\n' +
        'Client apprehends arrest and seeks anticipatory bail strategy.\n\n' +
        'FIR copy and partnership deed have been shared.',
    }),
    mk(120, {
      caseType: 'property',
      category: 'Property Law',
      title: 'Iyer — boundary & partition dispute',
      clientName: 'Sneha Iyer',
      status: 'active',
      facts:
        'Dispute with sibling over ancestral house partition and a disputed shared wall with the neighbour.\n\n' +
        'Client wants notice draft, mediation first, then civil suit if needed.\n\n' +
        'Title deed, municipal survey sketch, and family tree notes available.',
    }),
    mk(180, {
      caseType: 'consumer',
      category: 'Consumer Law',
      title: 'Patel — bank foreclosure charge',
      clientName: 'Ritesh Patel',
      status: 'pending',
      facts:
        'Bank levied foreclosure / prepayment charges contrary to the loan sanction letter.\n\n' +
        'Client seeks refund and complaint before the consumer commission if bank does not reverse charges.\n\n' +
        'Sanction letter, account statements, and email trail with bank attached.',
    }),
    mk(240, {
      caseType: 'constitutional',
      category: 'Constitutional Law',
      title: 'NGO Rights Forum — writ on service denial',
      clientName: 'NGO Rights Forum',
      status: 'active',
      facts:
        'Public authority allegedly denied a statutory service without reasons.\n\n' +
        'Client explores writ jurisdiction for mandamus / direction to decide the representation.\n\n' +
        'Representation copy, RTI replies, and identity proofs collected.',
    }),
    mk(300, {
      caseType: 'general',
      category: 'General Law',
      title: 'Das — first legal consultation (unclear forum)',
      clientName: 'Priya Das',
      status: 'pending',
      facts:
        'Client is unsure whether the dispute is civil, consumer, or criminal.\n\n' +
        'Brief facts involve money paid for services that were not delivered, plus WhatsApp threats.\n\n' +
        'Needs a plain-language opinion on forum, next notice, and evidence checklist.',
    }),
  ];
}

/**
 * Wipe previous case files once (seed version change) and load category dummies.
 * User-created cases after seed are never wiped by later list calls.
 */
export function resetAndSeedLawyerCases() {
  try {
    localStorage.removeItem(LEGACY_DRAFTS_KEY);
  } catch {
    // ignore
  }
  const dummies = buildDummyCases();
  writeJson(CASES_KEY, dummies);
  localStorage.setItem(CASES_SEED_FLAG, CASES_SEED_VERSION);
  return sortCases(dummies);
}

// ── Cases (lawyer-created case files / drafts) ──────────────────────────────

export function listLawyerCases() {
  // One-time (per seed version): clear old cases and install category dummies
  if (localStorage.getItem(CASES_SEED_FLAG) !== CASES_SEED_VERSION) {
    return resetAndSeedLawyerCases();
  }

  const cases = readJson(CASES_KEY, []);
  if (!Array.isArray(cases) || cases.length === 0) {
    return resetAndSeedLawyerCases();
  }
  return sortCases(cases);
}

/**
 * Create a new case at the top as pending. Never overwrites existing rows.
 */
export function saveLawyerCase({ title, facts, category = 'General Law', clientName, caseType }) {
  // Ensure store is initialised (may seed once)
  const existing = listLawyerCases();
  const now = new Date().toISOString();
  const record = {
    id: uid('case'),
    title: (title || 'Untitled matter').trim(),
    clientName: (clientName || title || 'Client').trim(),
    category: (category || 'General Law').trim(),
    caseType: caseType || null,
    facts: (facts || '').trim(),
    // New issues always start as pending and sit at the top of the queue
    status: 'pending',
    source: 'user',
    createdAt: now,
    updatedAt: now,
  };
  // Prepend — do not replace previous cases
  const next = sortCases([record, ...existing]);
  writeJson(CASES_KEY, next.slice(0, 150));
  return record;
}

export function updateLawyerCase(id, updates) {
  const cases = listLawyerCases();
  const idx = cases.findIndex((c) => String(c.id) === String(id));
  if (idx < 0) return null;
  cases[idx] = {
    ...cases[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  writeJson(CASES_KEY, cases);
  return cases[idx];
}

export function deleteLawyerCase(id) {
  const next = listLawyerCases().filter((c) => String(c.id) !== String(id));
  writeJson(CASES_KEY, next);
  return next;
}

// ── Documents (folder vault by practice area) ───────────────────────────────

const DOCS_SEED_VERSION = 'v2_folder_vault';
const DOCS_SEED_FLAG = 'vakeellink_lawyer_docs_seed_version';

/** Practice-area folders for the lawyer document vault */
export const DOCUMENT_FOLDERS = [
  {
    id: 'family',
    label: 'Family cases',
    description: 'Divorce, custody, maintenance, DV, marriage papers',
    accent: 'from-rose-500/15 to-rose-600/5',
    ring: 'ring-rose-200',
    icon: 'heart',
  },
  {
    id: 'labour',
    label: 'Labour cases',
    description: 'Employment, PF, gratuity, termination, wages',
    accent: 'from-amber-500/15 to-amber-600/5',
    ring: 'ring-amber-200',
    icon: 'briefcase',
  },
  {
    id: 'criminal',
    label: 'Criminal cases',
    description: 'FIR copies, bail papers, charge-sheets, vakalatnama',
    accent: 'from-red-500/15 to-red-600/5',
    ring: 'ring-red-200',
    icon: 'shield',
  },
  {
    id: 'property',
    label: 'Property cases',
    description: 'Title deeds, partition, rent, mutation, surveys',
    accent: 'from-emerald-500/15 to-emerald-600/5',
    ring: 'ring-emerald-200',
    icon: 'home',
  },
  {
    id: 'consumer',
    label: 'Consumer cases',
    description: 'Bank, insurance, product/service complaints',
    accent: 'from-sky-500/15 to-sky-600/5',
    ring: 'ring-sky-200',
    icon: 'cart',
  },
  {
    id: 'constitutional',
    label: 'Constitutional / writs',
    description: 'Writ petitions, RTI, government representations',
    accent: 'from-violet-500/15 to-violet-600/5',
    ring: 'ring-violet-200',
    icon: 'scale',
  },
  {
    id: 'general',
    label: 'General civil',
    description: 'Notices, agreements, mixed civil matters',
    accent: 'from-blue-500/15 to-blue-600/5',
    ring: 'ring-blue-200',
    icon: 'file',
  },
  {
    id: 'misc',
    label: 'Miscellaneous',
    description: 'Templates, research notes, chamber admin files',
    accent: 'from-slate-500/15 to-slate-600/5',
    ring: 'ring-slate-200',
    icon: 'folder',
  },
];

function folderById(folderId) {
  return DOCUMENT_FOLDERS.find((f) => f.id === folderId) || DOCUMENT_FOLDERS.find((f) => f.id === 'general');
}

function buildSeedDocuments() {
  const now = Date.now();
  const mk = (folderId, name, offsetH, notes) => ({
    id: `doc_seed_${folderId}_${offsetH}`,
    name,
    folderId,
    caseId: null,
    caseLabel: folderById(folderId)?.label || 'General',
    notes: notes || '',
    contentBase64: null,
    mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
    size: 120_000 + offsetH * 1700,
    date: new Date(now - offsetH * 3600_000).toISOString(),
    seed: true,
  });

  return [
    mk('family', 'Petition_Mutual_Consent_Draft.pdf', 2, 'Draft petition under HMA s.13B'),
    mk('family', 'Marriage_Certificate_Scan.pdf', 5, 'Client marriage certificate'),
    mk('family', 'Interim_Maintenance_Note.docx', 8, 'Working note on interim relief'),
    mk('labour', 'Appointment_Letter.pdf', 3, 'Employee appointment letter'),
    mk('labour', 'Termination_Email_Print.pdf', 6, 'Termination communication trail'),
    mk('labour', 'Salary_Slips_Last3.pdf', 9, 'Last three months salary slips'),
    mk('criminal', 'FIR_Copy.pdf', 4, 'Certified FIR extract'),
    mk('criminal', 'Bail_Application_Draft.docx', 7, 'Anticipatory bail draft'),
    mk('property', 'Title_Deed_Scan.pdf', 3, 'Registered sale deed'),
    mk('property', 'Survey_Sketch.pdf', 10, 'Municipal survey sketch'),
    mk('consumer', 'Bank_Sanction_Letter.pdf', 2, 'Loan sanction letter'),
    mk('consumer', 'Account_Statement.pdf', 11, 'Relevant bank statements'),
    mk('constitutional', 'Representation_to_Authority.pdf', 4, 'Pre-writ representation'),
    mk('constitutional', 'RTI_Replies_Bundle.pdf', 12, 'RTI replies for record'),
    mk('general', 'Legal_Notice_Template.docx', 1, 'Chamber notice template'),
    mk('general', 'Client_Engagement_Letter.pdf', 14, 'Engagement / fee letter'),
    mk('misc', 'Chamber_Cause_List_Notes.pdf', 6, 'Weekly cause list notes'),
    mk('misc', 'Research_Precedents_Index.docx', 15, 'Index of frequently cited authorities'),
  ];
}

function normalizeDocument(doc) {
  if (!doc || typeof doc !== 'object') return null;
  let folderId = doc.folderId;
  if (!folderId) {
    const label = String(doc.caseLabel || doc.category || '').toLowerCase();
    if (label.includes('family')) folderId = 'family';
    else if (label.includes('labour') || label.includes('labor')) folderId = 'labour';
    else if (label.includes('criminal')) folderId = 'criminal';
    else if (label.includes('property') || label.includes('land')) folderId = 'property';
    else if (label.includes('consumer')) folderId = 'consumer';
    else if (label.includes('constitutional') || label.includes('writ')) folderId = 'constitutional';
    else if (label.includes('misc')) folderId = 'misc';
    else folderId = 'general';
  }
  if (!DOCUMENT_FOLDERS.some((f) => f.id === folderId)) folderId = 'general';
  return {
    ...doc,
    folderId,
    caseLabel: doc.caseLabel || folderById(folderId)?.label || 'General',
  };
}

export function listLawyerDocuments() {
  if (localStorage.getItem(DOCS_SEED_FLAG) !== DOCS_SEED_VERSION) {
    const seeded = buildSeedDocuments();
    writeJson(DOCS_KEY, seeded);
    localStorage.setItem(DOCS_SEED_FLAG, DOCS_SEED_VERSION);
    return seeded;
  }
  const docs = readJson(DOCS_KEY, []);
  if (!Array.isArray(docs) || docs.length === 0) {
    const seeded = buildSeedDocuments();
    writeJson(DOCS_KEY, seeded);
    localStorage.setItem(DOCS_SEED_FLAG, DOCS_SEED_VERSION);
    return seeded;
  }
  const normalized = docs.map(normalizeDocument).filter(Boolean);
  // Persist migration of legacy docs missing folderId
  if (normalized.some((d, i) => d.folderId !== docs[i]?.folderId)) {
    writeJson(DOCS_KEY, normalized);
  }
  return normalized.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function listDocumentsInFolder(folderId) {
  const fid = folderId || 'general';
  return listLawyerDocuments().filter((d) => d.folderId === fid);
}

export function getDocumentFoldersWithCounts() {
  const docs = listLawyerDocuments();
  return DOCUMENT_FOLDERS.map((folder) => {
    const count = docs.filter((d) => d.folderId === folder.id).length;
    const latest = docs.find((d) => d.folderId === folder.id);
    return {
      ...folder,
      count,
      latestName: latest?.name || null,
      latestDate: latest?.date || null,
    };
  });
}

export function addLawyerDocument({
  name,
  folderId = 'general',
  caseId,
  caseLabel,
  notes,
  contentBase64,
  mimeType,
  size,
}) {
  const docs = listLawyerDocuments();
  const folder = folderById(folderId);
  const record = {
    id: uid('doc'),
    name: name || 'Untitled document',
    folderId: folder?.id || 'general',
    caseId: caseId || null,
    caseLabel: caseLabel || folder?.label || 'General',
    notes: notes || '',
    contentBase64: contentBase64 || null,
    mimeType: mimeType || 'application/octet-stream',
    size: size || 0,
    date: new Date().toISOString(),
    seed: false,
  };
  docs.unshift(record);
  writeJson(DOCS_KEY, docs.slice(0, 120));
  return record;
}

export function deleteLawyerDocument(id) {
  const next = listLawyerDocuments().filter((d) => String(d.id) !== String(id));
  writeJson(DOCS_KEY, next);
  return next;
}

export function formatBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Local consultations (client-side fallback when API empty/offline) ───────

export function listLocalConsultations(lawyerId) {
  const all = readJson(CONSULT_KEY, []);
  if (!Array.isArray(all)) return [];
  if (!lawyerId) return all;
  return all.filter((c) => !c.lawyer_id || c.lawyer_id === lawyerId);
}

export function upsertLocalConsultation(row) {
  const all = readJson(CONSULT_KEY, []);
  const idx = all.findIndex((c) => String(c.id) === String(row.id));
  if (idx >= 0) all[idx] = { ...all[idx], ...row, updated_at: new Date().toISOString() };
  else all.unshift({ ...row, created_at: row.created_at || new Date().toISOString() });
  writeJson(CONSULT_KEY, all);
  return row;
}

export function updateLocalConsultationStatus(id, status) {
  const all = readJson(CONSULT_KEY, []);
  const idx = all.findIndex((c) => String(c.id) === String(id));
  if (idx < 0) return null;
  all[idx] = { ...all[idx], status, updated_at: new Date().toISOString() };
  writeJson(CONSULT_KEY, all);
  return all[idx];
}

/**
 * Seed a few demo consultation requests for a lawyer if they have none (API + local).
 * Only runs once per lawyer id unless force=true.
 */
export function ensureDemoConsultations(lawyerId, lawyerName = 'Advocate') {
  if (!lawyerId) return listLocalConsultations(lawyerId);
  const flagKey = `vakeellink_seeded_consults_${lawyerId}`;
  if (localStorage.getItem(flagKey) === '1') {
    return listLocalConsultations(lawyerId);
  }
  const existing = listLocalConsultations(lawyerId);
  if (existing.length > 0) {
    localStorage.setItem(flagKey, '1');
    return existing;
  }

  const now = Date.now();
  const demos = [
    {
      id: uid('consult'),
      status: 'pending',
      domain: 'family',
      client_message:
        'Need advice on mutual consent divorce timeline and interim maintenance. Both parties currently separate since March.',
      user_id: 'demo_client_1',
      lawyer_id: lawyerId,
      client_name: 'Ananya Mehta',
      lawyer_name: lawyerName,
      mode: 'chat',
      created_at: new Date(now - 2 * 3600_000).toISOString(),
    },
    {
      id: uid('consult'),
      status: 'pending',
      domain: 'property',
      client_message:
        'Boundary dispute with neighbour over shared wall. Looking for notice draft and mediation options before suit.',
      user_id: 'demo_client_2',
      lawyer_id: lawyerId,
      client_name: 'Rahul Verma',
      lawyer_name: lawyerName,
      mode: 'chat',
      created_at: new Date(now - 26 * 3600_000).toISOString(),
    },
    {
      id: uid('consult'),
      status: 'active',
      domain: 'consumer',
      client_message: 'Bank wrongly charged foreclosure fee. Documents already shared — need next steps for forum complaint.',
      user_id: 'demo_client_3',
      lawyer_id: lawyerId,
      client_name: 'Sneha Iyer',
      lawyer_name: lawyerName,
      mode: 'chat',
      created_at: new Date(now - 3 * 86400_000).toISOString(),
    },
  ];

  const all = readJson(CONSULT_KEY, []);
  writeJson(CONSULT_KEY, [...demos, ...all]);
  localStorage.setItem(flagKey, '1');
  return demos;
}

export function buildAnalytics({ consultations = [], cases = [], documents = [] }) {
  const byStatus = { pending: 0, active: 0, completed: 0, cancelled: 0, draft: 0 };
  consultations.forEach((c) => {
    const s = String(c.status || 'pending').toLowerCase();
    if (s in byStatus) byStatus[s] += 1;
    else if (s === 'accepted') byStatus.active += 1;
    else byStatus.pending += 1;
  });
  cases.forEach((c) => {
    if (c.status === 'draft') byStatus.draft += 1;
  });

  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleString('en', { month: 'short' });
    months.push({ key, label, count: 0 });
  }
  consultations.forEach((c) => {
    const created = c.createdAt || c.created_at;
    if (!created) return;
    const d = new Date(created);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const slot = months.find((m) => m.key === key);
    if (slot) slot.count += 1;
  });

  const total = consultations.length || 1;
  const completed = byStatus.completed;
  const active = byStatus.active;
  const winRate = Math.min(98, Math.round(((completed + active * 0.5) / total) * 100) || 0);

  return {
    byStatus,
    months,
    totalConsultations: consultations.length,
    totalCases: cases.length,
    totalDocuments: documents.length,
    winRate,
    casesWon: completed,
    openMatters: byStatus.active + byStatus.pending + byStatus.draft,
  };
}
