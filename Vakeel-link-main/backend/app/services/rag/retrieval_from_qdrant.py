import logging
import os
import re
from typing import Dict, List, Optional, Tuple

import numpy as np
from numpy.linalg import norm
from sentence_transformers import SentenceTransformer

from app.core.config import settings
from app.services.rag.local_store import LocalLegalStore

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
QDRANT_URL = (settings.QDRANT_URL or "").strip().strip('"').strip("'")
QDRANT_API_KEY = (settings.QDRANT_API_KEY or "").strip().strip('"').strip("'")
MODEL_NAME = settings.EMBEDDING_MODEL_NAME
USE_LOCAL = bool(getattr(settings, "USE_LOCAL_VECTOR_STORE", True))
LOCAL_EMBEDDINGS_DIR = getattr(settings, "LOCAL_EMBEDDINGS_DIR", r"G:\Hackathon\embeddings")
LOCAL_CORPUS_DIR = getattr(settings, "LOCAL_CORPUS_DIR", r"G:\Hackathon\corpus")

# ─────────────────────────────────────────────
# DOMAIN CLASSIFIER (KEYWORD-BASED)
# ─────────────────────────────────────────────
DOMAIN_KEYWORDS = {
    "legal_constitutional": {
        "primary": [
            "article 17", "article 21", "article 14", "article 19", "article 32",
            "fundamental rights", "manual scavenger", "untouchability", "writ petition",
            "puttaswamy", "habeas corpus", "constitution",
        ],
        "secondary": ["dignity", "equality", "constitutional", "supreme court"],
    },
    "legal_criminal": {
        "primary": [
            "bail", "fir", "ipc", "crpc", "bns", "bnss", "murder", "theft", "arrest", "custody",
            "cheque bounce", "section 138", "negotiable instruments", "dishonour",
            "cybercrime", "it act", "section 66", "498a", "cruelty", "dowry", "assault",
        ],
        "secondary": ["offence", "accused", "criminal", "police", "charge sheet"],
    },
    "legal_labour": {
        "primary": [
            "employment", "wages", "minimum wages", "workmen", "labour court", "retrenchment",
            "industrial disputes", "posh act", "sexual harassment", "maternity benefit",
            "wrongful termination", "contractor", "bonus", "gratuity", "pf", "esi",
        ],
        "secondary": ["worker", "employer", "compensation", "labour", "employee"],
    },
    "legal_consumer": {
        "primary": [
            "consumer complaint", "deficiency of service", "ncdrc", "defective product",
            "district forum", "consumer court", "consumer protection",
            "rera", "possession delay", "medical negligence", "flight cancellation", "online refund",
        ],
        "secondary": ["insurance", "refund", "manufacturer", "service provider", "consumer", "product"],
    },
    "legal_motor_accident": {
        "primary": [
            "motor accident", "mact", "hit and run", "vehicle collision",
            "motor vehicle", "accident claim", "motor insurance", "compensation multiplier",
            "loss of income", "road accident",
        ],
        "secondary": ["tribunal", "compensation", "rash driving", "vehicle"],
    },
    "legal_family": {
        "primary": [
            "divorce", "maintenance", "custody", "hindu marriage", "section 13",
            "alimony", "judicial separation", "guardianship", "domestic violence act",
        ],
        "secondary": ["cruelty", "spouse", "marriage", "family", "wife", "husband"],
    },
}

DOMAIN_DESCRIPTIONS = {
    "legal_constitutional": "fundamental rights constitution article writ dignity equality",
    "legal_criminal": "crime bail arrest FIR punishment offence ipc crpc",
    "legal_consumer": "consumer complaint deficiency service product refund",
    "legal_family": "marriage divorce custody maintenance family alimony",
    "legal_labour": "employment wages worker termination labour industrial disputes",
    "legal_motor_accident": "accident vehicle compensation motor MACT insurance",
}

DOMAIN_PRIORITY = [
    "legal_constitutional",
    "legal_criminal",
    "legal_consumer",
    "legal_family",
    "legal_labour",
    "legal_motor_accident",
]


logger = logging.getLogger(__name__)


def cosine_similarity(a, b):
    denominator = norm(a) * norm(b)
    if denominator == 0:
        return 0.0
    return float(np.dot(a, b) / denominator)


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


class LegalRetriever:
    def __init__(self):
        self.model = SentenceTransformer(MODEL_NAME)
        self.client = None
        self._qdrant_ok: Optional[bool] = None
        self.local_store: Optional[LocalLegalStore] = None

        if USE_LOCAL or True:  # always prepare local fallback when data exists
            try:
                store = LocalLegalStore.get(LOCAL_EMBEDDINGS_DIR, LOCAL_CORPUS_DIR)
                if store.available:
                    self.local_store = store
                    print(f"[RETRIEVER] Local store ready at {LOCAL_EMBEDDINGS_DIR}")
                else:
                    print(f"[RETRIEVER] Local store path not found: {LOCAL_EMBEDDINGS_DIR}")
            except Exception as exc:
                print(f"[RETRIEVER] Local store init failed: {exc}")

        if QDRANT_URL and QDRANT_API_KEY and not USE_LOCAL:
            self._init_qdrant()
        elif QDRANT_URL and QDRANT_API_KEY:
            # Lazy: try Qdrant only if local misses later
            pass

    def _init_qdrant(self) -> bool:
        if self.client is not None:
            return True
        try:
            from qdrant_client import QdrantClient

            self.client = QdrantClient(
                url=QDRANT_URL,
                api_key=QDRANT_API_KEY,
                check_compatibility=False,
                timeout=20,
            )
            return True
        except Exception as exc:
            logger.warning("Qdrant client init failed: %s", exc)
            self.client = None
            return False

    def _query_collection(self, collection_name: str, query_vec: np.ndarray, top_k: int):
        """Nearest-neighbor lookup against Qdrant with API compatibility fallback."""
        if not self._init_qdrant() or self.client is None:
            raise RuntimeError("Qdrant client unavailable")

        if hasattr(self.client, "query_points"):
            response = self.client.query_points(
                collection_name=collection_name,
                query=query_vec.tolist(),
                limit=top_k,
                with_payload=True,
            )
            return getattr(response, "points", []) or []

        if hasattr(self.client, "search"):
            return self.client.search(
                collection_name=collection_name,
                query_vector=query_vec.tolist(),
                limit=top_k,
                with_payload=True,
            )

        raise AttributeError("QdrantClient does not support query_points or search")

    def _embed_query(self, query: str) -> np.ndarray:
        embedding = self.model.encode(query, normalize_embeddings=True)
        return np.asarray(embedding, dtype=np.float32)

    def classify_domain(self, query: str) -> Tuple[List[str], float]:
        query_lower = query.lower()
        domain_scores: Dict[str, float] = {}

        for domain, keywords in DOMAIN_KEYWORDS.items():
            score = 0.0
            score += sum(3.0 for kw in keywords["primary"] if kw in query_lower)
            score += sum(1.0 for kw in keywords["secondary"] if kw in query_lower)
            if score > 0:
                domain_scores[domain] = score

        if not domain_scores:
            query_embedding = self._embed_query(query)
            domain_scores = {
                domain: cosine_similarity(query_embedding, self._embed_query(description))
                for domain, description in DOMAIN_DESCRIPTIONS.items()
            }

        sorted_domains = sorted(domain_scores.items(), key=lambda item: item[1], reverse=True)
        best_score = sorted_domains[0][1]
        confidence_score = max(0.0, min(1.0, float(best_score / 9.0)))

        # Always return top-2 domains when close; helps multi-topic queries
        if len(sorted_domains) > 1 and (confidence_score < 0.7 or sorted_domains[1][1] >= sorted_domains[0][1] * 0.6):
            return [sorted_domains[0][0], sorted_domains[1][0]], confidence_score

        return [sorted_domains[0][0]], confidence_score

    def _expand_query(self, query: str, domains: List[str]) -> str:
        """Lightweight domain-aware expansion to improve MiniLM recall."""
        q = query.strip()
        extras: List[str] = []
        ql = q.lower()
        if "legal_consumer" in domains and "consumer protection" not in ql:
            extras.append("Consumer Protection Act 2019 defective goods deficiency of service refund replacement")
        if "legal_criminal" in domains and "fir" in ql:
            extras.append("FIR CrPC investigation police complaint cognizable offence")
        if "legal_family" in domains and any(w in ql for w in ("divorce", "maintenance", "custody")):
            extras.append("Hindu Marriage Act family court maintenance custody")
        if "legal_labour" in domains:
            extras.append("Industrial Disputes Act wages employment labour court")
        if "legal_motor_accident" in domains:
            extras.append("Motor Vehicles Act MACT compensation accident claim")
        if "legal_constitutional" in domains:
            extras.append("Constitution of India fundamental rights writ petition")
        if not extras:
            return q
        return f"{q}. Keywords: {'; '.join(extras)}"

    def _search_local(
        self,
        query: str,
        query_vec: np.ndarray,
        domains: List[str],
        top_k: int,
    ) -> List[Dict]:
        if not self.local_store:
            return []
        # Also search a secondary general domain if present
        search_domains = list(domains)
        if "legal_general" not in search_domains and self.local_store:
            search_domains = search_domains + ["legal_general"]

        # Multi-query: original + expanded embedding for better recall
        expanded = self._expand_query(query, domains)
        expanded_vec = self._embed_query(expanded) if expanded != query else query_vec
        primary = self.local_store.search(query_vec, search_domains, top_k=top_k * 2, query_text=query)
        secondary = (
            self.local_store.search(expanded_vec, search_domains, top_k=top_k * 2, query_text=expanded)
            if expanded != query
            else []
        )

        merged: Dict[tuple, Dict] = {}
        for hit in primary + secondary:
            key = (
                hit.get("source_collection", ""),
                hit.get("case_name", ""),
                (hit.get("chunk_text") or "")[:160],
            )
            prev = merged.get(key)
            if prev is None or float(hit.get("score") or 0) > float(prev.get("score") or 0):
                merged[key] = hit
        ranked = sorted(merged.values(), key=lambda x: float(x.get("score") or 0), reverse=True)
        return ranked[:top_k]

    def _hit_key(self, hit: Dict) -> tuple:
        return (
            _as_text(hit.get("source_collection", "")),
            _as_text(hit.get("case_name", "")),
            _as_text(hit.get("section_number", "")),
            _as_text(hit.get("chunk_text", ""))[:200],
        )

    def _merge_hits(self, *lists: List[Dict]) -> List[Dict]:
        merged: Dict[tuple, Dict] = {}
        for group in lists:
            for hit in group or []:
                key = self._hit_key(hit)
                prev = merged.get(key)
                if prev is None or float(hit.get("score") or 0) > float(prev.get("score") or 0):
                    merged[key] = hit
        return sorted(merged.values(), key=lambda x: float(x.get("score") or 0), reverse=True)

    def _boost_score(self, query: str, payload: dict, base_score: float, chunk_raw: str) -> float:
        score = float(base_score or 0.0)
        ql = query.lower()
        chunk_lower = (chunk_raw or "").lower()
        citations = re.findall(
            r"article\s+\d+|section\s+\d+|crpc\s+\d+|ipc\s+\d+|bns\s+\d+|s\.?\s*\d+",
            ql,
        )
        if citations:
            score += sum(0.12 for c in citations if c.replace(" ", "") in chunk_lower.replace(" ", "") or c in chunk_lower)

        section_number = _as_text(payload.get("section_number") or payload.get("sections", "")).lower()
        act_name = _as_text(payload.get("act_name") or payload.get("acts", "")).lower()
        case_name = _as_text(payload.get("case_name") or payload.get("law_name") or "").lower()
        if section_number:
            score += 0.04
            if any(tok in section_number for tok in re.findall(r"\d+", ql)[:4]):
                score += 0.08
        if act_name:
            score += 0.03
            for phrase in ("ipc", "crpc", "hindu marriage", "consumer protection", "motor vehicle", "constitution"):
                if phrase in ql and phrase in act_name:
                    score += 0.06
        if case_name and any(w in case_name for w in ql.split() if len(w) > 4):
            score += 0.03

        # Light token overlap on title fields
        tokens = [t for t in re.findall(r"[a-z0-9]+", ql) if len(t) > 3][:12]
        hay = f"{section_number} {act_name} {case_name} {chunk_lower[:400]}"
        if tokens:
            hits = sum(1 for t in tokens if t in hay)
            score += min(0.12, hits * 0.015)
        return score

    def _points_to_hits(self, coll: str, search_result, query: str) -> List[Dict]:
        hits: List[Dict] = []
        for res in search_result:
            payload = res.payload or {}
            chunk_raw = _as_text(
                payload.get("chunk_text") or payload.get("text") or payload.get("content") or ""
            )
            if not chunk_raw:
                continue
            score = self._boost_score(query, payload, float(res.score or 0.0), chunk_raw)
            section_number = _as_text(payload.get("section_number") or payload.get("sections", ""))
            act_name = _as_text(payload.get("act_name") or payload.get("acts", ""))
            case_name = _as_text(payload.get("case_name") or payload.get("law_name") or "")
            law_name = _as_text(
                payload.get("law_name") or payload.get("case_name") or payload.get("source") or ""
            )
            hits.append(
                {
                    "chunk_text": chunk_raw,
                    "score": score,
                    "domain": coll,
                    "source_collection": coll,
                    "subdomain": payload.get("subdomain", ""),
                    "law_name": law_name,
                    "legal_issue": payload.get("legal_issue", ""),
                    "section_number": section_number,
                    "act_name": act_name,
                    "case_name": case_name,
                    "sections": _as_text(payload.get("sections", "")),
                    "acts": _as_text(payload.get("acts", "")),
                    "source": _as_text(
                        payload.get("source") or payload.get("law_name") or payload.get("case_name") or ""
                    ),
                }
            )
        return hits

    def _search_qdrant(
        self,
        query: str,
        query_vec: np.ndarray,
        domains: List[str],
        top_k: int,
        expanded_vec: Optional[np.ndarray] = None,
    ) -> Tuple[List[Dict], List[str]]:
        all_results: List[Dict] = []
        errors: List[str] = []

        for coll in domains:
            try:
                search_result = self._query_collection(coll, query_vec, top_k)
                print(f"[QDRANT] collection={coll} results={len(search_result)}")
                all_results.extend(self._points_to_hits(coll, search_result, query))

                # Multi-query expansion pass (parity with local store)
                if expanded_vec is not None and expanded_vec is not query_vec:
                    exp_result = self._query_collection(coll, expanded_vec, max(3, top_k // 2))
                    all_results.extend(self._points_to_hits(coll, exp_result, query))
            except Exception as e:
                error_message = f"Qdrant search failed for {coll}: {e}"
                logger.warning(error_message)
                errors.append(error_message)
                self._qdrant_ok = False

        return all_results, errors

    def _needs_broaden(self, results: List[Dict], min_hits: int, score_floor: float) -> bool:
        if not results:
            return True
        if len(results) < min_hits:
            return True
        max_score = max(float(r.get("score") or 0.0) for r in results)
        return max_score < score_floor

    def search_with_meta(self, query: str, top_k: int = 6):
        print(f"\n[QUERY] {query}")
        min_hits = int(getattr(settings, "RAG_MIN_HITS", 3) or 3)
        score_floor = float(getattr(settings, "RAG_SCORE_FLOOR", 0.35) or 0.35)
        do_broaden = bool(getattr(settings, "RAG_BROADEN", True))
        blend_local = bool(getattr(settings, "RAG_BLEND_LOCAL", True))
        top_k = int(top_k or getattr(settings, "RAG_TOP_K", 6) or 6)

        try:
            target_collections, confidence_score = self.classify_domain(query)
            print(f"[DOMAINS] {target_collections}")

            query_vec = self._embed_query(query)
            expanded = self._expand_query(query, target_collections)
            expanded_vec = self._embed_query(expanded) if expanded != query else None
            print(f"[EMBED] vector_shape={tuple(query_vec.shape)} expanded={expanded != query}")

            citations = re.findall(r"article \d+|section \d+|crpc \d+|ipc \d+|bns \d+", query.lower())
            if citations:
                print(f"[CITATIONS DETECTED] {citations}")

            all_results: List[Dict] = []
            collection_errors: List[str] = []
            backend_used = "none"
            notices: List[str] = []

            # 1) Prefer Qdrant Cloud when configured and local-first is disabled
            if QDRANT_URL and QDRANT_API_KEY and not USE_LOCAL:
                q_hits, q_errors = self._search_qdrant(
                    query, query_vec, target_collections, top_k=top_k, expanded_vec=expanded_vec
                )
                collection_errors.extend(q_errors)
                if q_hits:
                    all_results = q_hits
                    backend_used = "qdrant"
                    print(f"[QDRANT] hits={len(q_hits)}")

            # 2) Local store (primary when USE_LOCAL=true, or fallback / blend)
            if self.local_store and (not all_results or (blend_local and self._needs_broaden(all_results, min_hits, score_floor))):
                local_hits = self._search_local(query, query_vec, target_collections, top_k=top_k)
                if local_hits:
                    if not all_results:
                        all_results = local_hits
                        backend_used = "local" if USE_LOCAL else "local-fallback"
                    else:
                        all_results = self._merge_hits(all_results, local_hits)
                        backend_used = "blend"
                        notices.append("Blended Qdrant + local corpus hits for better coverage.")
                    print(f"[{backend_used.upper()}] hits={len(all_results)}")

            # 3) If local-first mode still empty, try Qdrant once
            if not all_results and USE_LOCAL and QDRANT_URL and QDRANT_API_KEY:
                q_hits, q_errors = self._search_qdrant(
                    query, query_vec, target_collections, top_k=top_k, expanded_vec=expanded_vec
                )
                collection_errors.extend(q_errors)
                if q_hits:
                    all_results = q_hits
                    backend_used = "qdrant-fallback"
                    print(f"[QDRANT-FALLBACK] hits={len(q_hits)}")

            # 4) Broaden across all domains when weak / empty
            if do_broaden and self._needs_broaden(all_results, min_hits, score_floor):
                all_domains = list(DOMAIN_KEYWORDS.keys()) + ["legal_general"]
                extra_domains = [d for d in all_domains if d not in set(target_collections)]
                print(f"[BROADEN] domains={extra_domains[:6]}…")

                if QDRANT_URL and QDRANT_API_KEY:
                    q_hits, q_errors = self._search_qdrant(
                        query, query_vec, extra_domains, top_k=max(3, top_k // 2), expanded_vec=expanded_vec
                    )
                    collection_errors.extend(q_errors)
                    if q_hits:
                        all_results = self._merge_hits(all_results, q_hits)
                        if backend_used in {"none", "local", "local-fallback"}:
                            backend_used = "qdrant-broad" if backend_used == "none" else f"{backend_used}+qdrant-broad"
                        else:
                            backend_used = f"{backend_used}+broad"
                        notices.append("Broadened search across additional legal domains.")

                if self.local_store:
                    local_hits = self._search_local(query, query_vec, all_domains, top_k=top_k)
                    if local_hits:
                        all_results = self._merge_hits(all_results, local_hits)
                        if backend_used == "none":
                            backend_used = "local-broad"
                        elif "broad" not in backend_used:
                            backend_used = f"{backend_used}+local-broad"
                        notices.append("Local multi-domain search used to fill weak matches.")

            if not all_results:
                return {
                    "domain_candidates": target_collections,
                    "confidence_score": confidence_score,
                    "query_vector": query_vec.tolist(),
                    "results": [],
                    "retrieval_status": "degraded",
                    "retrieval_notice": (
                        "No vector matches found (local store empty and Qdrant unavailable or empty). "
                        "Answers may lack citations."
                    ),
                    "collection_errors": collection_errors,
                    "retrieval_backend": backend_used,
                    "max_score": 0.0,
                }

        except Exception as exc:
            logger.warning("Falling back from retrieval failure: %s", exc)
            return {
                "domain_candidates": ["unknown"],
                "confidence_score": 0.0,
                "query_vector": [],
                "results": [],
                "retrieval_status": "degraded",
                "retrieval_notice": "Retrieval failed before vector search completed.",
                "collection_errors": [str(exc)],
                "retrieval_backend": "error",
                "max_score": 0.0,
            }

        # Dedupe + diversity (MMR-lite)
        ranked = self._merge_hits(all_results)
        # Soft score floor: keep at least min_hits if available, else drop weak tails
        strong = [r for r in ranked if float(r.get("score") or 0) >= score_floor]
        if len(strong) >= min_hits:
            ranked = strong
        elif strong:
            # keep strong + a few weaker fillers
            weak = [r for r in ranked if r not in strong]
            ranked = strong + weak[: max(0, min_hits - len(strong))]

        diverse = self.apply_mmr(ranked, top_k=top_k)
        if len(diverse) < min(top_k, len(ranked)):
            # fill remaining slots by score without re-adding dups
            seen = {self._hit_key(r) for r in diverse}
            for r in ranked:
                if self._hit_key(r) in seen:
                    continue
                diverse.append(r)
                seen.add(self._hit_key(r))
                if len(diverse) >= top_k:
                    break

        final = diverse[:top_k]
        max_score = max((float(r.get("score") or 0) for r in final), default=0.0)

        notice = " ".join(dict.fromkeys(notices)) or None
        status = "ok"
        if max_score < score_floor or len(final) < min_hits:
            status = "degraded"
            weak_note = (
                f"Retrieval quality is limited (hits={len(final)}, max_score={max_score:.3f}). "
                "Treat guidance as provisional and verify statutes."
            )
            notice = f"{notice} {weak_note}".strip() if notice else weak_note
        elif backend_used.startswith("local"):
            notice = notice or f"Retrieved from local legal corpus ({backend_used})."

        print(f"[RETRIEVAL] backend={backend_used} results={len(final)} max_score={max_score:.3f}")

        return {
            "domain_candidates": target_collections,
            "confidence_score": confidence_score,
            "query_vector": query_vec.tolist(),
            "results": final,
            "retrieval_status": status,
            "retrieval_notice": notice,
            "retrieval_backend": backend_used,
            "max_score": max_score,
        }

    def search(self, query: str, top_k: int = 5, score_threshold: float = 0.35):
        meta = self.search_with_meta(query, top_k=top_k)
        results = meta.get("results") or []
        floor = float(score_threshold if score_threshold is not None else getattr(settings, "RAG_SCORE_FLOOR", 0.35))
        filtered = [r for r in results if float(r.get("score") or 0) >= floor]
        return filtered or results

    def apply_mmr(self, results: List[Dict], top_k: int, lambda_param: float = 0.5):
        """Diversity-aware selection so top_k is not near-duplicates of one case."""
        _ = lambda_param
        if not results:
            return []

        selected = []
        seen_cases = set()

        for res in results:
            case = (
                res.get("case_name")
                or res.get("law_name")
                or res.get("section_number")
                or (res.get("chunk_text") or "")[:80]
            )
            case_key = str(case).strip().lower()
            if case_key and case_key in seen_cases:
                continue
            if case_key:
                seen_cases.add(case_key)
            selected.append(res)
            if len(selected) >= top_k:
                break

        # If diversity filter was too aggressive, pad with remaining by score
        if len(selected) < min(top_k, len(results)):
            for res in results:
                if res in selected:
                    continue
                selected.append(res)
                if len(selected) >= top_k:
                    break

        return selected


if __name__ == "__main__":
    retriever = LegalRetriever()

    test_queries = [
        "rights of manual scavengers",
        "how to file a FIR for assault?",
        "compensation for motor accident",
        "divorce procedure in India",
        "What are the rights of a consumer if a product is defective?",
    ]

    for q in test_queries:
        results = retriever.search(q, top_k=3)
        print(f"Results for: {q}")
        for i, res in enumerate(results):
            print(f"  {i+1}. [Score: {res['score']:.4f}] Case: {res['law_name']}")
            print(f"     Domain: {res['domain']} | Subdomain: {res.get('subdomain')}")
            text_preview = res["chunk_text"][:200].replace("\n", " ") + "..."
            print(f"     Text: {text_preview}\n")
