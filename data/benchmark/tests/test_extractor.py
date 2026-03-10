"""Tests for the vendor extraction engine."""

from __future__ import annotations

from benchmark.extraction.extractor import extract_vendor_mentions
from benchmark.extraction.rejection_extractor import extract_vendor_rejections
from benchmark.extraction.reasoning_extractor import extract_response_context
from benchmark.extraction.types import VendorTaxonomy
from benchmark.parsers.types import ParsedTurn, ToolUseRecord


def test_tier1_install_detection(taxonomy: VendorTaxonomy):
    """Tier 1: npm install command → installed mention."""
    turn = ParsedTurn(
        role="assistant",
        text_content="",
        tool_uses=[
            ToolUseRecord(
                tool_name="Bash",
                input={"command": "npm install @supabase/supabase-js"},
                id="tu1",
            )
        ],
        timestamp="2025-01-01T00:00:00Z",
    )

    mentions = extract_vendor_mentions(turn, taxonomy, "Set up a database")
    assert len(mentions) >= 1
    supabase_mentions = [m for m in mentions if m.vendor_canonical_id == "supabase"]
    assert len(supabase_mentions) >= 1
    assert supabase_mentions[0].mention_type == "installed"
    assert supabase_mentions[0].confidence == 1.0


def test_tier2_env_var_detection(taxonomy: VendorTaxonomy):
    """Tier 2: env var written → configured mention."""
    turn = ParsedTurn(
        role="assistant",
        text_content="",
        tool_uses=[
            ToolUseRecord(
                tool_name="Write",
                input={"content": "SUPABASE_URL=https://xxx.supabase.co\nSUPABASE_ANON_KEY=eyJ..."},
                id="tu1",
            )
        ],
        timestamp="2025-01-01T00:00:00Z",
    )

    mentions = extract_vendor_mentions(turn, taxonomy, None)
    supabase_mentions = [m for m in mentions if m.vendor_canonical_id == "supabase"]
    assert len(supabase_mentions) >= 1
    configured = [m for m in supabase_mentions if m.mention_type == "configured"]
    assert len(configured) >= 1


def test_tier3_text_mention(taxonomy: VendorTaxonomy):
    """Tier 3: text mention in assistant response."""
    turn = ParsedTurn(
        role="assistant",
        text_content="I recommend Supabase for this project. It has great real-time features.",
        timestamp="2025-01-01T00:00:00Z",
    )

    mentions = extract_vendor_mentions(turn, taxonomy, None)
    supabase_mentions = [m for m in mentions if m.vendor_canonical_id == "supabase"]
    assert len(supabase_mentions) == 1
    assert supabase_mentions[0].mention_type == "recommended"
    assert supabase_mentions[0].confidence == 0.8


def test_tier3_rejection_context(taxonomy: VendorTaxonomy):
    """Tier 3: rejection phrase in context."""
    turn = ParsedTurn(
        role="assistant",
        text_content="I wouldn't recommend Neon for this use case due to limited branching support.",
        timestamp="2025-01-01T00:00:00Z",
    )

    mentions = extract_vendor_mentions(turn, taxonomy, None)
    neon_mentions = [m for m in mentions if m.vendor_canonical_id == "neon"]
    assert len(neon_mentions) == 1
    assert neon_mentions[0].mention_type == "rejected"


def test_deduplication(taxonomy: VendorTaxonomy):
    """Same vendor+mentionType should be deduplicated within a turn."""
    turn = ParsedTurn(
        role="assistant",
        text_content="",
        tool_uses=[
            ToolUseRecord(tool_name="Bash", input={"command": "npm install @supabase/supabase-js"}, id="tu1"),
            ToolUseRecord(tool_name="Bash", input={"command": "npm install @supabase/ssr"}, id="tu2"),
        ],
        timestamp="2025-01-01T00:00:00Z",
    )

    mentions = extract_vendor_mentions(turn, taxonomy, None)
    supabase_installed = [m for m in mentions if m.vendor_canonical_id == "supabase" and m.mention_type == "installed"]
    assert len(supabase_installed) == 1  # deduplicated


def test_rejection_extractor(taxonomy: VendorTaxonomy):
    """Rejection extractor identifies vendor rejections."""
    turns = [
        ParsedTurn(
            role="assistant",
            text_content="I wouldn't recommend Neon because it's too expensive for this use case. Instead, try Supabase.",
            timestamp="2025-01-01T00:00:00Z",
        ),
    ]

    rejections = extract_vendor_rejections(turns, taxonomy)
    assert len(rejections) >= 1
    neon_rej = [r for r in rejections if r.vendor_canonical_id == "neon"]
    assert len(neon_rej) == 1
    assert neon_rej[0].rejection_reason == "too_expensive"


def test_response_context_extraction(taxonomy: VendorTaxonomy):
    """Response context extractor identifies primary vendor and implementation."""
    turns = [
        ParsedTurn(
            role="assistant",
            text_content="I recommend Supabase for this project.\n\n```bash\nnpm install @supabase/supabase-js\n```",
            timestamp="2025-01-01T00:00:00Z",
        ),
    ]

    ctx = extract_response_context(turns, taxonomy, ["serverless_compatible"])
    assert ctx.primary_vendor == "supabase"
    assert ctx.is_implemented is True
