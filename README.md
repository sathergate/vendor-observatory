# Vendor Observatory

Passive observation system that analyzes real AI coding assistant transcripts to measure which dev tools and vendors get recommended, installed, and configured during real developer sessions.

**Revealed preference, not stated preference** — no synthetic prompting, just parsing existing conversation transcripts from Claude Code, Codex CLI, and Cursor.

## How It Works

1. **Scan** — Finds JSONL transcript files from `~/.claude/projects/`, `~/.codex/sessions/`, and `~/.cursor-obs/sessions/`
2. **Parse** — Extracts turns, tool uses, and tool results from each session
3. **Extract** — Three-tier vendor detection:
   - **Tier 1**: Package installs (`npm install`, `pip install`, etc.) — confidence 1.0
   - **Tier 2**: Config signals (connection strings, env vars, CLI commands) — confidence 0.9–0.95
   - **Tier 3**: Text mentions matched against vendor taxonomy — confidence 0.5–0.8
4. **Enrich** — For benchmark sessions: intent classification, response context extraction, reasoning chain analysis, and optional LLM enrichment
5. **Store** — PostgreSQL database with per-session deduplication
6. **Analyze** — Cross-session divergence analysis, constraint influence, temporal drift detection
7. **Serve** — Next.js dashboard with vendor stats, platform comparison, benchmarks, and session drill-down

## Quickstart

```bash
pnpm install
pnpm -r build

# Set up PostgreSQL
export DATABASE_URL="postgresql://user:password@localhost:5432/observatory"

# Ingest transcripts
node packages/ingest/dist/index.js ingest --source all

# View stats
node packages/ingest/dist/index.js stats --by vendor
node packages/ingest/dist/index.js stats --by platform

# Run cross-session analysis
node packages/ingest/dist/index.js analyze

# Generate daily digest
node packages/ingest/dist/index.js digest

# Launch dashboard
pnpm dev
# → http://localhost:3000
```

## Architecture

```
packages/shared    — Types, vendor extractor, package map, taxonomy loader,
                     rejection extractor, intent classifier, LLM enrichment
packages/ingest    — Parsers (Claude Code, Codex CLI, Cursor), PostgreSQL writer,
                     scanner, analyzer, digest generator, CLI
apps/web           — Next.js 15 dashboard with API routes
taxonomy/          — Vendor taxonomy YAML (60 vendors, 12 categories)
```

### Data Flow

```
Transcripts (JSONL)
  ↓
Parser (claude-code / codex-cli / cursor)
  ↓
Vendor Extractor (3-tier detection) + Rejection Extractor
  ↓
Enrichment (intent classification, response context, optional LLM)
  ↓
PostgreSQL (sessions, observations, tool_actions, rejections, response_context)
  ↓
Web Dashboard + CLI Stats + Daily Digest
```

## Supported Platforms

| Platform | Transcript Location | Format |
|---|---|---|
| Claude Code | `~/.claude/projects/` | JSONL (user/assistant/system lines) |
| Codex CLI | `~/.codex/sessions/` | JSONL (session_meta/response_item/event_msg/turn_context) |
| Cursor | `~/.cursor-obs/sessions/` | JSONL (session_meta/user/assistant lines) |

## CLI Commands

```bash
# Ingest
obs ingest --source all                 # Scan all platforms
obs ingest --source claude-code         # Claude Code only
obs ingest --source codex-cli           # Codex CLI only
obs ingest --source cursor              # Cursor only
obs ingest --dry-run --source all       # Preview without writing

# Stats
obs stats --by vendor                   # Vendor frequency table
obs stats --by platform                 # Platform comparison
obs stats --by category                 # By work category
obs stats --by action                   # Mention → Install funnel

# Analysis
obs analyze --type all                  # Run all analyses
obs analyze --type divergences          # Platform divergence
obs analyze --type constraints          # Constraint influence
obs analyze --type drift                # Temporal drift

# Digest
obs digest --date 2026-03-16            # Generate daily digest
```

## Dashboard Pages

- **Overview** — Sessions, observations, unique vendors
- **Vendors** — Vendor frequency table with mention type breakdown
- **Platforms** — Claude Code vs Codex CLI vs Cursor comparison
- **Actions** — Mention → Recommend → Install funnel
- **Sessions** — Session list with drill-down to observations
- **Benchmarks** — Benchmark results by category, prompt, and vendor
- **Rejections** — Vendor rejection tracking
- **Insights** — Cross-session analysis results
- **Search** — Full-text search across rationales, trade-offs, and gotchas
- **Query** — Ad-hoc data exploration

## Tech Stack

- **Runtime**: Node 20+, TypeScript (ESM)
- **Web**: Next.js 15 (App Router), React, Tailwind CSS 4
- **Database**: PostgreSQL via pg (node-postgres)
- **CLI**: commander, chalk
- **Monorepo**: pnpm workspaces

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (required)
- `ANTHROPIC_API_KEY` — Enables optional LLM enrichment for benchmark sessions
