/**
 * Case-to-case similarity scoring + durable comparison cache.
 * Used by lawyer Case Comparisons so matches follow the current (anchor) matter
 * and memo results can be reused later without re-running the AI.
 */

const COMPARE_CACHE_KEY = 'vakeellink_comparison_cache_v1';
const MAX_CACHE_ENTRIES = 40;

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'is', 'are',
  'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'as', 'at', 'from',
  'into', 'about', 'under', 'over', 'not', 'no', 'any', 'all', 'has', 'have', 'had', 'will',
  'would', 'shall', 'should', 'may', 'might', 'can', 'could', 'client', 'case', 'matter',
  'law', 'legal', 'india', 'indian', 'court', 'advocate', 'party', 'parties',
]);

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

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s₹]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function matterBlob(m = {}) {
  return [
    m.title,
    m.clientName,
    m.category,
    m.caseType,
    m.forum,
    m.court,
    m.opposingParty,
    m.peopleInvolved,
    m.parties,
    m.reliefSought,
    m.facts,
    m.summary,
    m.message,
    m.notes,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Score similarity between two matters (0–100).
 * Category/type match boosts; token Jaccard on facts drives the rest.
 */
export function scoreMatterSimilarity(a, b) {
  if (!a || !b) return 0;
  if (String(a.id) === String(b.id)) return 100;

  let score = 0;

  const catA = String(a.category || a.caseType || '').toLowerCase();
  const catB = String(b.category || b.caseType || '').toLowerCase();
  if (catA && catB) {
    if (catA === catB) score += 28;
    else if (catA.includes(catB) || catB.includes(catA)) score += 16;
    else {
      const typeA = String(a.caseType || '').toLowerCase();
      const typeB = String(b.caseType || '').toLowerCase();
      if (typeA && typeB && typeA === typeB) score += 22;
    }
  }

  const tokensA = new Set(tokenize(matterBlob(a)));
  const tokensB = new Set(tokenize(matterBlob(b)));
  if (tokensA.size && tokensB.size) {
    let inter = 0;
    tokensA.forEach((t) => {
      if (tokensB.has(t)) inter += 1;
    });
    const union = tokensA.size + tokensB.size - inter;
    const jaccard = union > 0 ? inter / union : 0;
    score += Math.round(jaccard * 62);
  }

  // Shared proper-ish tokens (capitalized words / names) light boost via raw overlap
  const namesA = String(a.clientName || a.title || '').toLowerCase();
  const namesB = String(b.clientName || b.title || '').toLowerCase();
  if (namesA && namesB && namesA !== namesB) {
    const na = namesA.split(/\s+/).filter((w) => w.length > 3);
    if (na.some((w) => namesB.includes(w))) score += 6;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Rank pool by similarity to anchor (current case).
 * @returns {Array<{ matter: object, similarity: number }>}
 */
export function rankSimilarMatters(anchor, pool = [], { minScore = 12, limit = 12 } = {}) {
  if (!anchor) return [];
  return (pool || [])
    .filter((m) => m && String(m.id) !== String(anchor.id))
    .map((matter) => ({
      matter,
      similarity: scoreMatterSimilarity(anchor, matter),
    }))
    .filter((row) => row.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Stable cache key from selected matter ids + focus. */
export function comparisonCacheKey(matterIds = [], focus = '') {
  const ids = [...matterIds].map(String).sort().join('|');
  const f = String(focus || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  return `${ids}::${f}`;
}

function listCacheRaw() {
  const rows = readJson(COMPARE_CACHE_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

/**
 * @returns {{ key, matterIds, focus, rawMemo, memo, meta, createdAt } | null}
 */
export function getCachedComparison(matterIds, focus = '') {
  const key = comparisonCacheKey(matterIds, focus);
  const hit = listCacheRaw().find((r) => r.key === key);
  return hit || null;
}

export function setCachedComparison({
  matterIds = [],
  focus = '',
  rawMemo = '',
  memo = null,
  meta = null,
  selectedTitles = [],
} = {}) {
  const key = comparisonCacheKey(matterIds, focus);
  const entry = {
    key,
    matterIds: [...matterIds].map(String),
    focus: String(focus || ''),
    rawMemo,
    memo,
    meta,
    selectedTitles,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...listCacheRaw().filter((r) => r.key !== key)].slice(0, MAX_CACHE_ENTRIES);
  writeJson(COMPARE_CACHE_KEY, next);
  return entry;
}

export function listCachedComparisons() {
  return listCacheRaw().sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

export function clearComparisonCache() {
  writeJson(COMPARE_CACHE_KEY, []);
}
