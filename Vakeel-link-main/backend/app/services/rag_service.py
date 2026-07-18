from typing import List, Dict, Any, Optional

from app.services.rag.retrieval_from_qdrant import LegalRetriever
from app.services.rag.qa_engine import LegalQAEngine


class RagService:
    """
    Shared RAG service (lazy singleton).

    Embedding model + Qdrant client load on first use so /health stays fast
    and import-time failures do not kill the whole API process.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RagService, cls).__new__(cls)
            cls._instance._retriever: Optional[LegalRetriever] = None
            cls._instance._qa_engine: Optional[LegalQAEngine] = None
        return cls._instance

    def _ensure_ready(self) -> None:
        if self._retriever is None:
            print("[RAG] Initializing LegalRetriever (embedding model + Qdrant)...")
            self._retriever = LegalRetriever()
        if self._qa_engine is None:
            print("[RAG] Initializing LegalQAEngine...")
            self._qa_engine = LegalQAEngine(retriever=self._retriever)

    @property
    def retriever(self) -> LegalRetriever:
        self._ensure_ready()
        return self._retriever  # type: ignore[return-value]

    @property
    def qa_engine(self) -> LegalQAEngine:
        self._ensure_ready()
        return self._qa_engine  # type: ignore[return-value]

    def retrieve_context(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Quick search without generation (hybrid search path)."""
        return self.retriever.search(query, top_k=top_k, score_threshold=0.45)

    def generate_answer(self, query: str) -> Dict[str, Any]:
        """Full generative QA via the RAG pipeline."""
        return self.qa_engine.ask(query)

    async def run_query(self, query: str) -> Dict[str, Any]:
        """Async wrapper for the RAG pipeline."""
        import asyncio

        return await asyncio.to_thread(self.qa_engine.ask, query)


rag_service = RagService()
