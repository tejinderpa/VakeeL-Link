import asyncio
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.dependencies import get_optional_current_user
from app.services.rag_service import rag_service
from app.core.supabase_client import supabase
from app.core.limiter import limiter

router = APIRouter()

# --- Pydantic Models ---
class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)

class LawyerRecommendation(BaseModel):
    id: str
    name: str
    specialization: List[str]
    rating: float
    is_online: bool
    avatar: Optional[str] = None

class QueryResponse(BaseModel):
    domain: str
    analysis: str
    summary: Optional[str] = None
    answer: Optional[str] = None
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    cited_sections: List[str]
    cited_cases: List[str]
    cited_acts: List[str]
    disclaimer: str
    confidence_score: float
    recommended_lawyers: List[LawyerRecommendation]
    retrieval_status: Optional[str] = "ok"
    retrieval_notice: Optional[str] = None
    llm_provider: Optional[str] = None
    retrieval_backend: Optional[str] = None
    used_chunk_ids: Optional[List[str]] = None
    max_score: Optional[float] = None


DOMAIN_LAWYER_TERMS: Dict[str, List[str]] = {
    "legal_constitutional": ["constitutional", "article", "writ", "fundamental rights", "supreme court"],
    "legal_criminal": ["criminal", "bail", "fir", "ipc", "crpc", "cybercrime"],
    "legal_consumer": ["consumer", "refund", "ncdrc", "service", "rera"],
    "legal_family": ["family", "divorce", "custody", "maintenance", "marriage", "alimony"],
    "legal_labour": ["labour", "employment", "wages", "workman", "industrial"],
    "legal_motor_accident": ["motor", "accident", "mact", "vehicle", "compensation"],
}


def _normalize_string_list(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = re.split(r"[,/|]", value)
    else:
        items = [value]

    normalized: List[str] = []
    for item in items:
        text = str(item).strip()
        if text and text not in normalized:
            normalized.append(text)
    return normalized


def _lawyer_matches_domain(lawyer: Dict[str, Any], domain: str) -> bool:
    terms = DOMAIN_LAWYER_TERMS.get(domain, [])
    haystack = " ".join(
        str(part or "")
        for part in [
            lawyer.get("name"),
            lawyer.get("specialization"),
            lawyer.get("areas_of_practice"),
            lawyer.get("bio"),
            lawyer.get("location"),
        ]
    ).lower()
    return any(term in haystack for term in terms)


def _build_recommendations(client, domain: str) -> List[LawyerRecommendation]:
    if domain in {"unknown", "error", "general"}:
        return []

    try:
        response = (
            client.table("lawyers")
            .select("id, name, specialization, areas_of_practice, rating, is_online, avatar, bio, location")
            .eq("is_verified", True)
            .order("rating", desc=True)
            .limit(25)
            .execute()
        )
    except Exception as exc:
        print(f"Failed to fetch recommended lawyers: {exc}")
        return []

    lawyers = response.data or []
    domain_lawyers = [lawyer for lawyer in lawyers if _lawyer_matches_domain(lawyer, domain)]
    if not domain_lawyers:
        domain_lawyers = lawyers

    recommendations: List[LawyerRecommendation] = []
    for lawyer in domain_lawyers[:3]:
        recommendations.append(
            LawyerRecommendation(
                id=str(lawyer.get("id")),
                name=lawyer.get("name") or "Unknown Lawyer",
                specialization=_normalize_string_list(lawyer.get("areas_of_practice") or lawyer.get("specialization")),
                rating=float(lawyer.get("rating") or 0.0),
                is_online=bool(lawyer.get("is_online", False)),
                avatar=lawyer.get("avatar"),
            )
        )

    return recommendations


def _resolve_source_collection(citation_text: str, retrieved_chunks: List[Dict[str, Any]], citation_type: str) -> str:
    needle = citation_text.lower().strip()
    for chunk in retrieved_chunks:
        haystack = " ".join(
            str(chunk.get(key) or "")
            for key in ["section_number", "act_name", "case_name", "source", "law_name", "sections", "acts", "chunk_text"]
        ).lower()
        if needle and needle in haystack:
            return str(chunk.get("source_collection") or chunk.get("domain") or "unknown")
    if retrieved_chunks:
        return str(retrieved_chunks[0].get("source_collection") or retrieved_chunks[0].get("domain") or "unknown")
    return "unknown"


def _resolve_relevance_score(citation_text: str, retrieved_chunks: List[Dict[str, Any]]) -> float:
    needle = citation_text.lower().strip()
    for chunk in retrieved_chunks:
        haystack = " ".join(
            str(chunk.get(key) or "")
            for key in ["section_number", "act_name", "case_name", "source", "law_name", "sections", "acts", "chunk_text"]
        ).lower()
        if needle and needle in haystack:
            return float(chunk.get("score") or 0.0)
    return 0.0


def _build_ai_citation_rows(query_id: str, response_data: Dict[str, Any], retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen = set()

    for citation_type, citation_values in (
        ("section", response_data.get("cited_sections", [])),
        ("case", response_data.get("cited_cases", [])),
        ("act", response_data.get("cited_acts", [])),
    ):
        for citation_text in citation_values or []:
            normalized = str(citation_text).strip()
            if not normalized:
                continue
            dedupe_key = (citation_type, normalized)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            rows.append(
                {
                    "query_id": query_id,
                    "citation_type": citation_type,
                    "citation_text": normalized,
                    "source_collection": _resolve_source_collection(normalized, retrieved_chunks, citation_type),
                    "relevance_score": _resolve_relevance_score(normalized, retrieved_chunks),
                }
            )

    return rows

@router.post("/query/ask", response_model=QueryResponse)
@router.post("/query", response_model=QueryResponse)
@router.post("/ai/query", response_model=QueryResponse)
@router.post("/ai/query/ask", response_model=QueryResponse)
@limiter.limit("10/minute")
async def ask_ai(request: Request, query_request: QueryRequest, user = Depends(get_optional_current_user)):
    print(f"DEBUG: ask_ai called with query: {query_request.query}")
    try:
        result = await asyncio.to_thread(rag_service.qa_engine.ask, query_request.query)
    except ConnectionError:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=503, detail="Vector store unavailable. Please try again shortly.")
    except Exception as exc:
        import traceback
        traceback.print_exc()
        message = str(exc)
        lower = message.lower()
        if any(
            token in lower
            for token in (
                "invalid api key",
                "invalid_api_key",
                "permission_denied",
                "permission denied",
                "consumer_suspended",
                "unauthorized",
            )
        ):
            raise HTTPException(
                status_code=503,
                detail=(
                    "AI provider authentication failed. Update GROQ_API_KEY "
                    "(and optional GOOGLE_API_KEY) in backend/.env, then restart the server."
                ),
            )
        if any(token in lower for token in ("429", "rate limit", "quota", "resource_exhausted", "too many requests")):
            raise HTTPException(
                status_code=429,
                detail="AI provider rate limit reached. Please wait about a minute and try again.",
            )
        raise HTTPException(status_code=500, detail=message or "Failed to generate legal analysis")

    domain_identified = str(result.get("domain", "unknown"))
    analysis = str(result.get("analysis", "")).strip()
    cited_sections = _normalize_string_list(result.get("cited_sections"))
    cited_cases = _normalize_string_list(result.get("cited_cases"))
    cited_acts = _normalize_string_list(result.get("cited_acts"))
    disclaimer = str(result.get("disclaimer") or "This is AI-generated legal guidance, not legal advice. Please consult a verified lawyer.")
    confidence_score = float(result.get("confidence_score", 0.0))
    citations = result.get("citations") or []
    if not isinstance(citations, list):
        citations = []

    client = supabase.get_admin_client()
    recommended_lawyers = _build_recommendations(client, domain_identified)
    recommended_lawyers_payload = [lawyer.model_dump() for lawyer in recommended_lawyers]

    # Always prefer chunk-grounded citations from the engine
    if not citations and result.get("retrieved_chunks"):
        try:
            citations = rag_service.qa_engine._build_citations_from_chunks(
                result.get("retrieved_chunks") or []
            )
        except Exception:
            citations = []

    response_data = {
        "domain": domain_identified,
        "analysis": analysis,
        "summary": str(result.get("summary") or analysis),
        "answer": str(result.get("answer") or analysis),
        "citations": citations,
        "cited_sections": cited_sections,
        "cited_cases": cited_cases,
        "cited_acts": cited_acts,
        "disclaimer": disclaimer,
        "confidence_score": confidence_score,
        "recommended_lawyers": recommended_lawyers_payload,
        "retrieval_status": str(result.get("retrieval_status") or "ok"),
        "retrieval_notice": result.get("retrieval_notice"),
        "llm_provider": result.get("llm_provider"),
        "retrieval_backend": result.get("retrieval_backend"),
        "used_chunk_ids": result.get("used_chunk_ids") or [],
        "max_score": result.get("max_score"),
    }

    if user:
        try:
            history_result = client.table("query_history").insert({
                "user_id": user.id,
                "query": query_request.query,
                "answer": response_data,
                "domain": domain_identified,
            }).execute()
            history_id = history_result.data[0]["id"] if history_result.data else None

            if history_id:
                citation_rows = _build_ai_citation_rows(history_id, response_data, result.get("retrieved_chunks", []))
                if citation_rows:
                    client.table("ai_citations").insert(citation_rows).execute()
        except Exception as e:
            print(f"Failed to save query_history: {e}")

    return QueryResponse(**response_data)
