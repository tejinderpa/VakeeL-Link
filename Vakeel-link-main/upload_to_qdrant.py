"""
Upload local MiniLM embeddings + corpus chunks into Qdrant Cloud.

Usage (from Vakeel-link-main):
  python upload_to_qdrant.py

Reads credentials from env / backend/.env, or the defaults below.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent
load_dotenv(_ROOT / "backend" / ".env", override=True)
load_dotenv(_ROOT / ".env", override=True)

# New cluster (override via env anytime)
QDRANT_URL = (
    os.getenv("QDRANT_URL")
    or "https://48a389dd-b3cb-4c72-931f-9d78359ee1a2.sa-east-1-0.aws.cloud.qdrant.io:6333"
).strip().strip('"').strip("'")
if QDRANT_URL and not QDRANT_URL.rstrip("/").endswith(":6333") and "cloud.qdrant.io" in QDRANT_URL:
    QDRANT_URL = QDRANT_URL.rstrip("/") + ":6333"

QDRANT_API_KEY = (
    os.getenv("QDRANT_API_KEY")
    or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6ZDdjNTcxNmItMTEyMC00NTZhLThhMTgtOGI3YTcyYTVhN2NkIn0.bhr47DdnEe0aiG2qOFDOIqhgDd-ewprAATiIt4r3VAw"
).strip().strip('"').strip("'")

EMBEDDINGS_DIR = Path(os.getenv("LOCAL_EMBEDDINGS_DIR") or r"G:\Hackathon\embeddings")
CORPUS_DIR = Path(os.getenv("LOCAL_CORPUS_DIR") or r"G:\Hackathon\corpus")
VECTOR_SIZE = 384  # all-MiniLM-L6-v2
BATCH_SIZE = 64

DOMAIN_MAP = {
    "legal_criminal": ["criminal_"],
    "legal_constitutional": ["constitutional_"],
    "legal_consumer": ["consumer_"],
    "legal_family": ["family_"],
    "legal_labour": ["labour_"],
    "legal_motor_accident": ["motor_accident_"],
    "legal_general": ["general_"],
}

# embeddings_*.npy → corpus relative path (best-effort; missing maps fall back to metadata only)
CORPUS_FILE_MAP = {
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
    "embeddings_family_family_maintenance_alimony.npy": "family/maintenance.jsonl",
    "embeddings_family_family_mutual_consent_divorce.npy": "family/divorce.jsonl",
    "embeddings_family_maintenance.npy": "family/maintenance.jsonl",
    "embeddings_general_unclassified.npy": "general/unclassified.jsonl",
    "embeddings_general_unclassified2.npy": "general/unclassified2.jsonl",
    "embeddings_labour_labour_industrial_disputes.npy": "labour/wrongful_termination.jsonl",
    "embeddings_labour_labour_posh_maternity.npy": "labour/wrongful_termination.jsonl",
    "embeddings_labour_wrongful_termination.npy": "labour/wrongful_termination.jsonl",
    "embeddings_motor_accident_compensation.npy": "motor_accident/compensation.jsonl",
    "embeddings_motor_accident_motor_accident_mact.npy": "motor_accident/compensation.jsonl",
}


def get_deterministic_uuid(source_file: str, index: int) -> str:
    unique_str = f"{source_file}_{index}"
    return hashlib.md5(unique_str.encode()).hexdigest()


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(x).strip() for x in value if str(x).strip())
    return str(value).strip()


def safe_upsert(client: QdrantClient, collection_name: str, points, retries: int = 4) -> None:
    for i in range(retries):
        try:
            client.upsert(collection_name=collection_name, points=points)
            return
        except Exception as exc:
            if i == retries - 1:
                raise
            wait = 2 ** i
            print(f"  [RETRY] upsert failed ({exc}); sleep {wait}s...")
            time.sleep(wait)


def resolve_corpus_path(npy_file: str) -> Path | None:
    rel = CORPUS_FILE_MAP.get(npy_file)
    if rel:
        path = CORPUS_DIR / rel
        if path.exists():
            return path
    # heuristic: embeddings_domain_name.npy → domain/name.jsonl
    stem = npy_file.replace("embeddings_", "").replace(".npy", "")
    parts = stem.split("_", 1)
    if len(parts) == 2:
        candidate = CORPUS_DIR / parts[0] / f"{parts[1]}.jsonl"
        if candidate.exists():
            return candidate
    return None


def load_corpus_texts(npy_file: str, expected: int) -> list[str]:
    texts = [""] * expected
    path = resolve_corpus_path(npy_file)
    if not path:
        return texts
    loaded: list[str] = []
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
    for i in range(min(expected, len(loaded))):
        texts[i] = loaded[i]
    return texts


def upload_domain_collection(client: QdrantClient, collection_name: str, patterns: list[str]) -> int:
    print(f"\n[UPLOAD] Domain: {collection_name}")

    exists = False
    try:
        exists = client.collection_exists(collection_name)
    except Exception:
        # older clients
        try:
            names = {c.name for c in client.get_collections().collections}
            exists = collection_name in names
        except Exception:
            exists = False

    if not exists:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        print(f"  [CREATE] collection {collection_name}")
    else:
        print(f"  [EXISTS] collection {collection_name} (upsert will overwrite same ids)")

    npy_files = sorted(
        f
        for f in os.listdir(EMBEDDINGS_DIR)
        if f.startswith("embeddings_") and f.endswith(".npy") and any(p in f for p in patterns)
    )
    if not npy_files:
        print(f"  [WARN] no npy files for patterns {patterns}")
        return 0

    total_points = 0
    for npy_file in npy_files:
        meta_file = npy_file.replace("embeddings_", "metadata_").replace(".npy", ".json")
        meta_path = EMBEDDINGS_DIR / meta_file
        npy_path = EMBEDDINGS_DIR / npy_file
        if not meta_path.exists():
            print(f"  [SKIP] missing metadata {meta_file}")
            continue

        print(f"  [+] {npy_file} ...")
        embeddings = np.load(npy_path).astype(np.float32)
        with open(meta_path, "r", encoding="utf-8") as fh:
            metadata_list = json.load(fh)

        count = min(len(embeddings), len(metadata_list))
        corpus_texts = load_corpus_texts(npy_file, count)

        points = []
        for i in range(count):
            meta = metadata_list[i] if isinstance(metadata_list[i], dict) else {}
            chunk_text = corpus_texts[i] or _as_text(meta.get("legal_issue") or meta.get("case_name") or "")

            if "scavenger" in chunk_text.lower() and meta.get("legal_issue") == "unknown":
                meta = dict(meta)
                meta["legal_issue"] = "Rights and rehabilitation of manual scavengers"
                meta["subdomain"] = "manual_scavenging"

            case_name = _as_text(meta.get("case_name") or meta.get("law_name") or "")
            sections = _as_text(meta.get("sections") or meta.get("section_number") or "")
            acts = _as_text(meta.get("acts") or meta.get("act_name") or "")

            payload = {
                "chunk_text": chunk_text,
                "source_file": npy_file,
                "domain": collection_name,
                "source_collection": collection_name,
                "chunk_id": i,
                "law_name": case_name,
                "case_name": case_name,
                "subdomain": _as_text(meta.get("subdomain") or ""),
                "sections": sections,
                "section_number": sections,
                "acts": acts,
                "act_name": acts,
                "legal_issue": _as_text(meta.get("legal_issue") or ""),
                "year": meta.get("year", ""),
                "court": _as_text(meta.get("court") or ""),
                "source": _as_text(meta.get("source") or case_name or collection_name),
            }

            points.append(
                PointStruct(
                    id=get_deterministic_uuid(npy_file, i),
                    vector=embeddings[i].tolist(),
                    payload=payload,
                )
            )

            if len(points) >= BATCH_SIZE:
                safe_upsert(client, collection_name, points)
                points = []

        if points:
            safe_upsert(client, collection_name, points)

        total_points += count
        print(f"  [OK] {npy_file} → {count} points")

    # Report live count
    try:
        info = client.get_collection(collection_name)
        live = getattr(getattr(info, "points_count", None), "__int__", lambda: info.points_count)()
        if not isinstance(live, int):
            live = info.points_count
        print(f"[DONE] {collection_name}: uploaded≈{total_points}, collection_points={live}")
    except Exception:
        print(f"[DONE] {collection_name}: uploaded≈{total_points}")

    return total_points


def main() -> int:
    print("=" * 60)
    print("Qdrant re-upload")
    print("=" * 60)
    print(f"URL:  {QDRANT_URL}")
    print(f"KEY:  {QDRANT_API_KEY[:20]}...{QDRANT_API_KEY[-6:]}")
    print(f"EMB:  {EMBEDDINGS_DIR}")
    print(f"CORP: {CORPUS_DIR}")

    if not EMBEDDINGS_DIR.is_dir():
        print(f"ERROR: embeddings dir not found: {EMBEDDINGS_DIR}")
        return 1

    client = QdrantClient(
        url=QDRANT_URL,
        api_key=QDRANT_API_KEY,
        check_compatibility=False,
        timeout=120,
    )
    # connectivity check
    cols = client.get_collections()
    print(f"[OK] connected. existing collections: {[c.name for c in cols.collections]}")

    grand = 0
    for domain, patterns in DOMAIN_MAP.items():
        grand += upload_domain_collection(client, domain, patterns)

    print("\n" + "=" * 60)
    print(f"ALL DONE — total points uploaded (approx): {grand}")
    final = client.get_collections()
    for c in final.collections:
        try:
            info = client.get_collection(c.name)
            print(f"  • {c.name}: {info.points_count} points")
        except Exception as exc:
            print(f"  • {c.name}: (count error {exc})")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
