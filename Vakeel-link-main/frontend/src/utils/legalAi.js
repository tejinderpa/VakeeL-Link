/**
 * Shared legal AI client for RAG + LLM (Groq / Gemini via backend).
 * Tries the same endpoint order as AIAssistant so lawyer tools keep working
 * even if the server mounts the router under slightly different prefixes.
 */

import { API_BASE_URL, authHeaders } from './api';

const AI_ENDPOINTS = ['/api/v1/query/ask', '/api/v1/query', '/api/query/ask', '/api/query'];

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

  throw lastError || new Error('AI service unavailable. Check backend and GROQ/Gemini keys.');
}

export function normalizeAiResponse(data = {}) {
  const analysis = String(data.analysis || data.answer || data.summary || data.response || '').trim();
  const citedCases = Array.isArray(data.cited_cases)
    ? data.cited_cases
    : Array.isArray(data.citations)
      ? data.citations.map((c) =>
          typeof c === 'string' ? c : c.citation_text || c.title || c.case_name || ''
        ).filter(Boolean)
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
      'This is AI-generated legal research assistance, not a substitute for professional advice.',
  };
}

/**
 * Build a structured comparison prompt from two or more matters + optional focus.
 */
export function buildComparisonPrompt({ cases = [], focus = '', mode = 'full' } = {}) {
  const blocks = (cases || []).map((c, i) => {
    const label = `CASE ${i + 1}`;
    return [
      `${label}`,
      `Title: ${c.title || c.clientName || 'Untitled'}`,
      `Category / issue type: ${c.category || c.caseType || 'General'}`,
      `Status: ${c.status || 'n/a'}`,
      `Facts / issues:`,
      String(c.facts || c.summary || c.message || 'No facts recorded.').trim(),
    ].join('\n');
  });

  const focusLine = focus.trim()
    ? `Advocate focus for this comparison: ${focus.trim()}`
    : 'Advocate focus: identify the strongest arguments, risks, and procedural next steps.';

  if (mode === 'search') {
    return [
      'You are an Indian legal research assistant for practising advocates.',
      'Find or reconstruct relevant precedents / statutory angles for the following research query.',
      focusLine,
      '',
      focus || blocks.join('\n\n'),
      '',
      'Return a clear analysis under Indian law. Prefer statutes, sections, and leading cases.',
      'List cited_cases and cited_sections when possible.',
    ].join('\n');
  }

  return [
    'You are a senior Indian litigation counsel preparing a PROFESSIONAL CASE COMPARISON MEMO.',
    'Compare the matters below carefully. Do NOT invent court holdings that are not supported by the facts given or by well-known Indian statutory framework.',
    '',
    focusLine,
    '',
    blocks.join('\n\n---\n\n'),
    '',
    'Structure your answer EXACTLY with these headings:',
    'Facts:',
    '(neutral synthesis of each matter in short bullets)',
    '',
    'Issues:',
    '(legal issues / questions of law common and distinct)',
    '',
    'Analysis:',
    '(side-by-side comparison: similarities, differences, applicable statutes/sections, precedents if known, evidentiary strengths/weaknesses, forum/jurisdiction notes)',
    '',
    'Conclusion:',
    '(recommended strategy, settlement vs litigation posture, and concrete next steps for the advocate)',
    '',
    'Be precise, professional, and practical. Use plain professional English suitable for an advocate\'s brief.',
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
