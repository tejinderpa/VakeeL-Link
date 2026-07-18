"""
Local vector store fallback for when Qdrant Cloud is unavailable.

Loads precomputed MiniLM embeddings (.npy) + metadata + corpus JSONL from disk
(originally built under G:\\Hackathon\\embeddings and G:\\Hackathon\\corpus).
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from numpy.linalg import norm

logger = logging.getLogger(__name__)

# Domain → filename stem prefixes (matches upload_to_qdrant.py)
DOMAIN_FILE_PREFIXES: Dict[str, List[str]] = {
    "legal_constitutional": ["constitutional_"],
    "legal_criminal": ["criminal_"],
    "legal_consumer": ["consumer_"],
    "legal_family": ["family_"],
    "legal_labour": ["labour_"],
    "legal_motor_accident": ["motor_accident_"],
    "legal_general": ["general_"],
}

# embeddings_*.npy → corpus relative path
CORPUS_FILE_MAP: Dict[str, str] = {
    "embeddings_constitutional_constitutional.npy": "constitutional/constitutional.jsonl",
    "embeddings_constitutional_illegal_detention.npy": "constitutional/illegal_detention.jsonl",
    "embeddings_consumer_consumer.npy": "consumer/consumer.jsonl",
    "embeddings_consumer_consumer_ecommerce_airlines.npy": "consumer/consumer.jsonl",
    "embeddings_consumer_consumer_medical_negligence.npy": "consumer/consumer.jsonl",
    "embeddings_consumer_consumer_rera_builder.npy": "consumer/consumer.jsonl",
    "embeddings_consumer_online_fraud.npy": "consumer/online_fraud.jsonl",
    "embeddings_consumer_service_deficiency.npy": "consumer/service_deficiency.jsonl",
    "embeddings_criminal_FIR_procedure.npy": "criminal/FIR_procedure.jsonl",
    "embeddings_criminal_assault_violence.npy": "criminal/assault_violence.jsonl",
    "embeddings_criminal_bail_general.npy": "criminal/bail_general.jsonl",
    "embeddings_criminal_criminal.npy": "criminal/criminal.jsonl",
    "embeddings_criminal_criminal_498a_dowry.npy": "criminal/criminal.jsonl",
    "embeddings_criminal_criminal_anticipatory_bail.npy": "criminal/bail_general.jsonl",
    "embeddings_criminal_criminal_cheque_bounce.npy": "criminal/fraud_cheating.jsonl",
    "embeddings_criminal_criminal_cybercrime.npy": "criminal/criminal.jsonl",
    "embeddings_criminal_domestic_violence.npy": "criminal/domestic_violence.jsonl",
    "embeddings_criminal_drug_offenses.npy": "criminal/drug_offenses.jsonl",
    "embeddings_criminal_fraud_cheating.npy": "criminal/fraud_cheating.jsonl",
    "embeddings_family_child_custody.npy": "family/child_custody.jsonl",
    "embeddings_family_divorce.npy": "family/divorce.jsonl",
    "embeddings_family_family.npy": "family/family.jsonl",
    "embeddings_family_maintenance.npy": "family/maintenance.jsonl",
    "embeddings_general_unclassified.npy": "general/unclassified.jsonl",
    "embeddings_general_unclassified2.npy": "general/unclassified2.jsonl",
    "embeddings_labour_wrongful_termination.npy": "labour/wrongful_termination.jsonl",
    "embeddings_motor_accident_compensation.npy": "motor_accident/compensation.jsonl",
}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _normalize_rows(matrix: np.ndarray) -> np.ndarray:
    norms = norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return (matrix / norms).astype(np.float32)


class LocalLegalStore:
    """In-memory cosine search over local .npy embeddings."""

    _instance: Optional["LocalLegalStore"] = None

    def __init__(self, embeddings_dir: str, corpus_dir: str):
        self.embeddings_dir = Path(embeddings_dir)
        self.corpus_dir = Path(corpus_dir)
        # domain -> {vectors: NxD, records: list[dict]}
        self._domains: Dict[str, Dict[str, Any]] = {}
        self._loaded = False

    @classmethod
    def get(cls, embeddings_dir: Optional[str] = None, corpus_dir: Optional[str] = None) -> "LocalLegalStore":
        if cls._instance is None:
            emb = embeddings_dir or os.getenv("LOCAL_EMBEDDINGS_DIR", r"G:\Hackathon\embeddings")
            corp = corpus_dir or os.getenv("LOCAL_CORPUS_DIR", r"G:\Hackathon\corpus")
            cls._instance = cls(emb, corp)
        return cls._instance

    @property
    def available(self) -> bool:
        return self.embeddings_dir.is_dir() and any(self.embeddings_dir.glob("embeddings_*.npy"))

    def ensure_loaded(self, domains: Optional[List[str]] = None) -> None:
        if self._loaded and not domains:
            return
        target_domains = domains or list(DOMAIN_FILE_PREFIXES.keys())
        for domain in target_domains:
            if domain not in self._domains:
                self._load_domain(domain)
        if not domains:
            self._loaded = True

    def _load_domain(self, domain: str) -> None:
        prefixes = DOMAIN_FILE_PREFIXES.get(domain, [])
        if not prefixes or not self.embeddings_dir.is_dir():
            self._domains[domain] = {"vectors": np.zeros((0, 384), dtype=np.float32), "records": []}
            return

        vectors: List[np.ndarray] = []
        records: List[Dict[str, Any]] = []

        npy_files = sorted(
            f
            for f in os.listdir(self.embeddings_dir)
            if f.startswith("embeddings_") and f.endswith(".npy") and any(p in f for p in prefixes)
        )

        for npy_file in npy_files:
            npy_path = self.embeddings_dir / npy_file
            meta_file = npy_file.replace("embeddings_", "metadata_").replace(".npy", ".json")
            meta_path = self.embeddings_dir / meta_file
            if not meta_path.exists():
                logger.warning("Missing metadata for %s", npy_file)
                continue

            try:
                emb = np.load(npy_path).astype(np.float32)
            except Exception as exc:
                logger.warning("Failed to load %s: %s", npy_file, exc)
                continue

            try:
                with open(meta_path, "r", encoding="utf-8") as fh:
                    metadata_list = json.load(fh)
            except Exception as exc:
                logger.warning("Failed to load metadata %s: %s", meta_file, exc)
                continue

            corpus_texts = self._load_corpus_texts(npy_file, len(metadata_list))

            count = min(len(emb), len(metadata_list))
            for i in range(count):
                meta = metadata_list[i] if isinstance(metadata_list[i], dict) else {}
                chunk_text = corpus_texts[i] if i < len(corpus_texts) else ""
                if not chunk_text:
                    chunk_text = _as_text(meta.get("legal_issue") or meta.get("case_name") or "")

                sections = _as_text(meta.get("sections") or meta.get("section_number") or "")
                acts = _as_text(meta.get("acts") or meta.get("act_name") or "")
                case_name = _as_text(meta.get("case_name") or meta.get("law_name") or "")
                law_name = case_name or _as_text(meta.get("law_name") or "")

                records.append(
                    {
                        "chunk_text": chunk_text,
                        "domain": domain,
                        "source_collection": domain,
                        "subdomain": _as_text(meta.get("subdomain") or ""),
                        "law_name": law_name,
                        "legal_issue": _as_text(meta.get("legal_issue") or ""),
                        "section_number": sections,
                        "act_name": acts,
                        "case_name": case_name,
                        "sections": sections,
                        "acts": acts,
                        "source": _as_text(meta.get("source") or law_name or case_name or domain),
                        "year": meta.get("year", ""),
                        "court": _as_text(meta.get("court") or ""),
                        "source_file": npy_file,
                    }
                )
                vectors.append(emb[i])

            logger.info("[LOCAL] loaded %s → %s rows for %s", npy_file, count, domain)

        if vectors:
            mat = _normalize_rows(np.vstack(vectors))
        else:
            mat = np.zeros((0, 384), dtype=np.float32)

        self._domains[domain] = {"vectors": mat, "records": records}
        print(f"[LOCAL] domain={domain} vectors={len(records)}")

    def _load_corpus_texts(self, npy_file: str, expected: int) -> List[str]:
        rel = CORPUS_FILE_MAP.get(npy_file)
        texts: List[str] = [""] * expected
        if not rel:
            # Heuristic: embeddings_domain_name.npy → domain/name.jsonl
            stem = npy_file.replace("embeddings_", "").replace(".npy", "")
            parts = stem.split("_", 1)
            if len(parts) == 2:
                candidate = self.corpus_dir / parts[0] / f"{parts[1]}.jsonl"
                if candidate.exists():
                    rel = f"{parts[0]}/{parts[1]}.jsonl"
        if not rel:
            return texts

        path = self.corpus_dir / rel
        if not path.exists():
            return texts

        loaded: List[str] = []
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    loaded.append(_as_text(obj.get("chunk_text") or obj.get("text") or obj.get("content") or ""))
        except Exception as exc:
            logger.warning("Failed reading corpus %s: %s", path, exc)
            return texts

        for i in range(min(expected, len(loaded))):
            texts[i] = loaded[i]
        return texts

    def search(
        self,
        query_vec: np.ndarray,
        domains: List[str],
        top_k: int = 6,
        query_text: str = "",
    ) -> List[Dict[str, Any]]:
        self.ensure_loaded(domains)
        q = np.asarray(query_vec, dtype=np.float32).reshape(-1)
        qn = float(norm(q))
        if qn == 0:
            return []
        q = q / qn

        q_lower = (query_text or "").lower()
        citation_hits = re.findall(r"article\s+\d+|section\s+\d+|crpc\s+\d+|ipc\s+\d+|bns\s+\d+", q_lower)

        # High-value legal phrases get a stronger re-rank boost when present in chunk/issue
        phrase_boosts = [
            p
            for p in (
                "consumer protection",
                "deficiency of service",
                "defective product",
                "product liability",
                "district commission",
                "state commission",
                "ncdrc",
                "refund",
                "anticipatory bail",
                "regular bail",
                "fir",
                "section 498a",
                "maintenance",
                "divorce",
                "child custody",
                "motor accident",
                "mact",
                "minimum wages",
                "wrongful termination",
                "manual scaveng",
                "article 21",
                "article 17",
            )
            if p in q_lower
        ]

        stop = {
            "what", "when", "where", "which", "this", "that", "with", "from", "have", "under",
            "india", "indian", "about", "please", "rights", "right", "does", "will", "into",
            "there", "their", "them", "your", "you", "are", "the", "and", "for", "how",
        }
        tokens = [t for t in re.findall(r"[a-z0-9]{4,}", q_lower) if t not in stop]

        scored: List[Tuple[float, Dict[str, Any]]] = []
        for domain in domains:
            pack = self._domains.get(domain)
            if not pack or pack["vectors"].shape[0] == 0:
                continue
            mat: np.ndarray = pack["vectors"]
            sims = mat @ q  # cosine since both normalized
            # take a pool larger than top_k for re-rank
            pool = min(max(top_k * 8, 24), mat.shape[0])
            idx = np.argpartition(-sims, pool - 1)[:pool]
            for i in idx:
                score = float(sims[i])
                rec = dict(pack["records"][int(i)])
                chunk_lower = (rec.get("chunk_text") or "").lower()
                issue_lower = (rec.get("legal_issue") or "").lower()
                acts_lower = (rec.get("acts") or rec.get("act_name") or "").lower()
                hay = f"{chunk_lower} {issue_lower} {acts_lower}"

                if citation_hits:
                    score += sum(0.12 for c in citation_hits if c in hay)
                if phrase_boosts:
                    score += sum(0.08 for p in phrase_boosts if p in hay)
                if tokens:
                    hits = sum(1 for t in tokens if t in hay)
                    score += min(0.2, hits * 0.025)
                # Prefer chunks that actually carry statute metadata
                if rec.get("sections") or rec.get("acts"):
                    score += 0.03

                rec["score"] = score
                scored.append((score, rec))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Deduplicate near-identical chunks
        seen = set()
        results: List[Dict[str, Any]] = []
        for score, rec in scored:
            key = (
                rec.get("source_collection", ""),
                rec.get("case_name", ""),
                rec.get("section_number", ""),
                (rec.get("chunk_text") or "")[:180],
            )
            if key in seen:
                continue
            seen.add(key)
            results.append(rec)
            if len(results) >= top_k:
                break
        return results
