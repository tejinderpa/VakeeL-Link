/**
 * Shared legal AI client for RAG + LLM (via backend).
 * Tries the same endpoint order as AIAssistant so lawyer tools keep working
 * even if the server mounts the router under slightly different prefixes.
 */

import { API_BASE_URL, authHeaders } from './api';

const AI_ENDPOINTS = ['/api/v1/query/ask', '/api/v1/query', '/api/query/ask', '/api/query'];

/** Soft budget per matter so multi-case prompts stay usable for the model. */
const DEFAULT_MAX_CHARS_PER_CASE = 4200;
const HARD_MAX_CHARS_PER_CASE = 7000;

function extractErrorDetail(body, statusText) {
  if (!body) return statusText || 'Request failed';
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
  }
  if (typeof body.message === 'string') return body.message;
  return statusText || 'Request failed';
}

/**
 * Call the backend legal query pipeline.
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<object>} QueryResponse-like payload
 */
export async function askLegalAi(query, opts = {}) {
  const text = String(query || '').trim();
  if (!text) {
    throw new Error('Query cannot be empty');
  }

  let lastError = null;

  for (const path of AI_ENDPOINTS) {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ query: text }),
        signal: opts.signal,
      });

      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok) {
        // 404 → try next mount path; other errors stop the chain
        if (res.status === 404) {
          lastError = new Error(extractErrorDetail(body, res.statusText));
          continue;
        }
        throw new Error(extractErrorDetail(body, res.statusText));
      }

      return normalizeAiResponse(body);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastError = err;
      // Network failure → try next endpoint
      if (String(err?.message || '').toLowerCase().includes('failed to fetch')) {
        continue;
      }
      // Non-404 HTTP errors already thrown above
      if (err instanceof Error && !String(err.message).includes('Not Found')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Legal research service is unavailable right now. Please try again shortly.');
}

export function normalizeAiResponse(data = {}) {
  const analysis = String(data.analysis || data.answer || data.summary || data.response || '').trim();
  const citedCases = Array.isArray(data.cited_cases)
    ? data.cited_cases
    : Array.isArray(data.citations)
      ? data.citations
          .map((c) =>
            typeof c === 'string' ? c : c.citation_text || c.title || c.case_name || ''
          )
          .filter(Boolean)
      : [];

  return {
    ...data,
    analysis,
    answer: String(data.answer || analysis).trim(),
    summary: String(data.summary || analysis).trim(),
    domain: data.domain || 'general',
    cited_cases: citedCases,
    cited_sections: Array.isArray(data.cited_sections) ? data.cited_sections : [],
    cited_acts: Array.isArray(data.cited_acts) ? data.cited_acts : [],
    citations: Array.isArray(data.citations) ? data.citations : [],
    llm_provider: data.llm_provider || null,
    retrieval_backend: data.retrieval_backend || null,
    confidence_score: Number(data.confidence_score || 0),
    disclaimer:
      data.disclaimer ||
      'This is AI-assisted legal research for advocate use — not a substitute for independent professional judgment.',
  };
}

/** Lines that usually carry legal substance (keep these when condensing). */
const LEGAL_SIGNAL =
  /\b(section|sec\.|s\.|article|ipc|crpc|cpc|hma|hmga|ni act|negotiable|fir|bail|maintenance|custody|partition|injunction|limitation|jurisdiction|tribunal|court|order|notice|rs\.?|₹|lakh|crore|evidence|affidavit|petition|appeal|settlement|divorce|termination|gratuity|wages|cheque|defamation)\b/i;

/**
 * Collapse whitespace while keeping paragraph breaks.
 */
function normalizeFactsText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Intelligently condense a long fact narrative so large matters still
 * contribute usable context instead of being cut mid-sentence.
 */
export function condenseLongText(text, maxChars = DEFAULT_MAX_CHARS_PER_CASE) {
  const full = normalizeFactsText(text);
  if (!full) return '';
  if (full.length <= maxChars) return full;

  const paragraphs = full.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const lines = full.split('\n').map((l) => l.trim()).filter(Boolean);

  const headBudget = Math.floor(maxChars * 0.42);
  const tailBudget = Math.floor(maxChars * 0.22);
  const midBudget = maxChars - headBudget - tailBudget - 80;

  // Lead: first paragraphs until budget
  let head = '';
  for (const p of paragraphs) {
    const next = head ? `${head}\n\n${p}` : p;
    if (next.length > headBudget) break;
    head = next;
  }
  if (!head) head = full.slice(0, headBudget);

  // Middle: keep lines with legal / money / date signals
  const signalLines = lines.filter((l) => LEGAL_SIGNAL.test(l) || /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(l));
  let mid = '';
  for (const l of signalLines) {
    if (head.includes(l)) continue;
    const next = mid ? `${mid}\n• ${l}` : `• ${l}`;
    if (next.length > midBudget) break;
    mid = next;
  }

  // Tail: last paragraph(s)
  let tail = '';
  for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
    const p = paragraphs[i];
    if (head.includes(p) || (mid && mid.includes(p))) continue;
    const next = tail ? `${p}\n\n${tail}` : p;
    if (next.length > tailBudget) break;
    tail = next;
  }
  if (!tail) tail = full.slice(-Math.min(tailBudget, full.length));

  const omitted = full.length - head.length - (mid ? mid.length : 0) - tail.length;
  const note =
    omitted > 200
      ? `\n\n[Context condensed for length — about ${Math.round(omitted / 100) * 100} characters of narrative trimmed; key lead facts, legal signals, and closing retained.]`
      : '';

  return [head, mid ? `Key points retained:\n${mid}` : '', tail ? `Closing / latest posture:\n${tail}` : '']
    .filter(Boolean)
    .join('\n\n')
    .slice(0, maxChars + note.length) + note;
}

/**
 * Build a structured context pack for one matter (library file, consultation, or RAG hit).
 * Large cases are condensed so the comparison model still receives substance.
 *
 * @param {object} matter
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ title: string, category: string, status: string, clientName: string, source: string, facts: string, condensed: boolean, originalLength: number }}
 */
export function gatherMatterContext(matter = {}, opts = {}) {
  const maxChars = Math.min(
    Math.max(Number(opts.maxChars) || DEFAULT_MAX_CHARS_PER_CASE, 800),
    HARD_MAX_CHARS_PER_CASE
  );

  const title = String(matter.title || matter.clientName || 'Untitled matter').trim();
  const clientName = String(matter.clientName || matter.client || '').trim();
  const category = String(matter.category || matter.caseType || 'General').trim();
  const status = String(matter.status || 'n/a').trim();
  const source = String(matter.source || 'file').trim();

  const rawParts = [
    matter.facts,
    matter.summary,
    matter.message,
    matter.clientMessage,
    matter.notes,
    matter.description,
  ]
    .map((p) => normalizeFactsText(p))
    .filter(Boolean);

  // De-dupe near-identical blobs
  const unique = [];
  const seen = new Set();
  for (const part of rawParts) {
    const key = part.slice(0, 160).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  const merged = unique.join('\n\n') || 'No written facts recorded for this matter yet.';
  const originalLength = merged.length;
  const condensed = originalLength > maxChars;
  const facts = condensed ? condenseLongText(merged, maxChars) : merged;

  return {
    title,
    clientName: clientName || title,
    category,
    status,
    source,
    caseType: matter.caseType || null,
    facts,
    condensed,
    originalLength,
    id: matter.id,
  };
}

/**
 * Prepare several matters for comparison (balanced budgets when many are large).
 */
export function gatherComparisonContexts(cases = [], opts = {}) {
  const list = Array.isArray(cases) ? cases.filter(Boolean) : [];
  if (!list.length) return [];

  // Share budget across matters so 3–4 large files still fit
  const perCase =
    list.length >= 4
      ? 2800
      : list.length === 3
        ? 3400
        : DEFAULT_MAX_CHARS_PER_CASE;

  return list.map((c) => gatherMatterContext(c, { maxChars: opts.maxChars || perCase }));
}

/**
 * Build a structured comparison prompt from two or more matters + optional focus.
 * Always runs context gathering so large matters contribute usable substance.
 */
export function buildComparisonPrompt({ cases = [], focus = '', mode = 'full' } = {}) {
  const prepared = gatherComparisonContexts(cases);

  const blocks = prepared.map((c, i) => {
    const label = `MATTER ${i + 1}`;
    const sizeNote =
      c.condensed && c.originalLength
        ? ` (large file — ${c.originalLength.toLocaleString()} chars gathered & condensed for analysis)`
        : '';
    return [
      `${label}${sizeNote}`,
      `Title: ${c.title}`,
      c.clientName && c.clientName !== c.title ? `Client: ${c.clientName}` : null,
      `Category / issue type: ${c.category}`,
      `Status: ${c.status}`,
      `Source: ${c.source}`,
      `Facts / issues / pleadings material:`,
      c.facts,
    ]
      .filter(Boolean)
      .join('\n');
  });

  const focusLine = focus.trim()
    ? `Advocate focus for this comparison: ${focus.trim()}`
    : 'Advocate focus: identify the strongest arguments, material risks, evidence gaps, and practical next steps.';

  if (mode === 'search') {
    return [
      'You are an Indian legal research assistant for practising advocates.',
      'Find or reconstruct relevant precedents / statutory angles for the following research query.',
      focusLine,
      '',
      focus || blocks.join('\n\n'),
      '',
      'Return a clear analysis under Indian law. Prefer statutes, sections, and leading cases.',
      'List cited cases and sections when possible. Do not invent holdings.',
    ].join('\n');
  }

  const largeNote = prepared.some((c) => c.condensed)
    ? [
        'Note on large matters: some fact narratives were condensed before this prompt.',
        'Work only from the context provided. If a detail is missing after condensation, state the gap briefly and still answer using what remains — do not invent facts.',
        '',
      ].join('\n')
    : '';

  return [
    'You are a senior Indian litigation counsel preparing a PROFESSIONAL CASE COMPARISON MEMO for a practising advocate.',
    'Compare the matters carefully. Ground every point in the provided context or well-known Indian statutory framework.',
    'Do NOT invent court holdings, party admissions, or documents that are not supported by the materials below.',
    '',
    focusLine,
    '',
    largeNote,
    '════════ MATTERS ON THE BENCH ════════',
    blocks.join('\n\n────────\n\n'),
    '',
    'Structure your answer EXACTLY with these headings (use the labels as shown):',
    '',
    'Facts:',
    '- Neutral synthesis of each matter (short bullets, label Matter 1 / Matter 2…)',
    '- Call out overlapping vs distinct factual themes',
    '',
    'Issues:',
    '- Legal issues / questions of law that are common',
    '- Issues unique to each matter',
    '',
    'Analysis:',
    '- Side-by-side comparison: similarities and differences',
    '- Applicable statutes / sections under Indian law',
    '- Precedents only if well-known or clearly implied by the materials',
    '- Evidentiary strengths and weaknesses',
    '- Forum / jurisdiction notes where relevant',
    '',
    'Conclusion:',
    '- Recommended strategy (settlement vs contested posture where apt)',
    '- Concrete next steps and document checklist for the advocate',
    '',
    'Write in clear professional English suitable for an advocate brief. Prefer practical guidance over theory.',
    'If context for a matter is thin, say so under Facts and still produce the best comparative analysis possible from what you have.',
  ].join('\n');
}

/**
 * Build a follow-up prompt that re-attaches gathered matter context + prior memo.
 */
export function buildComparisonFollowUpPrompt({
  cases = [],
  priorMemo = '',
  question = '',
} = {}) {
  const prepared = gatherComparisonContexts(cases);
  const matterBrief = prepared
    .map(
      (c, i) =>
        `${i + 1}. ${c.title} (${c.category}) — ${condenseLongText(c.facts, 900)}`
    )
    .join('\n\n');

  return [
    'You are continuing a professional Indian legal case comparison memo for an advocate.',
    'Use the prior memo and the matter context below. Do not invent facts.',
    '',
    'SELECTED MATTERS (gathered context):',
    matterBrief || '(none)',
    '',
    'PRIOR MEMO:',
    condenseLongText(priorMemo, 6000) || '(empty)',
    '',
    `Advocate question: ${String(question || '').trim()}`,
    '',
    'Answer precisely. Prefer statutes/sections where relevant. If the memo or context is insufficient, say what is missing and give the best answer from what remains.',
  ].join('\n');
}

/** Split AI memo into Facts / Issues / Analysis / Conclusion when present. */
export function parseComparisonMemo(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (!/(Facts|Issues|Analysis|Conclusion)\s*:/i.test(raw)) {
    return { analysis: raw };
  }

  const sections = { facts: '', issues: '', analysis: '', conclusion: '' };
  const parts = raw.split(/(?=(?:^|\n)\s*#*\s*(?:Facts|Issues|Analysis|Conclusion)\s*:?\s*)/i);

  parts.forEach((part) => {
    const m = part.match(/^\s*#*\s*(Facts|Issues|Analysis|Conclusion)\s*:?\s*([\s\S]*)$/i);
    if (!m) return;
    const key = m[1].toLowerCase();
    const body = (m[2] || '').trim();
    if (key in sections) sections[key] = body;
  });

  if (!sections.facts && !sections.issues && !sections.analysis && !sections.conclusion) {
    return { analysis: raw };
  }
  return sections;
}
