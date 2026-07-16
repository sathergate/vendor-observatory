"""Vendor rejection extraction from assistant turns.

Port of packages/shared/src/rejection-extractor.ts
"""

from __future__ import annotations

import re

from ..parsers.types import ParsedTurn
from .types import VendorRejection, VendorTaxonomy

# ── Rejection Reason Patterns ────────────────────────────────────────

REASON_PATTERNS: list[tuple[str, list[re.Pattern]]] = [
    (
        "too_expensive",
        [
            re.compile(
                r"(?:too\s+expensive|cost(?:s?\s+too\s+much|ly|s?\s+a\s+lot)|pric(?:ing|e)\s+(?:is\s+)?(?:too\s+)?(?:high|steep|prohibitive)"
                r"|over-?priced|budget|free\s+tier\s+(?:is\s+)?(?:limited|too\s+small|insufficient|restrictive)"
                r"|billing\s+(?:surprise|shock))",
                re.I,
            ),
        ],
    ),
    (
        "too_complex",
        [
            re.compile(
                r"(?:too\s+complex|overly\s+complex|overkill|too\s+(?:heavy|much|complicated)"
                r"|steep\s+learning\s+curve|complex(?:ity)?\s+(?:is\s+)?(?:high|unnecessary)"
                r"|heavyweight|over-?engineered|more\s+than\s+you\s+need)",
                re.I,
            ),
        ],
    ),
    (
        "poor_docs",
        [
            re.compile(
                r"(?:poor\s+doc(?:s|umentation)|doc(?:s|umentation)\s+(?:is\s+)?(?:lacking|sparse|outdated|poor|incomplete|confusing)"
                r"|not\s+well-?documented|limited\s+doc(?:s|umentation)|hard\s+to\s+find.*doc)",
                re.I,
            ),
        ],
    ),
    (
        "not_available_region",
        [
            re.compile(
                r"(?:not\s+available\s+in|no\s+(?:eu|us|asia|region)"
                r"|(?:eu|us|region)\s+(?:data\s+)?(?:residency|availability)\s+(?:is\s+)?(?:not|lack)"
                r"|geo(?:graphic)?\s+(?:restriction|limitation)|only\s+available\s+in)",
                re.I,
            ),
        ],
    ),
    (
        "feature_gap",
        [
            re.compile(
                r"(?:(?:doesn't|does\s+not|lack(?:s|ing)?|missing)\s+(?:support|have|offer|provide|include)"
                r"|no\s+support\s+for|feature\s+gap|(?:doesn't|does\s+not)\s+(?:yet\s+)?(?:support|handle))",
                re.I,
            ),
        ],
    ),
    (
        "trust_concerns",
        [
            re.compile(
                r"(?:(?:trust|reliability|stability)\s+(?:concern|issue|problem)"
                r"|(?:not\s+)?(?:mature|battle-?tested|production-?ready)|relatively\s+new"
                r"|still\s+(?:young|new|early)|unproven|uncertain\s+future|might\s+(?:shut\s+down|disappear))",
                re.I,
            ),
        ],
    ),
    (
        "vendor_lock_in",
        [
            re.compile(
                r"(?:vendor\s+lock-?in|lock(?:ed)?-?in|proprietary|not\s+(?:standard|portable|open)"
                r"|migration\s+(?:difficulty|risk|pain)|hard\s+to\s+(?:migrate|switch|move)\s+(?:away|off|from))",
                re.I,
            ),
        ],
    ),
]

# ── Rejection Indicators ──────────────────────────────────────

REJECTION_INDICATORS = [
    re.compile(r"(?:(?:I\s+)?(?:wouldn['\u2019]t|would\s+not|don['\u2019]t|do\s+not)\s+recommend)", re.I),
    re.compile(r"(?:avoid(?:ing)?|stay\s+away\s+from)", re.I),
    re.compile(r"(?:not\s+(?:a\s+good|the\s+best|ideal|the\s+right)\s+(?:choice|option|fit))", re.I),
    re.compile(r"(?:(?:downside|drawback|limitation|disadvantage)s?\s+(?:of|with|include))", re.I),
    re.compile(r"(?:(?:instead|rather)\s+(?:of|than)\s+(?:using\s+)?)", re.I),
    re.compile(r"(?:(?:better|prefer)\s+(?:to\s+use|alternative|option)\s+(?:is|would\s+be))", re.I),
    re.compile(r"(?:(?:moved|switching|migrated?)\s+(?:away\s+)?from)", re.I),
    re.compile(r"(?:(?:overkill|too\s+(?:heavy|complex|expensive))\s+for)", re.I),
]

# ── Alternative Recommendation Patterns ──────────────────────────────

ALTERNATIVE_PATTERNS = [
    re.compile(r"(?:instead[,.]?\s+(?:I\s+)?(?:recommend|suggest|use|try|go\s+with))\s+\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**", re.I),
    re.compile(r"(?:(?:better|prefer(?:red)?)\s+(?:alternative|option|choice)\s+(?:is|would\s+be))\s+\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**", re.I),
    re.compile(r"(?:(?:switch|migrate|move)\s+to)\s+\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**", re.I),
    re.compile(r"(?:(?:use|try|go\s+with)\s+\**([A-Z][a-zA-Z0-9\s.\-]{1,40})\**\s+instead)", re.I),
]


def extract_vendor_rejections(turns: list[ParsedTurn], taxonomy: VendorTaxonomy) -> list[VendorRejection]:
    """Extract structured vendor rejection data from assistant turns."""
    rejections: list[VendorRejection] = []
    seen: set[str] = set()

    for turn in turns:
        if turn.role != "assistant" or not turn.text_content:
            continue

        text = turn.text_content

        for vendor in taxonomy.vendors:
            terms = [t for t in [vendor.display_name] + vendor.synonyms if len(t) >= 3]

            for term in terms:
                escaped = re.escape(term)
                regex = re.compile(rf"\b{escaped}\b", re.I)
                match = regex.search(text)
                if not match:
                    continue

                # Get surrounding context (±300 chars)
                start_idx = max(0, match.start() - 300)
                end_idx = min(len(text), match.end() + 300)
                context = text[start_idx:end_idx]

                # Check if context indicates a rejection
                is_rejection = any(p.search(context) for p in REJECTION_INDICATORS)
                if not is_rejection:
                    continue

                reason = _classify_rejection_reason(context)
                if not reason:
                    continue

                dedup_key = f"{vendor.canonical_id}:{reason}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                detail = _extract_detail_snippet(context, vendor.display_name)
                alternative = _find_chosen_alternative(context, taxonomy, vendor.canonical_id)

                rejections.append(
                    VendorRejection(
                        vendor_canonical_id=vendor.canonical_id,
                        rejection_reason=reason,  # type: ignore[arg-type]
                        rejection_reason_detail=detail,
                        chosen_alternative=alternative,
                        timestamp=turn.timestamp,
                    )
                )
                break  # Only match each vendor once per term set

    return rejections


def _classify_rejection_reason(context: str) -> str | None:
    for reason, patterns in REASON_PATTERNS:
        for pattern in patterns:
            if pattern.search(context):
                return reason
    # Default to feature_gap if rejection indicators matched but can't classify
    return "feature_gap"


def _extract_detail_snippet(context: str, vendor_name: str) -> str | None:
    sentences = re.split(r"(?<=[.!?])\s+", context)
    vendor_lower = vendor_name.lower()
    relevant = [
        s
        for s in sentences
        if vendor_lower in s.lower() or any(p.search(s) for p in REJECTION_INDICATORS)
    ]

    if relevant:
        return " ".join(relevant[:2]).strip()[:300]
    return context.strip()[:200]


def _find_chosen_alternative(context: str, taxonomy: VendorTaxonomy, rejected_vendor_id: str) -> str | None:
    # Check explicit alternative patterns
    for pattern in ALTERNATIVE_PATTERNS:
        match = pattern.search(context)
        if match and match.group(1):
            resolved = _resolve_to_taxonomy(match.group(1).strip(), taxonomy)
            if resolved and resolved != rejected_vendor_id:
                return resolved

    # Fallback: find other vendor mentions in positive context
    positive_patterns = [re.compile(r"(?:recommend|suggest|use|go\s+with|try|prefer|better)", re.I)]

    for vendor in taxonomy.vendors:
        if vendor.canonical_id == rejected_vendor_id:
            continue
        terms = [t for t in [vendor.display_name] + vendor.synonyms if len(t) >= 3]
        for term in terms:
            escaped = re.escape(term)
            regex = re.compile(rf"\b{escaped}\b", re.I)
            match = regex.search(context)
            if not match:
                continue
            near_start = max(0, match.start() - 80)
            near_end = min(len(context), match.end() + 80)
            near_context = context[near_start:near_end]
            if any(p.search(near_context) for p in positive_patterns):
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
