"""Response context extraction from benchmark assistant turns.

Port of packages/shared/src/reasoning-extractor.ts
"""

from __future__ import annotations

import re

from ..parsers.types import ParsedTurn
from .types import ExtractedResponseContext, VendorDispositionEntry, VendorTaxonomy

# ── Recommendation Phrases ──────────────────────────────────────────

PRIMARY_RECOMMENDATION_PATTERNS = [
    re.compile(
        r"(?:I\s+(?:recommend|suggest)|my\s+(?:recommendation|top\s+pick)|the\s+best\s+(?:option|choice|fit)\s+(?:is|would\s+be)"
        r"|I['\u2019]d\s+(?:go\s+with|choose|pick)|let['\u2019]s?\s+(?:go\s+with|use))\s+\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**",
        re.I,
    ),
    re.compile(
        r"\*\*(?:Recommendation|Primary\s+choice|Winner|Top\s+pick|My\s+pick)[:\s]*\*?\*?\s*\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**",
        re.I,
    ),
    re.compile(
        r"(?:go\s+with|choose|pick|use|start\s+with)\s+\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**\s+(?:as\s+your|for\s+(?:this|your|the))",
        re.I,
    ),
]

TRADE_OFF_SECTION_PATTERNS = [
    re.compile(
        r"(?:trade-?\s*offs?|pros?\s+(?:and|&|/)\s+cons?|advantages?\s+(?:and|&|/)\s+disadvantages?"
        r"|considerations?|caveats?)[:\s]*\n([\s\S]{10,500}?)(?:\n(?:#{1,3}\s|---|\*\*[A-Z])|\n\n\n)",
        re.I,
    ),
    re.compile(
        r"(?:however|on\s+the\s+other\s+hand|the\s+(?:downside|trade-?\s*off))[,:\s]+([\s\S]{10,300}?)(?:\.\s|\n\n)",
        re.I,
    ),
]

GOTCHA_SECTION_PATTERNS = [
    re.compile(
        r"(?:gotchas?|watch\s+out|be\s+(?:aware|careful)|important\s+(?:notes?|caveats?)"
        r"|pitfalls?|known\s+(?:issues?|limitations?))[:\s]*\n([\s\S]{10,500}?)(?:\n(?:#{1,3}\s|---|\*\*[A-Z])|\n\n\n)",
        re.I,
    ),
    re.compile(r"(?:\u26a0\ufe0f|\U0001f6a8|\u26a1|Warning|Note)[:\s]+([\s\S]{10,200}?)(?:\n\n)", re.I),
]

RATIONALE_PATTERNS = [
    re.compile(
        r"(?:(?:I\s+(?:recommend|suggest)|(?:here['\u2019]?s?\s+)?why|the\s+reason)[:\s]+)([\s\S]{10,300}?)(?:\.\s*\n|\n\n)",
        re.I,
    ),
    re.compile(
        r"(?:(?:This|It)\s+(?:is\s+(?:ideal|perfect|great|the\s+best)|works?\s+(?:well|best))\s+(?:because|since|for))[:\s]*([\s\S]{10,200}?)(?:\.\s*\n|\n\n)",
        re.I,
    ),
]

# ── Disposition Patterns ────────────────────────────────────────────

REJECTION_CONTEXT = [
    re.compile(
        r"(?:(?:I\s+)?(?:wouldn['\u2019]t|would\s+not|don['\u2019]t|do\s+not)\s+recommend|avoid|stay\s+away\s+from"
        r"|not\s+(?:a\s+good|the\s+best)\s+(?:choice|option|fit)|(?:downside|drawback|limitation)s?\s+of"
        r"|overkill|too\s+(?:heavy|complex|expensive))",
        re.I,
    ),
]

COMPARISON_CONTEXT = [
    re.compile(
        r"(?:compared?\s+to|versus|vs\.?|alternatively|another\s+option|instead\s+of|if\s+you\s+(?:need|want|prefer))",
        re.I,
    ),
]

RECOMMENDATION_CONTEXT = [
    re.compile(
        r"(?:I\s+(?:recommend|suggest)|you\s+(?:should|could)\s+use"
        r"|(?:great|good|excellent|best|ideal)\s+(?:choice|option|fit)|let['\u2019]s?\s+use|we(?:['\u2019]ll)?\s+use)",
        re.I,
    ),
]

IMPLEMENTATION_MARKERS = [
    re.compile(r"(?:npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install)\s"),
    re.compile(r"""(?:import\s+.*from\s+['"]|require\s*\(\s*['"])"""),
    re.compile(r"(?:\.env|process\.env\.|DATABASE_URL|NEXT_PUBLIC_)"),
    re.compile(r"```(?:typescript|javascript|ts|js|python|py|bash|sh)"),
]

# ── Constraint Patterns ─────────────────────────────────────────────

CONSTRAINT_PATTERNS: dict[str, list[re.Pattern]] = {
    "serverless_compatible": [re.compile(r"serverless", re.I), re.compile(r"connection\s+pool", re.I), re.compile(r"http\s+driver", re.I), re.compile(r"edge\s+(?:runtime|function)", re.I)],
    "pgvector_required": [re.compile(r"pgvector", re.I), re.compile(r"vector\s+(?:search|index|column|embedding)", re.I)],
    "eu_data_residency": [re.compile(r"eu\s+(?:region|data|residency)", re.I), re.compile(r"gdpr", re.I), re.compile(r"europe", re.I), re.compile(r"frankfurt|ireland|london", re.I)],
    "pitr_backups": [re.compile(r"pitr", re.I), re.compile(r"point-?in-?time", re.I), re.compile(r"backup", re.I), re.compile(r"restore", re.I)],
    "soc2": [re.compile(r"soc\s*2", re.I), re.compile(r"soc\s*ii", re.I), re.compile(r"compliance", re.I)],
    "hipaa": [re.compile(r"hipaa", re.I), re.compile(r"health\s+(?:data|information)", re.I)],
    "gdpr": [re.compile(r"gdpr", re.I), re.compile(r"data\s+(?:protection|privacy|residency)", re.I)],
    "rls": [re.compile(r"row-?\s*level\s+security", re.I), re.compile(r"\brls\b", re.I)],
    "branching": [re.compile(r"branch", re.I), re.compile(r"preview\s+(?:env|deploy)", re.I), re.compile(r"per-?pr", re.I)],
    "real_time": [re.compile(r"real-?\s*time", re.I), re.compile(r"websocket", re.I), re.compile(r"subscription", re.I), re.compile(r"live\s+(?:update|query)", re.I)],
    "edge_compatible": [re.compile(r"edge", re.I), re.compile(r"cloudflare\s+worker", re.I), re.compile(r"vercel\s+edge", re.I)],
    "type_safe": [re.compile(r"type-?\s*safe", re.I), re.compile(r"typescript", re.I), re.compile(r"typed\s+(?:client|sdk|api)", re.I)],
    "offline_support": [re.compile(r"offline", re.I), re.compile(r"local-?first", re.I), re.compile(r"sync", re.I)],
    "multi_tenant": [re.compile(r"multi-?\s*tenant", re.I), re.compile(r"tenant\s+(?:isolation|separation)", re.I)],
    "audit_log": [re.compile(r"audit\s+log", re.I), re.compile(r"audit\s+trail", re.I)],
    "encryption_at_rest": [re.compile(r"encrypt(?:ion|ed)\s+at\s+rest", re.I), re.compile(r"aes", re.I), re.compile(r"kms", re.I)],
    "zero_downtime_migration": [re.compile(r"zero-?\s*downtime", re.I), re.compile(r"rolling\s+migration", re.I), re.compile(r"blue-?\s*green", re.I)],
    "read_replicas": [re.compile(r"read\s+replica", re.I), re.compile(r"replica", re.I)],
    "autoscaling": [re.compile(r"auto-?\s*scal", re.I), re.compile(r"scale\s+to\s+zero", re.I)],
    "connection_pooling": [re.compile(r"connection\s+pool", re.I), re.compile(r"pgbouncer", re.I), re.compile(r"pooler", re.I)],
}


def extract_response_context(
    turns: list[ParsedTurn],
    taxonomy: VendorTaxonomy,
    prompt_constraints: list[str],
) -> ExtractedResponseContext:
    """Extract structured response context from a benchmark session's assistant turns."""
    assistant_text = "\n\n".join(t.text_content for t in turns if t.role == "assistant" and t.text_content)

    if not assistant_text or len(assistant_text) < 20:
        return ExtractedResponseContext()

    primary_vendor = _extract_primary_vendor(assistant_text, taxonomy)
    is_implemented = any(p.search(assistant_text) for p in IMPLEMENTATION_MARKERS)
    rationale_snippet = _extract_first_match(assistant_text, RATIONALE_PATTERNS)
    vendors_mentioned = _extract_vendor_dispositions(assistant_text, taxonomy, primary_vendor)
    trade_offs_snippet = _extract_first_match(assistant_text, TRADE_OFF_SECTION_PATTERNS)
    gotchas_snippet = _extract_first_match(assistant_text, GOTCHA_SECTION_PATTERNS)
    constraints_addressed = _check_constraint_coverage(assistant_text, prompt_constraints)

    return ExtractedResponseContext(
        primary_vendor=primary_vendor,
        is_implemented=is_implemented,
        rationale_snippet=rationale_snippet[:500] if rationale_snippet else None,
        vendors_mentioned=vendors_mentioned,
        trade_offs_snippet=trade_offs_snippet[:500] if trade_offs_snippet else None,
        gotchas_snippet=gotchas_snippet[:500] if gotchas_snippet else None,
        constraints_addressed=constraints_addressed,
    )


def _extract_primary_vendor(text: str, taxonomy: VendorTaxonomy) -> str | None:
    for pattern in PRIMARY_RECOMMENDATION_PATTERNS:
        match = pattern.search(text)
        if match and match.group(1):
            resolved = _resolve_to_taxonomy(match.group(1).strip(), taxonomy)
            if resolved:
                return resolved

    # Fallback: find the first vendor mentioned after a recommendation phrase
    for rec_pattern in RECOMMENDATION_CONTEXT:
        rec_match = rec_pattern.search(text)
        if rec_match:
            after_rec = text[rec_match.start() : rec_match.start() + 200]
            for vendor in taxonomy.vendors:
                terms = [t for t in [vendor.display_name] + vendor.synonyms if len(t) >= 3]
                for term in terms:
                    escaped = re.escape(term)
                    if re.search(rf"\b{escaped}\b", after_rec, re.I):
                        return vendor.canonical_id

    return None


def _resolve_to_taxonomy(raw: str, taxonomy: VendorTaxonomy) -> str | None:
    cleaned = raw.replace("*", "").strip()
    if not cleaned:
        return None
    lower = cleaned.lower()

    for vendor in taxonomy.vendors:
        if vendor.canonical_id.lower() == lower:
            return vendor.canonical_id
        if vendor.display_name.lower() == lower:
            return vendor.canonical_id
        for syn in vendor.synonyms:
            if syn.lower() == lower:
                return vendor.canonical_id

    for vendor in taxonomy.vendors:
        if vendor.canonical_id.lower() in lower:
            return vendor.canonical_id
        if vendor.display_name.lower() in lower:
            return vendor.canonical_id

    return None


def _extract_vendor_dispositions(
    text: str,
    taxonomy: VendorTaxonomy,
    primary_vendor: str | None,
) -> list[VendorDispositionEntry]:
    results: list[VendorDispositionEntry] = []
    seen: set[str] = set()

    for vendor in taxonomy.vendors:
        terms = [t for t in [vendor.display_name] + vendor.synonyms if len(t) >= 3]
        matched = False

        for term in terms:
            if matched:
                break
            escaped = re.escape(term)
            regex = re.compile(rf"\b{escaped}\b", re.I)
            match = regex.search(text)
            if not match:
                continue
            if vendor.canonical_id in seen:
                break
            seen.add(vendor.canonical_id)
            matched = True

            start_idx = max(0, match.start() - 150)
            end_idx = min(len(text), match.end() + 150)
            context = text[start_idx:end_idx]

            disposition = "mentioned"

            if vendor.canonical_id == primary_vendor:
                disposition = "recommended"
            elif any(p.search(context) for p in REJECTION_CONTEXT):
                disposition = "rejected"
            elif any(p.search(context) for p in COMPARISON_CONTEXT):
                disposition = "compared"
            elif any(p.search(context) for p in RECOMMENDATION_CONTEXT):
                disposition = "recommended"

            if disposition in ("recommended", "mentioned"):
                vendor_impl = re.search(rf"(?:npm\s+install|pnpm\s+add|yarn\s+add).*\b{escaped}\b", text, re.I)
                if vendor_impl:
                    disposition = "implemented"

            results.append(VendorDispositionEntry(vendor=vendor.canonical_id, disposition=disposition))  # type: ignore[arg-type]

    return results


def _check_constraint_coverage(text: str, constraints: list[str]) -> list[str]:
    addressed: list[str] = []
    lower = text.lower()

    for constraint in constraints:
        patterns = CONSTRAINT_PATTERNS.get(constraint)
        if patterns:
            if any(p.search(lower) for p in patterns):
                addressed.append(constraint)
        else:
            terms = constraint.replace("_", " ")
            if terms.lower() in lower:
                addressed.append(constraint)

    return addressed


def _extract_first_match(text: str, patterns: list[re.Pattern]) -> str | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match and match.group(1):
            return match.group(1).strip()
    return None
