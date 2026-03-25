"""Extraction type definitions — Python equivalents of packages/shared/src/types.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

MentionType = Literal["installed", "configured", "implemented", "recommended", "compared", "mentioned", "rejected", "custom_diy"]

RejectionReason = Literal[
    "too_expensive", "too_complex", "poor_docs", "not_available_region", "feature_gap", "trust_concerns", "vendor_lock_in"
]

VendorDisposition = Literal["recommended", "compared", "rejected", "mentioned", "implemented", "custom_diy"]

DeveloperIntent = Literal[
    "evaluation", "migration", "greenfield", "debugging", "architecture", "compliance", "cost_optimization", "unknown"
]


@dataclass
class VendorEntry:
    canonical_id: str
    display_name: str
    synonyms: list[str] = field(default_factory=list)
    category: str = ""
    website: str = ""


@dataclass
class VendorTaxonomy:
    vendors: list[VendorEntry] = field(default_factory=list)


@dataclass
class VendorMention:
    vendor_canonical_id: str
    vendor_raw: str
    mention_type: MentionType
    confidence: float
    context_snippet: str
    user_prompt_snippet: str | None = None
    timestamp: str = ""
    work_category: str | None = None


@dataclass
class VendorRejection:
    vendor_canonical_id: str
    rejection_reason: RejectionReason
    rejection_reason_detail: str | None = None
    chosen_alternative: str | None = None
    timestamp: str = ""


@dataclass
class VendorDispositionEntry:
    vendor: str
    disposition: VendorDisposition


@dataclass
class ExtractedResponseContext:
    primary_vendor: str | None = None
    is_implemented: bool = False
    is_custom_diy: bool = False
    rationale_snippet: str | None = None
    vendors_mentioned: list[VendorDispositionEntry] = field(default_factory=list)
    trade_offs_snippet: str | None = None
    gotchas_snippet: str | None = None
    constraints_addressed: list[str] = field(default_factory=list)
    reasoning_chain: str | None = None
    disqualification_reasons: list[dict] = field(default_factory=list)
    confidence_score: float | None = None


@dataclass
class IntentClassification:
    intent: DeveloperIntent = "unknown"
    confidence: float = 0.0
    sub_intent: str | None = None
    classifier: str = "rule"
