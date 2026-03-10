"""LLM-based enrichment for response context — Phase 2 (optional).

Port of packages/shared/src/llm-enrichment.ts, using anthropic Python SDK.
Placeholder for future implementation.
"""

from __future__ import annotations


def enrich_response_context_with_llm(session_text: str, prompt_text: str) -> dict | None:
    """Use Claude to extract deeper reasoning context from a benchmark session.

    Not yet implemented — returns None. When enabled, this will:
    1. Send the session text + prompt to Claude
    2. Extract reasoning_chain, disqualification_reasons, confidence_score
    3. Return a dict matching ExtractedResponseContext fields
    """
    return None
