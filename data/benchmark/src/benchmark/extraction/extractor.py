"""Vendor mention extraction engine — 3-tier extraction from transcript turns.

Port of packages/shared/src/extractor.ts
"""

from __future__ import annotations

import json
import re
from typing import Callable

from ..parsers.types import ParsedTurn
from .package_map import resolve_package_to_vendor as _resolve_static
from .types import VendorMention, VendorTaxonomy

# ── Package Manager Patterns ────────────────────────────────────────

INSTALL_PATTERNS = [
    re.compile(r"(?:npm\s+install|npm\s+i|npx)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)"),
    re.compile(r"(?:pnpm\s+add|pnpm\s+install)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)"),
    re.compile(r"(?:yarn\s+add)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)"),
    re.compile(r"(?:pip\s+install|pip3\s+install)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)"),
    re.compile(r"(?:brew\s+install)\s+([^\s|&;]+)"),
    re.compile(r"(?:docker\s+pull)\s+([^\s|&;]+)"),
]

# ── Connection String Patterns ──────────────────────────────────────

CONNECTION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"neon\.tech", re.I), "neon"),
    (re.compile(r"supabase\.co", re.I), "supabase"),
    (re.compile(r"supabase\.com", re.I), "supabase"),
    (re.compile(r"planetscale\.com", re.I), "planetscale"),
    (re.compile(r"turso\.io", re.I), "turso"),
    (re.compile(r"cockroachlabs\.cloud", re.I), "cockroachdb"),
    (re.compile(r"upstash\.io", re.I), "upstash"),
    (re.compile(r"xata\.sh", re.I), "xata"),
    (re.compile(r"fauna\.com", re.I), "fauna"),
    (re.compile(r"convex\.cloud", re.I), "convex"),
    (re.compile(r"railway\.app", re.I), "railway-postgres"),
    (re.compile(r"vercel\.app", re.I), "vercel-edge-functions"),
    (re.compile(r"fly\.dev", re.I), "fly-io"),
    (re.compile(r"workers\.dev", re.I), "cloudflare-workers"),
    (re.compile(r"deno\.dev", re.I), "deno-deploy"),
]

# ── ENV Var Patterns ────────────────────────────────────────────────

ENV_VAR_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"SUPABASE_URL|SUPABASE_KEY|SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE", re.I), "supabase"),
    (re.compile(r"NEON_DATABASE_URL|NEON_DB_URL", re.I), "neon"),
    (re.compile(r"TURSO_DATABASE_URL|TURSO_AUTH_TOKEN", re.I), "turso"),
    (re.compile(r"PLANETSCALE_|DATABASE_URL.*planetscale", re.I), "planetscale"),
    (re.compile(r"UPSTASH_REDIS_URL|UPSTASH_REDIS_TOKEN", re.I), "upstash"),
    (re.compile(r"SENTRY_DSN|NEXT_PUBLIC_SENTRY", re.I), "sentry"),
    (re.compile(r"DATADOG_API_KEY|DD_API_KEY", re.I), "datadog"),
    (re.compile(r"NEW_RELIC_LICENSE_KEY", re.I), "new-relic"),
    (re.compile(r"LAUNCHDARKLY_SDK_KEY|LD_SDK_KEY", re.I), "launchdarkly"),
    (re.compile(r"HONEYCOMB_API_KEY", re.I), "honeycomb"),
    (re.compile(r"AXIOM_TOKEN|AXIOM_DATASET", re.I), "axiom"),
    (re.compile(r"CLERK_SECRET_KEY|NEXT_PUBLIC_CLERK", re.I), "clerk"),
    (re.compile(r"AUTH0_SECRET|AUTH0_DOMAIN", re.I), "auth0"),
    (re.compile(r"CONVEX_URL|CONVEX_DEPLOYMENT", re.I), "convex"),
    (re.compile(r"LANGFUSE_SECRET_KEY|LANGFUSE_PUBLIC_KEY", re.I), "langfuse"),
    (re.compile(r"CLOUDFLARE_API_TOKEN|CF_API_TOKEN", re.I), "cloudflare-workers"),
    (re.compile(r"FLY_API_TOKEN", re.I), "fly-io"),
    (re.compile(r"DOPPLER_TOKEN", re.I), "doppler"),
    (re.compile(r"INFISICAL_TOKEN", re.I), "infisical"),
    (re.compile(r"SNYK_TOKEN", re.I), "snyk"),
    (re.compile(r"FAUNA_SECRET", re.I), "fauna"),
]

# ── CLI Command Patterns ────────────────────────────────────────────

CLI_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bsupabase\s+(?:init|start|link|db\s+push|migration)", re.I), "supabase"),
    (re.compile(r"\bneon\s+(?:databases|branches|connection-string)", re.I), "neon"),
    (re.compile(r"\bturso\s+(?:db|auth|group)", re.I), "turso"),
    (re.compile(r"\bwrangler\s+(?:dev|deploy|publish|init)", re.I), "cloudflare-workers"),
    (re.compile(r"\bflyctl\s+|fly\s+(?:deploy|launch|scale)", re.I), "fly-io"),
    (re.compile(r"\bdagger\s+(?:run|call)", re.I), "dagger"),
    (re.compile(r"\bvercel\s+(?:deploy|dev|env|link)", re.I), "vercel-edge-functions"),
    (re.compile(r"\bnetlify\s+(?:deploy|dev|init)", re.I), "netlify"),
    (re.compile(r"\bsentry-cli\s+", re.I), "sentry"),
    (re.compile(r"\bdoppler\s+(?:run|setup|secrets)", re.I), "doppler"),
    (re.compile(r"\binfisical\s+(?:init|run|secrets)", re.I), "infisical"),
]

# ── Context Phrases ─────────────────────────────────────────────────

COMPARISON_PHRASES = [
    re.compile(r"(?:compared?\s+to|versus|vs\.?|alternatively|or\s+you\s+could\s+use|another\s+option\s+is|instead\s+of)", re.I),
]

REJECTION_PHRASES = [
    re.compile(
        r"(?:(?:I\s+)?(?:wouldn't|would\s+not|don't|do\s+not)\s+recommend|avoid|stay\s+away\s+from"
        r"|not\s+(?:a\s+good|the\s+best)\s+(?:choice|option|fit)|(?:downside|drawback|limitation)s?\s+of)",
        re.I,
    ),
]

RECOMMENDATION_PHRASES = [
    re.compile(
        r"(?:I\s+(?:recommend|suggest)|you\s+(?:should|could)\s+use"
        r"|(?:great|good|excellent|best|ideal)\s+(?:choice|option|fit)|let's\s+use|we(?:'ll)?\s+use)",
        re.I,
    ),
]

IMPORT_PATTERN = re.compile(r"""(?:import\s+.*?from\s+['"]|require\s*\(\s*['"])([^'"]+)['"]""")


def extract_vendor_mentions(
    turn: ParsedTurn,
    taxonomy: VendorTaxonomy,
    user_prompt_snippet: str | None,
    *,
    package_resolver: Callable[[str], str | None] | None = None,
) -> list[VendorMention]:
    """Extract vendor mentions from a single turn (user or assistant).

    Returns a list of VendorMentions with deduplication within the turn.
    """
    resolve_package = package_resolver or _resolve_static
    mentions: list[VendorMention] = []
    seen: set[str] = set()

    def add_mention(
        vendor_canonical_id: str,
        vendor_raw: str,
        mention_type: str,
        confidence: float,
        context_snippet: str,
        timestamp: str,
    ) -> None:
        key = f"{vendor_canonical_id}:{mention_type}"
        if key in seen:
            return
        seen.add(key)

        entry = next((v for v in taxonomy.vendors if v.canonical_id == vendor_canonical_id), None)
        work_category = entry.category if entry else "other"

        mentions.append(
            VendorMention(
                vendor_canonical_id=vendor_canonical_id,
                vendor_raw=vendor_raw,
                mention_type=mention_type,  # type: ignore[arg-type]
                confidence=confidence,
                context_snippet=context_snippet,
                user_prompt_snippet=user_prompt_snippet,
                timestamp=timestamp,
                work_category=work_category,
            )
        )

    # ── Tier 1: Package install signals from tool_use blocks ────────
    for tool_use in turn.tool_uses:
        command = _get_command_from_tool_use(tool_use)
        if command:
            for pattern in INSTALL_PATTERNS:
                for match in pattern.finditer(command):
                    pkg_str = match.group(1)
                    pkgs = [p for p in pkg_str.split() if p and not p.startswith("-")]
                    for pkg in pkgs:
                        vendor_id = resolve_package(pkg)
                        if vendor_id:
                            add_mention(vendor_id, pkg, "installed", 1.0, command[:200], turn.timestamp)

            # Check CLI command patterns
            for pattern, vendor in CLI_PATTERNS:
                if pattern.search(command):
                    add_mention(vendor, command[:80], "configured", 0.9, command[:200], turn.timestamp)

    # ── Tier 2: Configuration signals from tool_use (Write/Edit) ────
    for tool_use in turn.tool_uses:
        content = _get_write_content_from_tool_use(tool_use)
        if not content:
            continue

        for pattern, vendor in CONNECTION_PATTERNS:
            if pattern.search(content):
                add_mention(vendor, pattern.pattern, "configured", 0.95, content[:200], turn.timestamp)

        for pattern, vendor in ENV_VAR_PATTERNS:
            if pattern.search(content):
                add_mention(vendor, pattern.pattern, "configured", 0.9, content[:200], turn.timestamp)

        # Check import statements → "implemented"
        for im in IMPORT_PATTERN.finditer(content):
            pkg = im.group(1)
            vendor_id = resolve_package(pkg)
            if vendor_id:
                add_mention(vendor_id, pkg, "implemented", 0.9, content[:200], turn.timestamp)

    # ── Tier 3: Text mentions from assistant text ─────────────────
    if turn.role == "assistant" and turn.text_content:
        _extract_text_mentions(turn.text_content, taxonomy, turn.timestamp, add_mention)

    return mentions


def _extract_text_mentions(
    text: str,
    taxonomy: VendorTaxonomy,
    timestamp: str,
    add_mention: Callable,
) -> None:
    """Extract vendor mentions from free text using taxonomy matching."""
    for vendor in taxonomy.vendors:
        terms = [vendor.display_name] + vendor.synonyms

        for term in terms:
            if len(term) < 3:
                continue

            escaped = re.escape(term)
            regex = re.compile(rf"\b{escaped}\b", re.I)
            match = regex.search(text)
            if not match:
                continue

            start_idx = max(0, match.start() - 100)
            end_idx = min(len(text), match.end() + 100)
            context = text[start_idx:end_idx]

            mention_type = "mentioned"
            confidence = 0.5

            if any(p.search(context) for p in REJECTION_PHRASES):
                mention_type = "rejected"
                confidence = 0.7
            elif any(p.search(context) for p in COMPARISON_PHRASES):
                mention_type = "compared"
                confidence = 0.7
            elif any(p.search(context) for p in RECOMMENDATION_PHRASES):
                mention_type = "recommended"
                confidence = 0.8

            add_mention(vendor.canonical_id, match.group(0), mention_type, confidence, context, timestamp)
            break  # Only match each vendor once per text block


def _get_command_from_tool_use(tool_use) -> str | None:
    """Extract command string from a tool_use record."""
    if tool_use.tool_name == "Bash" and isinstance(tool_use.input.get("command"), str):
        return tool_use.input["command"]
    if tool_use.tool_name in ("shell", "shell_command"):
        cmd = tool_use.input.get("command")
        if isinstance(cmd, list):
            return " ".join(str(c) for c in cmd)
        if isinstance(cmd, str):
            return cmd
        args = tool_use.input.get("arguments")
        if isinstance(args, str):
            try:
                parsed = json.loads(args)
                if isinstance(parsed.get("command"), list):
                    return " ".join(str(c) for c in parsed["command"])
            except (json.JSONDecodeError, TypeError):
                pass
    return None


def _get_write_content_from_tool_use(tool_use) -> str | None:
    """Extract written file content from a tool_use record."""
    if tool_use.tool_name in ("Write", "Edit"):
        content = tool_use.input.get("content")
        if isinstance(content, str):
            return content
        new_string = tool_use.input.get("new_string")
        if isinstance(new_string, str):
            return new_string
        return None
    if tool_use.tool_name == "apply_patch":
        raw = tool_use.input.get("raw")
        return raw if isinstance(raw, str) else None
    return None
