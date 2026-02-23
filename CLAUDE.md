# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Vendor Observatory** — A passive observation system that analyzes AI coding assistant transcripts (Claude Code, Codex CLI, Cursor) to measure which dev tools and vendors get recommended, installed, and configured during real developer sessions. Revealed preference, not stated preference.

## Repo Structure

```
vendor-observatory/
├── packages/
│   ├── shared/              # @obs/shared — Types, vendor extractor, package-map, normalizer,
│   │   └── src/             #   taxonomy loader, reasoning extractor, LLM enrichment, intent classifier
│   ├── ingest/              # @obs/ingest — CLI: JSONL parsers, PostgreSQL writer, transcript scanner,
│   │   └── src/             #   cross-session analyzer, daily digest pipeline
│   │       └── parsers/     #   Platform-specific parsers (claude-code, codex-cli, cursor-agent)
│   └── benchmark/           # @obs/benchmark — Automated benchmark runner across AI assistants
│       └── src/
│           └── adapters/    #   Assistant adapters (claude-code, codex-cli, cursor-agent)
├── apps/
│   └── web/                 # Next.js 15 dashboard: vendor frequency, platform comparison, funnel,
│       └── src/             #   benchmark results, session drill-down, search, query engine
│           ├── app/         #   App Router pages and API routes
│           ├── components/  #   Shared React components (Sidebar, AuthHeader, etc.)
│           ├── context/     #   React contexts (VendorContext)
│           └── lib/         #   Server-side DB queries, auth, query engine, recommendations
├── taxonomy/                # Vendor taxonomy YAML (60 vendors, canonical IDs, synonyms)
├── scripts/                 # Operational scripts (sync, benchmark, migration, cron install)
└── .github/workflows/       # CI, Claude Code Action, daily benchmark, deploy verification
```

## Commands

```bash
# Setup
pnpm install                    # Install all dependencies
pnpm -r build                   # Build all packages (shared must build before ingest/benchmark)

# Ingest transcripts (requires DATABASE_URL)
node packages/ingest/dist/index.js ingest --source all
node packages/ingest/dist/index.js ingest --source claude-code
node packages/ingest/dist/index.js ingest --source codex-cli
node packages/ingest/dist/index.js ingest --source cursor
node packages/ingest/dist/index.js ingest --dry-run --source all

# View stats (requires DATABASE_URL)
node packages/ingest/dist/index.js stats --by vendor
node packages/ingest/dist/index.js stats --by platform
node packages/ingest/dist/index.js stats --by category
node packages/ingest/dist/index.js stats --by action

# Cross-session analysis (requires DATABASE_URL)
node packages/ingest/dist/index.js analyze --type all
node packages/ingest/dist/index.js analyze --type divergences
node packages/ingest/dist/index.js analyze --type constraints
node packages/ingest/dist/index.js analyze --type drift

# Daily digest (requires DATABASE_URL)
node packages/ingest/dist/index.js digest --date 2025-01-15

# Benchmark runner
node packages/benchmark/dist/index.js run --budget 25 --assistants claude_code,codex_cli,cursor
node packages/benchmark/dist/index.js list --category database
bash scripts/benchmark.sh                   # Build + run benchmarks
bash scripts/sync.sh                        # Build + benchmark + ingest (daily automation)

# Web dashboard
pnpm --filter web dev                       # Dev server at http://localhost:3000
pnpm --filter web build                     # Production build
pnpm --filter web test                      # Run vitest tests
pnpm --filter web test:watch                # Watch mode tests

# Lint
pnpm -r lint                                # Lint all packages
```

## Architecture

### Data Flow

1. AI coding assistants (Claude Code, Codex CLI, Cursor) write conversation transcripts to local JSONL files
2. Ingest CLI scans `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`, and `~/.cursor-obs/sessions/**/*.jsonl`
3. Parsers extract turns (user/assistant messages, tool_use blocks, tool_result blocks)
4. Extraction engine detects vendor mentions via three tiers:
   - **Tier 1**: Package install commands (`npm install @supabase/supabase-js` -> "supabase", installed) — confidence 1.0
   - **Tier 2**: Config signals (connection strings, env vars, import statements -> configured/implemented) — confidence 0.9-0.95
   - **Tier 3**: Text mentions matched against vendor taxonomy (recommended/compared/mentioned/rejected) — confidence 0.5-0.8
5. Observations stored in PostgreSQL with per-session deduplication
6. For benchmark sessions: enrichment pipeline extracts response context, reasoning chains, vendor dispositions, and intent classification
7. Cross-session analysis detects platform divergence, constraint influence, and temporal drift
8. Daily digest creates snapshots, detects vendor position changes, and generates alerts
9. Web dashboard reads PostgreSQL and renders analytics

### Cloud Mode (Production)

Cloud mode is the only mode supported in production. All data flows through PostgreSQL (`DATABASE_URL`). The SQLite/NFS approach is completely deprecated — references to `better-sqlite3`, `db/observatory.sqlite`, and NFS sync in `next.config.ts` and `deploy.yml` are vestigial and should not be relied upon.

### Transcript Sources

| Platform | Transcript Location | JSONL Line Types |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | user, assistant, progress, system |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` | session_meta, response_item, event_msg, turn_context |
| Cursor | `~/.cursor-obs/sessions/**/*.jsonl` | (custom agent format) |

### Vendor Taxonomy

`taxonomy/vendors.yaml` contains 60 vendors across 12 categories (database, ci_cd, observability, error_monitoring, feature_flags, secrets_management, developer_portal, llm_observability, incident_management, code_search, security_scanning, edge_compute) with canonical IDs, display names, synonyms, and website URLs. The extractor matches against this taxonomy for text-based vendor detection.

### Package Map

`packages/shared/src/package-map.ts` maps npm/pip package names to vendor canonical IDs for high-confidence install detection (Tier 1).

### Enrichment Pipeline

For benchmark sessions (detected by `obs-bench` in cwd or `__obs_bench__` branch), the ingest pipeline runs additional enrichment:

1. **Prompt metadata** — Loaded from sidecar `prompt-metadata.json` files (content tags, pattern tags, constraints, existing stack)
2. **Response context** — Regex-based extraction of primary vendor, rationale, trade-offs, gotchas, constraints addressed
3. **LLM enrichment** (optional, when `ENRICHMENT_ENABLED=true`) — Uses Claude API to extract reasoning chains, disqualification reasons, and confidence scores
4. **Intent classification** — Rule-based developer intent classification (evaluation, migration, greenfield, debugging, architecture, compliance, cost_optimization)
5. **Search index** — Full-text search via PostgreSQL tsvector over rationale, trade-offs, and gotchas

### Database Schema

PostgreSQL tables (auto-created by `ObservatoryDB.create()`):

| Table | Purpose |
|---|---|
| `ingested_files` | File-level deduplication tracking |
| `sessions` | One row per transcript session (id, platform, model, timestamps, is_benchmark) |
| `observations` | Vendor mentions with type, confidence, context (unique per session+vendor+type) |
| `tool_actions` | Tool use records (Bash commands, file writes, etc.) |
| `prompt_metadata` | Benchmark prompt content/pattern tags, constraints |
| `response_context` | Extracted vendor dispositions, rationale, trade-offs per session |
| `prompt_intents` | Developer intent classification per session |
| `search_index` | Full-text search with GIN-indexed tsvector |
| `cross_session_insights` | Cross-session divergence analysis results |
| `analysis_snapshots` | Daily snapshots for temporal drift detection |
| `daily_digests` | Post-benchmark narrative summaries and alerts |
| `auth_users` / `auth_sessions` | Simple cookie-based auth for the web dashboard |

### Benchmark System

`packages/benchmark` runs standardized prompts across multiple AI assistants to produce comparable vendor recommendation data:

- **Prompts** (`prompts.ts`) — Large benchmark prompt set across categories (database, auth, hosting, etc.) with metadata (content tags, pattern tags, constraints)
- **Adapters** — Platform-specific adapters that spawn CLI processes (Claude Code, Codex CLI, Cursor)
- **Runner** — Orchestrates runs with budget tracking, workspace isolation, and cost logging
- **Daily automation** — GitHub Actions workflow runs at 12:00 UTC daily with configurable budget/assistants

### Web Dashboard Pages

| Route | Description |
|---|---|
| `/` | Overview: session/observation/vendor counts, recent activity |
| `/vendors` | Vendor frequency table with mention type breakdown |
| `/platforms` | Claude Code vs Codex CLI vs Cursor comparison |
| `/actions` | Mention -> Recommend -> Install funnel |
| `/benchmarks` | Benchmark results by category, prompt, and vendor |
| `/benchmarks/[category]` | Category-specific benchmark deep-dive |
| `/benchmarks/prompts` | Prompt-level benchmark results |
| `/benchmarks/vendors` | Vendor-level benchmark results |
| `/benchmarks/vendors/[vendor]` | Single vendor deep-dive |
| `/sessions` | Session list with drill-down |
| `/sessions/[id]` | Single session observations |
| `/insights` | Cross-session analysis and digest summaries |
| `/search` | Full-text search across rationale/trade-offs/gotchas |
| `/query` | Ad-hoc query engine (win rate, constraint correlation, head-to-head, etc.) |
| `/login`, `/signup` | Authentication pages |

### API Routes

All API routes live under `apps/web/src/app/api/` and return JSON:

- `/api/health` — Health check
- `/api/vendors` — Vendor stats
- `/api/platforms` — Platform comparison
- `/api/benchmarks` — Benchmark results
- `/api/sessions`, `/api/sessions/[id]` — Session data
- `/api/actions` — Action funnel data
- `/api/search` — Full-text search
- `/api/query` — Composable query engine (win rate, constraint correlation, platform comparison, head-to-head, prompt difficulty, what-if)
- `/api/enrichment` — Enrichment data
- `/api/auth/*` — Auth endpoints (login, signup, logout, me)

### Authentication

Simple cookie-based auth (`session_token` cookie, 30-day expiry). Middleware protects all routes except `/`, `/login`, `/signup`, and `/api/auth/*`. API routes return 401; pages redirect to `/login`.

## Tech Stack

- **Monorepo**: pnpm 9+ workspaces (packages/\*, apps/\*)
- **Language**: TypeScript 5 (ESM, Node16 module resolution for packages; bundler resolution for Next.js)
- **Runtime**: Node 22+ (CI), Node 20+ (minimum)
- **Web**: Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- **Database**: PostgreSQL via `pg` (node-postgres) — cloud mode only in production
- **CLI**: commander + chalk
- **AI SDK**: `@anthropic-ai/sdk` (for LLM enrichment in shared package)
- **Testing**: Vitest + Testing Library + jsdom (web app only, `pnpm --filter web test`)
- **Deployment**: Vercel (Next.js), GitHub Actions (CI, daily benchmark)

## Build Order

Packages have workspace dependencies that require a specific build order:

1. `@obs/shared` — No internal deps, must build first
2. `@obs/ingest` — Depends on `@obs/shared`
3. `@obs/benchmark` — Depends on `@obs/shared`
4. `web` — Vercel build rebuilds shared first (see `vercel.json`)

`pnpm -r build` handles this automatically via topological sort.

## Environment Variables

| Variable | Required | Used By | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes (production) | ingest, web, scripts | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | For benchmarks/enrichment | benchmark, shared | Claude API key for LLM enrichment |
| `OPENAI_API_KEY` | For Codex benchmarks | benchmark | OpenAI/Codex CLI auth |
| `CURSOR_API_KEY` | For Cursor benchmarks | benchmark | Cursor agent auth |
| `ENRICHMENT_ENABLED` | Optional | shared | Set to `true` to enable LLM-powered enrichment |
| `CODEX_MODEL` | Optional | benchmark | Override model for Codex CLI |

## CI/CD

- **CI** (`ci.yml`) — Runs on push/PR to main: install, `pnpm --filter web test`
- **Claude Code** (`claude.yml`) — Claude Code Action for PR review and issue triage
- **Daily Benchmark** (`daily-benchmark.yml`) — Runs at 12:00 UTC daily: install CLIs, run benchmarks, ingest, analyze, generate digest, commit results
- **Deploy Verification** (`deploy.yml`) — Verifies Vercel deployment health (vestigial, references SQLite)

## Key Conventions

### TypeScript

- ESM throughout (`"type": "module"` in all packages)
- Base tsconfig at root extends into packages via `"extends": "../../tsconfig.base.json"`
- Strict mode enabled everywhere
- Web app uses `"moduleResolution": "bundler"` (Next.js); packages use `"module": "Node16"`
- Path alias `@/*` maps to `./src/*` in the web app

### Database Access

- Ingest package: `ObservatoryDB` class with connection pooling, transactions, and auto-schema creation
- Web app: Lazy `Pool` initialization per module (`db.ts`, `auth.ts`, `query-engine.ts`) with graceful fallback on connection failure
- All tables use `CREATE TABLE IF NOT EXISTS` — no separate migration system

### Vendor IDs

- All vendor references use `canonical_id` from `taxonomy/vendors.yaml` (e.g., `"supabase"`, `"neon"`, `"cloudflare-workers"`)
- The `normalizer.ts` module handles fuzzy matching of raw vendor names to canonical IDs
- Package map provides deterministic npm/pip package -> vendor mapping

### Mention Types (Observation Hierarchy)

From strongest to weakest signal: `installed` > `configured` > `implemented` > `recommended` > `compared` > `mentioned` > `rejected`

### Error Handling

- Enrichment, search indexing, and LLM enrichment are all non-fatal — failures are logged but don't break ingestion
- Web DB modules return empty/default data on connection failure rather than throwing
- `continue-on-error: true` used in CI workflows for optional steps

### Testing

- Tests live alongside source files (e.g., `middleware.test.ts`, `auth.test.ts`, `db.test.ts`, `AuthHeader.test.tsx`)
- Vitest with `@vitejs/plugin-react` for component tests
- Run with `pnpm --filter web test`
- CI runs tests on every push/PR to main

## Deprecated / Vestigial

- **SQLite / better-sqlite3** — The original storage backend. Fully replaced by PostgreSQL. References in `next.config.ts` (`outputFileTracingIncludes` for `observatory.sqlite`), `.gitignore` (`db/*.sqlite*`), `deploy.yml`, `README.md`, and root `package.json` (`onlyBuiltDependencies`) are vestigial.
- **NFS sync** — Any references to NFS-based data synchronization are completely deprecated.
- **`db/` directory** — Previously held `observatory.sqlite`. Now only used for `bench-cost.jsonl` logs and sync logs.
- **`scripts/migrate-sqlite-to-pg.mjs`** — One-shot migration script from SQLite to PostgreSQL, no longer needed.
- **Local mode** — Local-only mode is only for testing; cloud mode is the only production path.
