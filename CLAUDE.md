# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Vendor Observatory** — A passive observation system that analyzes AI coding assistant transcripts (Claude Code, Codex CLI) to measure which dev tools and vendors get recommended, installed, and configured during real developer sessions. Revealed preference, not stated preference.

## Repo Structure

```
vendor-observatory/
├── packages/shared/     # Shared types, vendor extractor, package-map, normalizer
├── packages/ingest/     # CLI: JSONL parsers, PostgreSQL writer, transcript scanner
├── apps/web/            # Next.js dashboard: vendor frequency, platform comparison, funnel
└── taxonomy/            # Vendor taxonomy YAML (60 vendors, canonical IDs, synonyms)
```

## Commands

```bash
pnpm install                    # Install all dependencies
pnpm -r build                   # Build all packages

# Ingest transcripts
node packages/ingest/dist/index.js ingest --source all      # Scan Claude Code + Codex CLI transcripts
node packages/ingest/dist/index.js ingest --source claude-code
node packages/ingest/dist/index.js ingest --source codex-cli
node packages/ingest/dist/index.js ingest --dry-run --source all  # Preview without writing

# View stats
node packages/ingest/dist/index.js stats --by vendor         # Vendor frequency table
node packages/ingest/dist/index.js stats --by platform        # Platform comparison
node packages/ingest/dist/index.js stats --by category        # By work category
node packages/ingest/dist/index.js stats --by action          # By mention type

# Web dashboard
pnpm --filter web dev           # Start dev server at http://localhost:3000
```

## Architecture

### Data Flow
1. AI coding assistants (Claude Code, Codex CLI) write conversation transcripts to local JSONL files
2. Ingest CLI scans `~/.claude/projects/**/*.jsonl` and `~/.codex/sessions/**/*.jsonl`
3. Parsers extract turns (user/assistant messages, tool_use blocks, tool_result blocks)
4. Extraction engine detects vendor mentions via three tiers:
   - **Tier 1**: Package install commands (`npm install @supabase/supabase-js` → "supabase", installed)
   - **Tier 2**: Config signals (connection strings, env vars, import statements → configured/implemented)
   - **Tier 3**: Text mentions matched against vendor taxonomy (recommended/compared/mentioned/rejected)
5. Observations stored in PostgreSQL with per-session deduplication
6. Web dashboard reads PostgreSQL and renders analytics

### Transcript Sources
- **Claude Code**: `~/.claude/projects/**/*.jsonl` — line types: user, assistant, progress, system
- **Codex CLI**: `~/.codex/sessions/**/*.jsonl` — line types: session_meta, response_item, event_msg, turn_context

### Vendor Taxonomy
`taxonomy/vendors.yaml` contains 60 vendors across 12 categories with canonical IDs, display names, and synonyms. The extractor matches against this taxonomy for text-based vendor detection.

### Package Map
`packages/shared/src/package-map.ts` maps npm/pip package names to vendor canonical IDs for high-confidence install detection.

## Tech Stack
- pnpm workspaces monorepo
- TypeScript (ESM, Node16 modules)
- Node 20+
- Next.js 15 (App Router) + Tailwind CSS 4 for web
- PostgreSQL via pg (node-postgres)
- commander for CLI
- chalk for CLI output

## Style Guide
See `style-guide.md` for the complete visual design system ("Annotated Instrument"). All UI work in `apps/web/` must follow this guide — typography (JetBrains Mono for data, Geist Sans for chrome), color palette (dark-first with CSS custom properties), spacing (4px base unit), chart conventions, component patterns, voice/language rules, and interaction principles.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (e.g. `postgresql://user:password@host:5432/observatory`)
