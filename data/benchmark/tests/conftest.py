"""Shared test fixtures for benchmark tests.

Supports running locally (without Databricks) and on Databricks clusters.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

try:
    import yaml

    HAS_YAML = True
except ImportError:
    HAS_YAML = False

from benchmark.extraction.types import VendorTaxonomy, VendorEntry


@pytest.fixture
def taxonomy() -> VendorTaxonomy:
    """Load vendor taxonomy from the repo's taxonomy/vendors.yaml."""
    taxonomy_path = Path(__file__).resolve().parents[3] / "taxonomy" / "vendors.yaml"
    if taxonomy_path.exists() and HAS_YAML:
        with open(taxonomy_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        vendors = [
            VendorEntry(
                canonical_id=v["canonical_id"],
                display_name=v["display_name"],
                synonyms=v.get("synonyms", []),
                category=v.get("category", ""),
                website=v.get("website", ""),
            )
            for v in data.get("vendors", [])
        ]
        return VendorTaxonomy(vendors=vendors)

    # Minimal fallback for CI
    return VendorTaxonomy(
        vendors=[
            VendorEntry(canonical_id="supabase", display_name="Supabase", synonyms=["supa"], category="database"),
            VendorEntry(canonical_id="neon", display_name="Neon", synonyms=["neon-db"], category="database"),
            VendorEntry(canonical_id="sentry", display_name="Sentry", synonyms=[], category="error_monitoring"),
        ]
    )


@pytest.fixture
def sample_claude_code_jsonl() -> str:
    """Minimal Claude Code JSONL for testing."""
    lines = [
        json.dumps(
            {
                "type": "user",
                "sessionId": "test-session-1",
                "timestamp": "2025-01-01T00:00:00Z",
                "message": {"role": "user", "content": "Set up a database for my Next.js app"},
            }
        ),
        json.dumps(
            {
                "type": "assistant",
                "sessionId": "test-session-1",
                "timestamp": "2025-01-01T00:00:01Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "I recommend Supabase for this. Let me set it up."},
                        {
                            "type": "tool_use",
                            "name": "Bash",
                            "id": "tu1",
                            "input": {"command": "npm install @supabase/supabase-js"},
                        },
                    ],
                },
            }
        ),
        json.dumps(
            {
                "type": "user",
                "sessionId": "test-session-1",
                "timestamp": "2025-01-01T00:00:02Z",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "tu1", "content": "added 42 packages"},
                    ],
                },
            }
        ),
    ]
    return "\n".join(lines)


@pytest.fixture
def sample_codex_cli_jsonl() -> str:
    """Minimal Codex CLI JSONL for testing."""
    lines = [
        json.dumps(
            {
                "type": "session_meta",
                "timestamp": "2025-01-01T00:00:00Z",
                "payload": {"id": "codex-session-1", "cwd": "/tmp/test", "model": "gpt-4o"},
            }
        ),
        json.dumps(
            {
                "type": "response_item",
                "timestamp": "2025-01-01T00:00:01Z",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Add Sentry error monitoring"}],
                },
            }
        ),
        json.dumps(
            {
                "type": "response_item",
                "timestamp": "2025-01-01T00:00:02Z",
                "payload": {
                    "type": "function_call",
                    "name": "shell",
                    "call_id": "call_1",
                    "arguments": '{"command": ["npm", "install", "@sentry/nextjs"]}',
                },
            }
        ),
    ]
    return "\n".join(lines)
