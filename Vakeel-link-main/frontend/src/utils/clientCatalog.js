/**
 * Stable demo catalog for the client portal.
 * Seeded once per browser; never wiped when the user creates new consultations / searches.
 */

export const DEMO_LAWYERS = [
  {
    id: 'demo-lawyer-criminal-001',
    name: 'Adv. Rajesh Kumar',
    specialization: 'criminal',
    specializationLabel: 'Criminal Law',
    experience_years: 15,
    rating: 4.9,
    review_count: 128,
    cases_solved: 210,
    location: 'Tis Hazari Courts, New Delhi',
    fee_per_consultation: 3500,
    is_verified: true,
    is_online: true,
    languages: ['English', 'Hindi'],
    areas_of_practice: ['Bail', 'FIR defence', 'Sessions trials', 'White collar crime'],
    bio:
      'Practising criminal counsel with extensive experience in bail, charge framing, and trial advocacy. ' +
      'Known for clear client briefings and careful evidence strategy in Sessions and Magistrate courts.',
    bar_council_id: 'D/1122/2009',
    avatar: null,
    lawyer_reviews: [
      { id: 'r1', reviewer_name: 'Amit S.', rating: 5, comment: 'Got anticipatory bail on strong grounds. Very thorough.' },
      { id: 'r2', reviewer_name: 'Neha K.', rating: 5, comment: 'Explained every step of the FIR process clearly.' },
    ],
  },
  {
    id: 'demo-lawyer-family-001',
    name: 'Adv. Priya Sharma',
    specialization: 'family',
    specializationLabel: 'Family Law',
    experience_years: 12,
    rating: 4.8,
    review_count: 96,
    cases_solved: 175,
    location: 'Family Court, Mumbai',
    fee_per_consultation: 3000,
    is_verified: true,
    is_online: true,
    languages: ['English', 'Hindi', 'Marathi'],
    areas_of_practice: ['Divorce', 'Custody', 'Maintenance', 'Domestic violence'],
    bio:
      'Family law advocate focused on practical settlements and court-ready pleadings under HMA and related statutes. ' +
      'Emphasises child welfare and dignified outcomes for both parties where possible.',
    bar_council_id: 'MH/2048/2012',
    avatar: null,
    lawyer_reviews: [
      { id: 'r1', reviewer_name: 'Sneha M.', rating: 5, comment: 'Sensitive handling of mutual consent divorce.' },
    ],
  },
  {
    id: 'demo-lawyer-labour-001',
    name: 'Adv. Vikram Singh',
    specialization: 'labour',
    specializationLabel: 'Labour Law',
    experience_years: 18,
    rating: 4.7,
    review_count: 84,
    cases_solved: 160,
    location: 'Labour Court, Chandigarh',
    fee_per_consultation: 2800,
    is_verified: true,
    is_online: false,
    languages: ['English', 'Hindi', 'Punjabi'],
    areas_of_practice: ['Wrongful termination', 'PF & gratuity', 'Industrial disputes', 'POSH'],
    bio:
      'Labour and employment specialist for employees and SMEs. Strong on settlement negotiations and Industrial Disputes Act practice.',
    bar_council_id: 'CH/778/2006',
    avatar: null,
    lawyer_reviews: [],
  },
  {
    id: 'demo-lawyer-property-001',
    name: 'Adv. Anjali Gupta',
    specialization: 'property',
    specializationLabel: 'Property Law',
    experience_years: 14,
    rating: 4.85,
    review_count: 110,
    cases_solved: 190,
    location: 'City Civil Court, Bengaluru',
    fee_per_consultation: 3200,
    is_verified: true,
    is_online: true,
    languages: ['English', 'Hindi', 'Kannada'],
    areas_of_practice: ['Title disputes', 'Partition', 'RERA', 'Rent control'],
    bio:
      'Property and real-estate counsel for title diligence, partition suits, and builder-buyer disputes. ' +
      'Clear written opinions for first consultations.',
    bar_council_id: 'KA/3310/2010',
    avatar: null,
    lawyer_reviews: [
      { id: 'r1', reviewer_name: 'Ravi P.', rating: 5, comment: 'Excellent title note and notice draft.' },
    ],
  },
  {
    id: 'demo-lawyer-consumer-001',
    name: 'Adv. Meera Kapoor',
    specialization: 'consumer',
    specializationLabel: 'Consumer Law',
    experience_years: 10,
    rating: 4.75,
    review_count: 72,
    cases_solved: 140,
    location: 'Consumer Commission, Delhi',
    fee_per_consultation: 2500,
    is_verified: true,
    is_online: true,
    languages: ['English', 'Hindi'],
    areas_of_practice: ['Banking disputes', 'Insurance', 'E-commerce', 'Service deficiency'],
    bio:
      'Consumer forum practice with focus on banks, insurers, and digital services. Efficient complaint drafting and evidence checklists.',
    bar_council_id: 'D/2048/2016',
    avatar: null,
    lawyer_reviews: [],
  },
  {
    id: 'demo-lawyer-constitutional-001',
    name: 'Adv. Arjun Nair',
    specialization: 'constitutional',
    specializationLabel: 'Constitutional Law',
    experience_years: 20,
    rating: 4.95,
    review_count: 64,
    cases_solved: 95,
    location: 'High Court of Kerala, Ernakulam',
    fee_per_consultation: 4500,
    is_verified: true,
    is_online: false,
    languages: ['English', 'Malayalam', 'Hindi'],
    areas_of_practice: ['Writ petitions', 'Service matters', 'Fundamental rights', 'PIL'],
    bio:
      'Writ and constitutional practice before High Courts. Structured first opinions on maintainability and forum choice.',
    bar_council_id: 'KL/0901/2004',
    avatar: null,
    lawyer_reviews: [],
  },
  {
    id: 'demo-lawyer-general-001',
    name: 'Adv. Suresh Iyer',
    specialization: 'general',
    specializationLabel: 'General Civil',
    experience_years: 11,
    rating: 4.6,
    review_count: 58,
    cases_solved: 120,
    location: 'District Court, Chennai',
    fee_per_consultation: 2200,
    is_verified: true,
    is_online: true,
    languages: ['English', 'Tamil', 'Hindi'],
    areas_of_practice: ['Legal notices', 'Contracts', 'Civil suits', 'ADR'],
    bio:
      'General civil practitioner for notices, contracts, and early dispute resolution. Good first stop when forum is unclear.',
    bar_council_id: 'TN/4412/2013',
    avatar: null,
    lawyer_reviews: [],
  },
];

const CONSULT_SEED_FLAG = 'vakeellink_client_consult_seed_v1';
const CONSULT_USER_KEY = 'vakeellink_client_consultations';
/** Public lawyer cards published when an advocate saves their profile (client-visible). */
const PUBLIC_LAWYERS_KEY = 'vakeellink_public_lawyer_profiles';
const LAWYERS_EVENT = 'vakeellink-lawyers-updated';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function notifyLawyersUpdated() {
  try {
    window.dispatchEvent(new CustomEvent(LAWYERS_EVENT));
  } catch {
    // ignore
  }
}

export function onLawyersCatalogUpdated(handler) {
  window.addEventListener(LAWYERS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(LAWYERS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Publish advocate profile so client directory / profile pages show the update
 * (same browser; survives offline). Merges into catalog by lawyer id.
 */
export function publishLawyerProfile(profile = {}) {
  const id = String(profile.id || profile.user_id || '').trim();
  if (!id) return null;
  const map = readJson(PUBLIC_LAWYERS_KEY, {}) || {};
  const prev = map[id] || {};
  const card = normalizeLawyerCard({
    ...prev,
    ...profile,
    id,
    name: profile.name || profile.full_name || prev.name,
    updatedAt: new Date().toISOString(),
  });
  map[id] = card;
  writeJson(PUBLIC_LAWYERS_KEY, map);
  notifyLawyersUpdated();
  return card;
}

export function listPublishedLawyerProfiles() {
  const map = readJson(PUBLIC_LAWYERS_KEY, {}) || {};
  return Object.values(map).map((l) => normalizeLawyerCard(l));
}

export function getPublishedLawyerById(id) {
  if (!id) return null;
  const map = readJson(PUBLIC_LAWYERS_KEY, {}) || {};
  const row = map[String(id)];
  return row ? normalizeLawyerCard(row) : null;
}

/** Normalize API or demo lawyer for cards / profile */
export function normalizeLawyerCard(raw = {}) {
  const spec = raw.specialization || raw.specializationLabel || 'general';
  const specializationLabel =
    raw.specializationLabel ||
    String(spec)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ...raw,
    id: String(raw.id),
    name: raw.name || 'Advocate',
    specialization: String(spec).toLowerCase().replace(/\s+/g, '_').replace('law', '').replace(/_+/g, '') || spec,
    specializationLabel,
    experience_years: Number(raw.experience_years || raw.experience || 0),
    rating: Number(raw.rating || 4.5),
    review_count: Number(raw.review_count || (raw.lawyer_reviews || []).length || 0),
    cases_solved: Number(raw.cases_solved || 0),
    location: raw.location || 'India',
    fee_per_consultation: Number(raw.fee_per_consultation || 0),
    consultation_fee: raw.fee_per_consultation
      ? `₹${Number(raw.fee_per_consultation).toLocaleString('en-IN')}`
      : raw.consultation_fee || 'On request',
    is_verified: raw.is_verified !== false,
    is_online: Boolean(raw.is_online),
    languages: Array.isArray(raw.languages) ? raw.languages : ['English', 'Hindi'],
    areas_of_practice: Array.isArray(raw.areas_of_practice) ? raw.areas_of_practice : [],
    bio: raw.bio || 'Practising advocate available for consultation on VakeelLink.',
    bar_council_id: raw.bar_council_id || '',
    avatar: raw.avatar || raw.profile_image_url || null,
    lawyer_reviews: raw.lawyer_reviews || [],
    demo: Boolean(raw.demo) || String(raw.id || '').startsWith('demo-lawyer-'),
  };
}

/**
 * Merge API lawyers with stable demo catalog + published profile edits.
 * Order: demos → API → published (lawyer portal saves win for that id).
 */
export function mergeLawyersCatalog(apiLawyers = []) {
  const byId = new Map();
  DEMO_LAWYERS.map((l) => normalizeLawyerCard({ ...l, demo: true })).forEach((l) => byId.set(l.id, l));
  (apiLawyers || []).forEach((raw) => {
    const l = normalizeLawyerCard(raw);
    if (!l.id) return;
    byId.set(l.id, { ...byId.get(l.id), ...l, demo: false });
  });
  // Lawyer-edited public profiles (client-visible immediately)
  listPublishedLawyerProfiles().forEach((l) => {
    if (!l?.id) return;
    const prev = byId.get(l.id) || {};
    byId.set(l.id, {
      ...prev,
      ...l,
      demo: false,
      // Keep ratings/reviews from prior if publish omitted them
      rating: l.rating || prev.rating || 4.5,
      review_count: l.review_count || prev.review_count || 0,
      lawyer_reviews: (l.lawyer_reviews && l.lawyer_reviews.length
        ? l.lawyer_reviews
        : prev.lawyer_reviews) || [],
    });
  });
  return Array.from(byId.values()).sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
    return (b.rating || 0) - (a.rating || 0);
  });
}

export function getDemoLawyerById(id) {
  const published = getPublishedLawyerById(id);
  if (published) return published;
  const found = DEMO_LAWYERS.find((l) => String(l.id) === String(id));
  return found ? normalizeLawyerCard({ ...found, demo: true }) : null;
}

function buildSeedConsultations() {
  const now = Date.now();
  return [
    {
      id: 'demo-consult-active-1',
      status: 'active',
      domain: 'family',
      client_message:
        'Need advice on mutual consent divorce timeline and interim maintenance. Documents already prepared.',
      lawyer_id: 'demo-lawyer-family-001',
      lawyer_name: 'Adv. Priya Sharma',
      client_name: 'You',
      mode: 'chat',
      created_at: new Date(now - 2 * 3600_000).toISOString(),
      scheduled_at: null,
      meeting_url: '',
      location: 'Family Court, Mumbai',
      demo: true,
    },
    {
      id: 'demo-consult-pending-1',
      status: 'pending',
      domain: 'criminal',
      client_message: 'FIR registered in a cheating dispute. Seeking anticipatory bail strategy overview.',
      lawyer_id: 'demo-lawyer-criminal-001',
      lawyer_name: 'Adv. Rajesh Kumar',
      client_name: 'You',
      mode: 'video',
      created_at: new Date(now - 26 * 3600_000).toISOString(),
      scheduled_at: new Date(now + 2 * 86400_000).toISOString(),
      meeting_url: '',
      location: '',
      demo: true,
    },
    {
      id: 'demo-consult-pending-2',
      status: 'pending',
      domain: 'property',
      client_message: 'Boundary dispute and partition — want a notice draft before filing suit.',
      lawyer_id: 'demo-lawyer-property-001',
      lawyer_name: 'Adv. Anjali Gupta',
      client_name: 'You',
      mode: 'in_person',
      created_at: new Date(now - 3 * 86400_000).toISOString(),
      scheduled_at: new Date(now + 4 * 86400_000).toISOString(),
      meeting_url: '',
      location: 'City Civil Court complex, Bengaluru',
      demo: true,
    },
    {
      id: 'demo-consult-done-1',
      status: 'completed',
      domain: 'consumer',
      client_message: 'Bank foreclosure charges dispute — complaint strategy completed.',
      lawyer_id: 'demo-lawyer-consumer-001',
      lawyer_name: 'Adv. Meera Kapoor',
      client_name: 'You',
      mode: 'chat',
      created_at: new Date(now - 12 * 86400_000).toISOString(),
      scheduled_at: new Date(now - 10 * 86400_000).toISOString(),
      meeting_url: '',
      location: '',
      demo: true,
    },
  ];
}

/**
 * Client consultations: seed demos once, then append user bookings without wiping seeds.
 */
export function listClientConsultations() {
  if (localStorage.getItem(CONSULT_SEED_FLAG) !== '1') {
    const seed = buildSeedConsultations();
    writeJson(CONSULT_USER_KEY, seed);
    localStorage.setItem(CONSULT_SEED_FLAG, '1');
    return seed;
  }
  const rows = readJson(CONSULT_USER_KEY, []);
  if (!Array.isArray(rows) || rows.length === 0) {
    const seed = buildSeedConsultations();
    writeJson(CONSULT_USER_KEY, seed);
    localStorage.setItem(CONSULT_SEED_FLAG, '1');
    return seed;
  }
  return rows;
}

/** Merge remote API consultations with local demo/user store (remote first, then unique locals). */
export function mergeClientConsultations(apiRows = []) {
  const local = listClientConsultations();
  const byId = new Map();
  local.forEach((r) => byId.set(String(r.id), r));
  (apiRows || []).forEach((r) => {
    if (!r?.id) return;
    byId.set(String(r.id), { ...byId.get(String(r.id)), ...r, demo: false });
  });
  return Array.from(byId.values()).sort((a, b) =>
    String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || ''))
  );
}

export function appendClientConsultation(row) {
  const all = listClientConsultations();
  const record = {
    id: row.id || uid('consult'),
    status: row.status || 'pending',
    domain: row.domain || 'general',
    client_message: row.client_message || row.clientMessage || '',
    lawyer_id: row.lawyer_id || row.lawyerId,
    lawyer_name: row.lawyer_name || row.lawyerName || 'Advocate',
    client_name: row.client_name || 'You',
    mode: row.mode || 'chat',
    created_at: row.created_at || new Date().toISOString(),
    scheduled_at: row.scheduled_at || null,
    meeting_url: row.meeting_url || '',
    location: row.location || '',
    demo: false,
  };
  writeJson(CONSULT_USER_KEY, [record, ...all]);
  return record;
}

export function updateClientConsultationStatus(id, status) {
  const all = listClientConsultations();
  const next = all.map((r) =>
    String(r.id) === String(id) ? { ...r, status, updated_at: new Date().toISOString() } : r
  );
  writeJson(CONSULT_USER_KEY, next);
  return next.find((r) => String(r.id) === String(id));
}

export const DEMO_ACTIVITY = [
  {
    id: 'act-1',
    type: 'AI_SEARCH',
    title: 'Maintenance under HMA — AI brief',
    timestamp: '2 hours ago',
    detail: 'Ran AI Assistant on interim maintenance and evidence checklist.',
  },
  {
    id: 'act-2',
    type: 'CONSULTATION',
    title: 'Chat active with Adv. Priya Sharma',
    timestamp: '5 hours ago',
    detail: 'Family law consultation marked active.',
  },
  {
    id: 'act-3',
    type: 'LAWYER_SAVE',
    title: 'Viewed Adv. Rajesh Kumar',
    timestamp: 'Yesterday',
    detail: 'Opened criminal law profile from Find Lawyers.',
  },
  {
    id: 'act-4',
    type: 'DOCUMENT',
    title: 'Case search: Maneka Gandhi',
    timestamp: '2 days ago',
    detail: 'Saved citation 1978 AIR 597 from Case Search.',
  },
];

/** Stronger citation dedupe for AI panels */
export function dedupeCitations(list = []) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item) continue;
    const title = String(item.title || item.text || item.citation_text || '').trim();
    const excerpt = String(item.excerpt || item.fullText || item.full_text || '').slice(0, 80).trim();
    const key = `${String(item.type || 'src').toLowerCase()}|${title.toLowerCase()}|${excerpt.toLowerCase()}`;
    if (!title && !excerpt) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
