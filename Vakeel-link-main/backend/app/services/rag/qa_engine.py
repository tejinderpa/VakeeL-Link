import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from groq import Groq

from app.core.config import settings
from .retrieval_from_qdrant import LegalRetriever

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
GROQ_MODELS = [
    "llama-3.1-8b-instant",      # prefer free-tier friendly model first
    "llama-3.3-70b-versatile",
]
GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]
DISCLAIMER = (
    "This is AI-generated legal guidance, not legal advice. "
    "Please consult a verified lawyer before taking any legal action."
)

RATE_LIMIT_MARKERS = (
    "429",
    "rate_limit",
    "rate limit",
    "too many requests",
    "quota",
    "resource_exhausted",
    "resource exhausted",
    "tokens per day",
    "tpm",
    "rpm",
)

AUTH_ERROR_MARKERS = (
    "401",
    "403",
    "invalid api key",
    "invalid_api_key",
    "permission_denied",
    "permission denied",
    "unauthorized",
    "consumer_suspended",
    "api key not valid",
    "incorrect api key",
)


def _is_rate_limited(exc: Exception) -> bool:
    msg = str(exc).lower()
    if _is_auth_error(exc):
        return False
    return any(marker in msg for marker in RATE_LIMIT_MARKERS)


def _is_auth_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in AUTH_ERROR_MARKERS)


class LegalQAEngine:
    def __init__(self, retriever=None):
        self.retriever = retriever or LegalRetriever()
        groq_key = (settings.GROQ_API_KEY or "").strip().strip('"').strip("'")
        gemini_key = (
            (getattr(settings, "GOOGLE_API_KEY", None) or getattr(settings, "GEMINI_API_KEY", None) or "")
            .strip()
            .strip('"')
            .strip("'")
        )
        self.client = Groq(api_key=groq_key) if groq_key else None
        self._gemini_client = None
        if gemini_key:
            try:
                from google import genai

                self._gemini_client = genai.Client(api_key=gemini_key)
            except Exception as exc:
                print(f"[AI] Gemini client unavailable: {exc}")
        print(
            f"[AI] Providers ready: groq={'yes' if self.client else 'no'} "
            f"gemini={'yes' if self._gemini_client else 'no'}"
        )

    # ── helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _merge_unique(primary: Optional[List[Any]], fallback: Optional[List[Any]] = None) -> List[str]:
        ordered: List[str] = []
        for value in (primary or []) + (fallback or []):
            text = str(value).strip()
            if text and text not in ordered:
                ordered.append(text)
        return ordered

    @staticmethod
    def _clean_json_payload(raw_content: str) -> str:
        content = (raw_content or "").strip()
        if not content:
            return content

        # Strip markdown fences
        if content.startswith("```"):
            after_open = content[3:]
            if after_open.lstrip().lower().startswith("json"):
                after_open = after_open.lstrip()[4:]
            last_backtick = after_open.rfind("```")
            content = (after_open[:last_backtick] if last_backtick != -1 else after_open).strip()

        # If model returned prose + JSON, extract the outermost object
        if not content.startswith("{"):
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                content = content[start : end + 1]
        return content.strip()

    @staticmethod
    def _split_list_field(value: Any) -> List[str]:
        if not value:
            return []
        if isinstance(value, list):
            items = value
        else:
            items = re.split(r"[,;/|]", str(value))
        out: List[str] = []
        for item in items:
            text = str(item).strip()
            if text and text.lower() not in {"n/a", "none", "null", "-"} and text not in out:
                out.append(text)
        return out

    @classmethod
    def _coerce_prose(cls, value: Any, *, depth: int = 0) -> str:
        """
        Normalize LLM fields that arrive as strings, lists, or nested dicts
        into advocate-readable prose (never Python/JSON dump).
        """
        if value is None:
            return ""
        if depth > 6:
            return str(value).strip()

        if isinstance(value, bool):
            return "Yes" if value else "No"
        if isinstance(value, (int, float)):
            return str(value)

        if isinstance(value, list):
            lines: List[str] = []
            for item in value:
                text = cls._coerce_prose(item, depth=depth + 1).strip()
                if not text:
                    continue
                if "\n" in text:
                    lines.append(f"• {text}")
                elif not re.match(r"^[\d•\-\*]+[\).\s]", text):
                    lines.append(f"• {text}")
                else:
                    lines.append(text)
            return "\n".join(lines)

        if isinstance(value, dict):
            blocks: List[str] = []
            for raw_key, raw_val in value.items():
                key = str(raw_key or "").strip()
                # Human labels: matter_1 → Matter 1, common → Common issues
                label = re.sub(r"[_\-]+", " ", key).strip()
                label = re.sub(r"\bmatter\s*(\d+)\b", r"Matter \1", label, flags=re.I)
                label = label[:1].upper() + label[1:] if label else "Note"
                body = cls._coerce_prose(raw_val, depth=depth + 1).strip()
                if not body:
                    continue
                if "\n" in body:
                    blocks.append(f"{label}:\n{body}")
                else:
                    blocks.append(f"{label}: {body}")
            return "\n\n".join(blocks)

        text = str(value).strip()
        if not text:
            return ""

        # Stringified JSON / Python-ish dict dumped by the model
        if (text.startswith("{") and text.endswith("}")) or (
            text.startswith("[") and text.endswith("]")
        ):
            try:
                import ast

                parsed = None
                try:
                    parsed = json.loads(text)
                except Exception:
                    try:
                        parsed = ast.literal_eval(text)
                    except Exception:
                        parsed = None
                if isinstance(parsed, (dict, list)):
                    return cls._coerce_prose(parsed, depth=depth + 1)
            except Exception:
                pass

        # Unescape common escaped newlines from JSON strings
        text = text.replace("\\n", "\n").replace("\\t", " ")
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    @classmethod
    def _format_structured_summary(cls, parsed: Dict[str, Any], fallback: str = "") -> str:
        """Prefer explicit section fields as readable prose; fall back to free-form summary."""
        facts = cls._coerce_prose(parsed.get("facts"))
        issues = cls._coerce_prose(parsed.get("issues"))
        analysis = cls._coerce_prose(parsed.get("analysis"))
        conclusion = cls._coerce_prose(parsed.get("conclusion"))
        summary = cls._coerce_prose(parsed.get("summary"))

        # If analysis itself is nested under sub-keys in the root object
        if not analysis and any(
            k in parsed
            for k in (
                "similarities",
                "differences",
                "applicable statutes",
                "applicable_statutes",
                "precedents",
            )
        ):
            analysis = cls._coerce_prose(
                {
                    k: parsed[k]
                    for k in parsed
                    if k
                    not in {
                        "domain",
                        "facts",
                        "issues",
                        "analysis",
                        "conclusion",
                        "summary",
                        "cited_sections",
                        "cited_cases",
                        "cited_acts",
                        "confidence_score",
                        "disclaimer",
                    }
                }
            )

        if facts or issues or analysis or conclusion:
            parts: List[str] = []
            if facts:
                parts.append(f"Facts:\n{facts}")
            if issues:
                parts.append(f"Issues:\n{issues}")
            if analysis:
                parts.append(f"Analysis:\n{analysis}")
            if conclusion:
                parts.append(f"Conclusion:\n{conclusion}")
            return "\n\n".join(parts)

        if summary:
            # Normalize headers so the UI can split them
            normalized = summary
            for label in ("Facts", "Issues", "Analysis", "Conclusion"):
                normalized = re.sub(
                    rf"(?im)^\s*#*\s*{label}\s*:?",
                    f"{label}:",
                    normalized,
                )
            return cls._coerce_prose(normalized).strip()

        return cls._coerce_prose(fallback or "").strip()

    def _build_citations_from_chunks(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Always produce citation cards from retrieved chunks (primary source of truth)."""
        citations: List[Dict[str, Any]] = []
        seen = set()

        for result in results:
            source_collection = str(
                result.get("source_collection") or result.get("domain") or "Legal Library"
            ).strip()
            case_name = str(result.get("case_name") or result.get("law_name") or "").strip()
            section_number = str(result.get("section_number") or result.get("sections") or "").strip()
            act_name = str(result.get("act_name") or result.get("acts") or "").strip()
            law_name = str(result.get("law_name") or "").strip()
            chunk_text = str(result.get("chunk_text") or "").strip()
            score = float(result.get("score") or 0.0)

            # Prefer rich titles
            title = case_name or law_name or act_name or section_number or source_collection
            if not chunk_text and not title:
                continue

            # Determine primary type for the card
            if case_name:
                citation_type = "case"
                text = case_name
            elif section_number:
                citation_type = "section"
                text = section_number
            elif act_name:
                citation_type = "act"
                text = act_name
            else:
                citation_type = "source"
                text = title

            dedupe_key = (citation_type, text.lower(), source_collection, chunk_text[:120].lower())
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            citations.append(
                {
                    "type": citation_type,
                    "text": text,
                    "title": title,
                    "source_collection": source_collection,
                    "source": law_name or case_name or act_name or source_collection,
                    "score": score,
                    "excerpt": chunk_text[:320] if chunk_text else "No excerpt available.",
                    "full_text": chunk_text or "Full text not available for this citation.",
                    "section_number": section_number,
                    "act_name": act_name,
                    "case_name": case_name,
                }
            )

        citations.sort(key=lambda c: float(c.get("score") or 0.0), reverse=True)
        return citations

    def _extract_cited_lists_from_chunks(
        self, results: List[Dict[str, Any]]
    ) -> Tuple[List[str], List[str], List[str]]:
        sections: List[str] = []
        cases: List[str] = []
        acts: List[str] = []
        for result in results:
            for item in self._split_list_field(result.get("section_number") or result.get("sections")):
                if item not in sections:
                    sections.append(item)
            for item in self._split_list_field(result.get("case_name") or result.get("law_name")):
                if item not in cases:
                    cases.append(item)
            for item in self._split_list_field(result.get("act_name") or result.get("acts")):
                if item not in acts:
                    acts.append(item)
        return sections, cases, acts

    def _merge_model_citations_into_chunks(
        self,
        chunk_citations: List[Dict[str, Any]],
        model_sections: List[str],
        model_cases: List[str],
        model_acts: List[str],
        results: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Keep chunk citations primary; add model mentions that map to chunks."""
        final = list(chunk_citations)
        seen = {
            (str(c.get("type", "")), str(c.get("text", "")).strip().lower())
            for c in final
        }

        def find_chunk(needle: str) -> Optional[Dict[str, Any]]:
            n = needle.lower().strip()
            if not n:
                return None
            for chunk in results:
                hay = " ".join(
                    str(chunk.get(k) or "")
                    for k in (
                        "section_number",
                        "sections",
                        "act_name",
                        "acts",
                        "case_name",
                        "law_name",
                        "chunk_text",
                    )
                ).lower()
                if n in hay:
                    return chunk
            return None

        for type_label, mentions in (
            ("section", model_sections),
            ("case", model_cases),
            ("act", model_acts),
        ):
            for mention in mentions:
                key = (type_label, mention.strip().lower())
                if key in seen:
                    continue
                chunk = find_chunk(mention)
                if chunk:
                    final.append(
                        {
                            "type": type_label,
                            "text": mention,
                            "title": str(
                                chunk.get("case_name")
                                or chunk.get("law_name")
                                or mention
                            ),
                            "source_collection": str(
                                chunk.get("source_collection") or "Legal Library"
                            ),
                            "source": str(chunk.get("source") or "Official Record"),
                            "score": float(chunk.get("score") or 0.0),
                            "excerpt": str(chunk.get("chunk_text") or "")[:320],
                            "full_text": str(chunk.get("chunk_text") or ""),
                        }
                    )
                    seen.add(key)

        final.sort(key=lambda c: float(c.get("score") or 0.0), reverse=True)
        return final

    # ── LLM providers ────────────────────────────────────────────────────────

    def _call_groq(self, system_msg: str, user_msg: str) -> str:
        if not self.client:
            raise RuntimeError("Groq client not configured")

        last_err: Optional[Exception] = None
        for model in GROQ_MODELS:
            try:
                completion = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": user_msg},
                    ],
                    temperature=0.15,
                    max_tokens=2000,
                    response_format={"type": "json_object"},
                )
                content = completion.choices[0].message.content or ""
                print(f"[AI] Groq ({model}) ok ({len(content)} chars)")
                return content
            except Exception as exc:
                last_err = exc
                print(f"[AI] Groq model {model} failed: {exc}")
                if _is_rate_limited(exc):
                    # Try next smaller model immediately
                    continue
                # Non-rate errors: still try next model once
                continue
        raise last_err or RuntimeError("All Groq models failed")

    def _call_gemini(self, system_msg: str, user_msg: str) -> str:
        if not self._gemini_client:
            raise RuntimeError("Gemini client not configured")

        from google.genai import types

        last_err: Optional[Exception] = None
        prompt = f"{system_msg}\n\n{user_msg}"
        for model in GEMINI_MODELS:
            try:
                response = self._gemini_client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.15,
                        max_output_tokens=2000,
                        response_mime_type="application/json",
                    ),
                )
                content = (response.text or "").strip()
                print(f"[AI] Gemini ({model}) ok ({len(content)} chars)")
                return content
            except Exception as exc:
                last_err = exc
                print(f"[AI] Gemini model {model} failed: {exc}")
                if _is_rate_limited(exc):
                    time.sleep(1.0)
                    continue
                continue
        raise last_err or RuntimeError("All Gemini models failed")

    def _generate_with_fallback(self, system_msg: str, user_msg: str) -> Tuple[str, str]:
        """
        Try providers in order: Groq → Gemini.
        Returns (raw_content, provider_name).
        """
        errors: List[str] = []

        # Primary: Groq
        if self.client:
            try:
                return self._call_groq(system_msg, user_msg), "groq"
            except Exception as exc:
                errors.append(f"groq: {exc}")
                print(f"[AI] Groq path exhausted, trying Gemini fallback...")

        # Fallback: Gemini
        if self._gemini_client:
            try:
                return self._call_gemini(system_msg, user_msg), "gemini"
            except Exception as exc:
                errors.append(f"gemini: {exc}")

        # Brief retry on Groq after Gemini failure (rate-limit recovery window)
        if self.client and any(_is_rate_limited(Exception(e)) for e in errors):
            try:
                time.sleep(1.5)
                return self._call_groq(system_msg, user_msg), "groq-retry"
            except Exception as exc:
                errors.append(f"groq-retry: {exc}")

        raise RuntimeError(
            "All LLM providers failed or hit rate limits. "
            + " | ".join(errors[:3])
        )

    def _retrieval_only_answer(
        self,
        query: str,
        results: List[Dict[str, Any]],
        domain: str,
        confidence: float,
    ) -> Dict[str, Any]:
        """Useful structured answer when both LLMs are unavailable."""
        if not results:
            summary = (
                "The AI legal pipeline could not complete this request: language models "
                "are unavailable (invalid/suspended API key, rate limit, or network error) "
                "and no relevant legal passages were retrieved from the vector store. "
                "Check GROQ_API_KEY / GOOGLE_API_KEY and Qdrant connectivity in backend/.env, "
                "then retry or rephrase with specific acts/sections."
            )
            return {
                "domain": domain or "unknown",
                "summary": summary,
                "analysis": summary,
                "answer": summary,
                "facts": "",
                "issues": query,
                "conclusion": "Fix API keys / vector DB, then retry — or consult a verified lawyer.",
                "cited_sections": [],
                "cited_cases": [],
                "cited_acts": [],
                "disclaimer": DISCLAIMER,
                "confidence_score": 0.0,
                "retrieved_chunks": [],
                "citations": [],
                "retrieval_status": "degraded",
                "retrieval_notice": (
                    "LLM providers unavailable (auth/rate/network) and retrieval returned no matches."
                ),
                "llm_provider": "none",
            }

        sections, cases, acts = self._extract_cited_lists_from_chunks(results)
        citations = self._build_citations_from_chunks(results)

        facts_lines = []
        for i, r in enumerate(results[:3], 1):
            title = r.get("case_name") or r.get("law_name") or r.get("act_name") or f"Source {i}"
            excerpt = str(r.get("chunk_text") or "")[:280].replace("\n", " ")
            facts_lines.append(f"{i}. {title}: {excerpt}")

        summary = (
            f"Facts:\n"
            f"Your question concerns: {query.strip()}\n"
            f"The legal corpus returned the following relevant material:\n"
            + "\n".join(facts_lines)
            + "\n\nIssues:\n"
            f"What law applies to: {query.strip()}?\n"
            "\nAnalysis:\n"
            "The passages below were retrieved from the legal vector store. "
            "Language model generation is temporarily unavailable (rate limit/API), "
            "so this is a retrieval-grounded brief rather than a full counsel-style opinion. "
            "Review the cited sections, cases, and acts carefully.\n"
            "\nConclusion:\n"
            "Use the citations panel for full excerpts. For binding advice, consult a verified lawyer. "
            "You can retry in a minute for a full AI synthesis."
        )

        return {
            "domain": domain or "unknown",
            "summary": summary,
            "analysis": summary,
            "answer": summary,
            "cited_sections": sections,
            "cited_cases": cases,
            "cited_acts": acts,
            "disclaimer": DISCLAIMER,
            "confidence_score": max(0.25, min(confidence, 0.65)),
            "retrieved_chunks": results[:5],
            "citations": citations,
            "retrieval_status": "degraded",
            "retrieval_notice": (
                "AI model rate limit/API error — showing retrieval-grounded answer with citations. "
                "Retry shortly for full synthesis."
            ),
            "llm_provider": "retrieval-only",
        }

    # ── main entry ───────────────────────────────────────────────────────────

    def _ground_cited_list(self, mentions: List[str], results: List[Dict[str, Any]]) -> List[str]:
        """Keep only model citations that appear in retrieved chunk metadata/text."""
        grounded: List[str] = []
        for mention in mentions or []:
            n = str(mention).strip()
            if not n:
                continue
            nl = n.lower()
            for chunk in results:
                hay = " ".join(
                    str(chunk.get(k) or "")
                    for k in (
                        "section_number",
                        "sections",
                        "act_name",
                        "acts",
                        "case_name",
                        "law_name",
                        "chunk_text",
                    )
                ).lower()
                if nl in hay or any(tok and tok in hay for tok in nl.split() if len(tok) > 4):
                    if n not in grounded:
                        grounded.append(n)
                    break
        return grounded

    def _append_sources_line(self, summary_text: str, citations: List[Dict[str, Any]]) -> str:
        if not citations:
            return summary_text
        if re.search(r"\[C\d+\]", summary_text or ""):
            return summary_text
        titles = []
        for c in citations[:5]:
            t = str(c.get("title") or c.get("text") or "").strip()
            if t and t not in titles:
                titles.append(t)
        if not titles:
            return summary_text
        line = "Sources used: " + "; ".join(titles)
        return (summary_text or "").rstrip() + "\n\n" + line

    def _insufficient_context_answer(
        self,
        query: str,
        results: List[Dict[str, Any]],
        domain: str,
        confidence: float,
        retrieval_status: str,
        retrieval_notice: Optional[str],
        retrieval_backend: str,
    ) -> Dict[str, Any]:
        chunk_citations = self._build_citations_from_chunks(results)
        sections, cases, acts = self._extract_cited_lists_from_chunks(results)
        summary = (
            "Facts:\n"
            f"Your question: {query.strip()}\n\n"
            "Issues:\n"
            "1. Which statutes or precedents apply?\n"
            "2. What immediate procedural steps are available?\n\n"
            "Analysis:\n"
            "The legal vector store did not return sufficiently relevant passages to support a full "
            "counsel-style opinion with high confidence. Do not rely on invented case names or section "
            "numbers. Rephrase with specific acts, sections, facts (dates, notices, FIR numbers), or "
            "jurisdiction for better retrieval.\n\n"
            "Conclusion:\n"
            "1. Capture key facts and documents (complaint, notice, FIR, order).\n"
            "2. Retry with more specific legal terms (e.g. 'Section 125 CrPC maintenance').\n"
            "3. Consult a verified advocate for binding advice."
        )
        if results:
            summary += (
                "\n\nLimited excerpts were still retrieved — review the citations panel carefully."
            )
        notice = retrieval_notice or "Insufficient corpus match for a fully grounded answer."
        return {
            "domain": domain or "unknown",
            "summary": summary,
            "analysis": summary,
            "answer": summary,
            "cited_sections": sections,
            "cited_cases": cases,
            "cited_acts": acts,
            "disclaimer": DISCLAIMER,
            "confidence_score": min(0.35, max(0.0, confidence)),
            "retrieved_chunks": results[:6],
            "citations": chunk_citations,
            "retrieval_status": "degraded",
            "retrieval_notice": notice,
            "llm_provider": "none",
            "retrieval_backend": retrieval_backend,
            "used_chunk_ids": [],
        }

    def ask(self, query: str) -> Dict[str, Any]:
        print(f"\n[AI] Processing query: {query}...")

        top_k = int(getattr(settings, "RAG_TOP_K", 6) or 6)
        score_floor = float(getattr(settings, "RAG_SCORE_FLOOR", 0.35) or 0.35)
        min_hits = int(getattr(settings, "RAG_MIN_HITS", 3) or 3)

        retrieval = self.retriever.search_with_meta(query, top_k=top_k)
        results = retrieval.get("results", []) or []
        domain_candidates = retrieval.get("domain_candidates", []) or []
        confidence_score = float(retrieval.get("confidence_score", 0.0))
        retrieval_status = str(retrieval.get("retrieval_status") or "ok")
        retrieval_notice = retrieval.get("retrieval_notice")
        retrieval_backend = str(retrieval.get("retrieval_backend") or "unknown")
        max_score = float(retrieval.get("max_score") or (max((float(r.get("score") or 0) for r in results), default=0.0)))
        domain_default = domain_candidates[0] if domain_candidates else "unknown"

        # Always prepare chunk-based citations up front
        chunk_citations = self._build_citations_from_chunks(results)
        chunk_sections, chunk_cases, chunk_acts = self._extract_cited_lists_from_chunks(results)

        # Weak / empty retrieval: do not run ungrounded Senior Counsel persona
        weak = (not results) or (max_score < score_floor and len(results) < min_hits)
        if not results:
            out = self._insufficient_context_answer(
                query, results, domain_default, confidence_score,
                retrieval_status, retrieval_notice, retrieval_backend,
            )
            out["domain_candidates"] = domain_candidates
            return out

        context_blocks: List[str] = []
        for index, result in enumerate(results[:6], start=1):
            chunk_text = str(result.get("chunk_text", "")).strip()
            # Top chunks keep more statute language; lower ranks stay shorter for TPM
            budget = 1200 if index <= 3 else 650
            if len(chunk_text) > budget:
                chunk_text = chunk_text[:budget].rsplit(" ", 1)[0] + "..."
            section_number = str(result.get("section_number") or result.get("sections") or "").strip()
            act_name = str(result.get("act_name") or result.get("acts") or "").strip()
            case_name = str(result.get("case_name") or result.get("law_name") or "").strip()
            source_collection = str(result.get("source_collection") or result.get("domain") or "").strip()
            legal_issue = str(result.get("legal_issue") or "").strip()
            score = result.get("score")
            cid = f"C{index}"

            context_blocks.append(
                f"[{cid}] score={score} domain={source_collection}\n"
                f"CASE: {case_name}\n"
                f"ACT: {act_name}\n"
                f"SECTION: {section_number}\n"
                f"LEGAL_ISSUE: {legal_issue}\n"
                f"TEXT: {chunk_text}"
            )

        context_text = "\n\n".join(context_blocks)

        system_msg = (
            "You are a Senior Indian Legal Counsel writing practical guidance for a client.\n"
            "Use ONLY the RETRIEVED CONTEXT as authority. Prefer statutes, sections, and case names "
            "that appear in the context. Do NOT invent case names, section numbers, or act titles.\n\n"
            "Return STRICT JSON with keys:\n"
            "  domain (string; one of legal_constitutional, legal_criminal, legal_consumer, "
            "legal_family, legal_labour, legal_motor_accident, or general),\n"
            "  facts (STRING only — plain readable paragraphs or numbered lines; NEVER a JSON object/dict),\n"
            "  issues (STRING only — numbered legal questions in plain English; NEVER nested objects),\n"
            "  analysis (STRING only — full paragraphs of side-by-side legal analysis; NEVER nested objects),\n"
            "  conclusion (STRING only — strategy and next steps in plain English; NEVER nested objects),\n"
            "  summary (string; short 2-4 sentence overview),\n"
            "  cited_sections (array of strings),\n"
            "  cited_cases (array of strings),\n"
            "  cited_acts (array of strings),\n"
            "  confidence_score (number 0-1).\n\n"
            "RULES:\n"
            "1. facts, issues, analysis, conclusion MUST be plain human-readable strings "
            "(use newlines and bullet lines like '• ' or '1. '). Do NOT put dicts/maps/objects inside them.\n"
            "2. For comparisons, write e.g. 'Matter 1 (Sharma): …\\nMatter 2 (Mehta): …' as prose, not as JSON keys.\n"
            "3. When you rely on a chunk, mark it with [C1]…[Cn] matching the context headers.\n"
            "4. cited_* arrays must ONLY contain items that appear in the context chunks.\n"
            "5. If context is thin or weakly related, say so, set confidence_score ≤ 0.45, and give cautious steps.\n"
            "6. Return ONLY valid JSON — no markdown fences, no prose outside JSON."
        )
        user_msg = (
            f"USER QUERY:\n{query}\n\n"
            f"RETRIEVED CONTEXT (cite with [C1]..[Cn]):\n{context_text}\n\n"
            "Write a high-quality counsel-style JSON response now."
        )

        # If retrieval is weak, still generate but bias the user message
        if weak:
            user_msg += (
                "\n\nNOTE: Retrieval scores are weak. Be conservative; do not invent law; "
                "prefer procedural next steps and lower confidence_score."
            )

        llm_provider = "none"
        parsed_answer: Dict[str, Any] = {}
        raw_answer = ""

        try:
            raw_answer, llm_provider = self._generate_with_fallback(system_msg, user_msg)
            cleaned = self._clean_json_payload(raw_answer)
            parsed_answer = json.loads(cleaned)
            if not isinstance(parsed_answer, dict):
                raise ValueError("LLM JSON was not an object")
        except Exception as exc:
            print(f"[AI] Generation/parse failed: {exc}")
            if raw_answer and not _is_rate_limited(exc):
                parsed_answer = {
                    "summary": raw_answer,
                    "domain": domain_default,
                    "confidence_score": confidence_score or 0.4,
                    "cited_sections": chunk_sections,
                    "cited_cases": chunk_cases,
                    "cited_acts": chunk_acts,
                }
            else:
                fallback = self._retrieval_only_answer(
                    query, results, domain_default, confidence_score
                )
                fallback["domain_candidates"] = domain_candidates
                fallback["retrieval_backend"] = retrieval_backend
                if retrieval_status != "ok":
                    fallback["retrieval_status"] = retrieval_status
                    if retrieval_notice:
                        fallback["retrieval_notice"] = retrieval_notice
                return fallback

        summary_text = self._format_structured_summary(parsed_answer, fallback=raw_answer)

        # Ground model citation lists to chunks; always union with chunk metadata lists
        model_sections = self._ground_cited_list(
            self._split_list_field(parsed_answer.get("cited_sections")), results
        )
        model_cases = self._ground_cited_list(
            self._split_list_field(parsed_answer.get("cited_cases")), results
        )
        model_acts = self._ground_cited_list(
            self._split_list_field(parsed_answer.get("cited_acts")), results
        )
        model_sections = self._merge_unique(model_sections, chunk_sections)
        model_cases = self._merge_unique(model_cases, chunk_cases)
        model_acts = self._merge_unique(model_acts, chunk_acts)

        final_citations = self._merge_model_citations_into_chunks(
            chunk_citations,
            model_sections,
            model_cases,
            model_acts,
            results,
        )
        if not final_citations and chunk_citations:
            final_citations = chunk_citations

        # Tag citation cards with C-ids for UI
        for i, card in enumerate(final_citations[:6], start=1):
            card.setdefault("chunk_id", f"C{i}")

        summary_text = self._append_sources_line(summary_text, final_citations)

        conf = parsed_answer.get("confidence_score", confidence_score)
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = confidence_score
        conf = max(0.0, min(1.0, conf))
        if weak:
            conf = min(conf, 0.45)

        notice = retrieval_notice
        if llm_provider in {"gemini", "groq-retry"}:
            extra = f"Answer generated via {llm_provider} (primary provider was limited)."
            notice = f"{notice} {extra}".strip() if notice else extra
        if weak and retrieval_status == "ok":
            retrieval_status = "degraded"
            weak_note = "Retrieval match was weak; answer is more provisional."
            notice = f"{notice} {weak_note}".strip() if notice else weak_note

        used_ids = sorted(set(re.findall(r"\[(C\d+)\]", summary_text or "")))

        return {
            "domain": str(parsed_answer.get("domain") or domain_default),
            "summary": summary_text,
            "analysis": summary_text,
            "answer": summary_text,
            "cited_sections": model_sections,
            "cited_cases": model_cases,
            "cited_acts": model_acts,
            "disclaimer": DISCLAIMER,
            "confidence_score": conf,
            "retrieved_chunks": results[:6],
            "domain_candidates": domain_candidates,
            "citations": final_citations,
            "retrieval_status": retrieval_status,
            "retrieval_notice": notice,
            "llm_provider": llm_provider,
            "retrieval_backend": retrieval_backend,
            "used_chunk_ids": used_ids,
            "max_score": max_score,
        }


if __name__ == "__main__":
    engine = LegalQAEngine()
    sample = "What are the rights of manual scavengers under the Indian Constitution?"
    answer = engine.ask(sample)
    print("\n" + "=" * 50)
    print("LEGAL ANALYSIS")
    print("=" * 50)
    print(json.dumps(answer, indent=2, default=str)[:4000])
    print("=" * 50)
