"""
Smoke test for retrieval + optional generation.

Run from repo root or backend/:
  cd backend
  python scripts/smoke_rag.py
  python scripts/smoke_rag.py --ask   # also call LLM once (slower)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow `python scripts/smoke_rag.py` from backend/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


QUERIES = [
    "How do I file an FIR for assault?",
    "Consumer rights if product is defective and seller refuses refund",
    "How to claim maintenance after desertion under Hindu law?",
    "Motor accident compensation claim MACT process",
    "Right to life and personal liberty Article 21",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ask", action="store_true", help="Also run full QA on first query")
    args = parser.parse_args()

    from app.core.config import settings
    from app.services.rag.retrieval_from_qdrant import LegalRetriever

    print("=== RAG smoke ===")
    print(f"USE_LOCAL_VECTOR_STORE={settings.USE_LOCAL_VECTOR_STORE}")
    print(f"QDRANT_URL set={bool(settings.QDRANT_URL)}")
    print(f"LOCAL_EMBEDDINGS_DIR={settings.LOCAL_EMBEDDINGS_DIR}")
    print(f"RAG_MIN_HITS={settings.RAG_MIN_HITS} SCORE_FLOOR={settings.RAG_SCORE_FLOOR}")
    print()

    retriever = LegalRetriever()
    ok = 0
    for q in QUERIES:
        meta = retriever.search_with_meta(q, top_k=settings.RAG_TOP_K)
        results = meta.get("results") or []
        backend = meta.get("retrieval_backend")
        status = meta.get("retrieval_status")
        max_score = meta.get("max_score") or 0
        print(f"Q: {q}")
        print(f"  backend={backend} status={status} hits={len(results)} max_score={float(max_score):.3f}")
        if results:
            top = results[0]
            title = top.get("case_name") or top.get("law_name") or top.get("act_name") or "chunk"
            print(f"  top: [{float(top.get('score') or 0):.3f}] {title}")
            print(f"  domain={top.get('source_collection')} section={top.get('section_number')}")
            ok += 1
        else:
            print("  NO HITS")
        print()

    print(f"Retrieval with hits: {ok}/{len(QUERIES)}")

    if args.ask:
        from app.services.rag.qa_engine import LegalQAEngine

        engine = LegalQAEngine(retriever=retriever)
        ans = engine.ask(QUERIES[0])
        cites = ans.get("citations") or []
        print("=== Full ask sample ===")
        print(f"domain={ans.get('domain')} llm={ans.get('llm_provider')} backend={ans.get('retrieval_backend')}")
        print(f"citations={len(cites)} status={ans.get('retrieval_status')}")
        print((ans.get("analysis") or "")[:800])
        if cites:
            print("first citation:", cites[0].get("title") or cites[0].get("text"))

    return 0 if ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
