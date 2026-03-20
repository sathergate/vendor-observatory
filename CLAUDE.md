# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Vendor Observatory** — A system that measures which dev tools and vendors AI coding assistants (Claude Code, Codex CLI, Cursor) recommend, install, and configure during real developer sessions. Combines passive transcript analysis with active benchmarking. Revealed preference, not stated preference.

## Repo Structure

```
vendor-observatory/
├── packages/shared/       # Shared types, vendor extractor, package-map, normalizer, taxonomy loaders
├── packages/ingest/       # CLI: JSONL parsers, PostgreSQL writer, transcript scanner, stats
├── packages/benchmark/    # Benchmark prompts, adapters (Claude Code, Codex CLI, Cursor), runners
├── packages/worker/       # Long-running Fly.io service: onboarding jobs + benchmark queue poller
├── apps/web/              # Next.js 15 dashboard: benchmarks, vendor analytics, onboarding, search
├── taxonomy/              # Vendor taxonomy YAML + vendor-factors YAML (13-factor causal model)
└── data/benchmark/        # Databricks Asset Bundle: jobs, DLT pipelines, Python ETL
```

## Commands

```bash
pnpm install                    # Install all dependencies
pnpm -r build                   # Build all packages

# Ingest transcripts
node packages/ingest/dist/index.js ingest --source all
node packages/ingest/dist/index.js ingest --source claude-code
node packages/ingest/dist/index.js ingest --source codex-cli
node packages/ingest/dist/index.js ingest --dry-run --source all

# Stats
node packages/ingest/dist/index.js stats --by vendor
node packages/ingest/dist/index.js stats --by platform
node packages/ingest/dist/index.js stats --by category
node packages/ingest/dist/index.js stats --by action

# Benchmark CLI
node packages/benchmark/dist/index.js run --budget 25 --assistants claude_code,codex_cli,cursor
node packages/benchmark/dist/index.js list

# Prompt management (PostgreSQL)
node packages/ingest/dist/index.js prompts list
node packages/ingest/dist/index.js prompts add --id <id> --text <text> --category <cat>
node packages/ingest/dist/index.js prompts update --id <id> --text <text>
node packages/ingest/dist/index.js prompts delete --id <id>

# Web dashboard
pnpm --filter web dev           # Start dev server at http://localhost:3000

# Databricks
databricks bundle deploy -t dev     # Deploy bundle to dev
databricks bundle deploy -t prod    # Deploy bundle to prod
databricks bundle run create_benchmark_run -t prod  # Trigger benchmark run
```

## Architecture

### Data Flow — Transcript Ingestion
1. AI coding assistants write conversation transcripts to local JSONL files
2. Ingest CLI scans `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`, `~/.cursor-obs/sessions/**/*.jsonl`
3. Parsers extract turns (user/assistant messages, tool_use blocks, tool_result blocks)
4. Extraction engine detects vendor mentions via three tiers:
   - **Tier 1** (confidence 1.0): Package install commands → maps to canonical vendor IDs
   - **Tier 2** (confidence 0.9–0.95): Config signals (connection strings, env vars, CLI commands)
   - **Tier 3** (confidence 0.5–0.8): Text mentions matched against vendor taxonomy
5. Observations stored in PostgreSQL with per-session deduplication
6. Web dashboard reads PostgreSQL and renders analytics

### Data Flow — Benchmark System
1. Databricks job (`create_run.py`) runs daily at 6 AM UTC
2. Reads active prompts from Databricks `prompts` table, creates `benchmark_runs` row
3. Inserts prompt×agent pairs into PostgreSQL `worker_queue` (was Databricks, moved to PG to avoid SQL warehouse costs)
4. Worker service (Fly.io) polls `worker_queue` using `SELECT FOR UPDATE SKIP LOCKED`
5. Runs adapter (Claude Code / Codex CLI / Cursor Agent) in isolated `/tmp` workspace
6. Uploads transcript to Databricks UC Volumes (best-effort if Databricks vars set)
7. Updates task status, cost, duration in PostgreSQL
8. Ingest bridge writes observations from benchmark transcripts to PostgreSQL

### Data Flow — Onboarding
1. User submits website URL via web frontend
2. Worker claims `onboarding_jobs` row, runs URL analysis → fast → balanced → comprehensive benchmarks
3. Computes mention rates, platform coverage, AI readiness scores
4. Dashboard displays scorecard with recommendations

### Databricks Integration
- **Bundle config**: `data/benchmark/databricks.yml` (dev/prod targets, catalog `benchmarks`)
- **Tables in Databricks**: `benchmark_runs`, `prompts` (read by `create_run.py`)
- **Tables in PostgreSQL**: `worker_queue` (polled by worker)
- **UC Volumes**: Transcript storage (`/Volumes/benchmarks/default/transcripts/`)
- **Jobs**: `create_benchmark_run` (daily), `process_transcripts`, `seed_reference_data`
- **DLT Pipeline**: `benchmark_etl` for ETL transformations
- **Secrets**: `benchmark/database_url` (PostgreSQL connection for `create_run.py` via `dbutils.secrets.get`)

### Worker Service (Fly.io)
`packages/worker/` — deployed as Docker container on Fly.io (`vendor-observatory-worker`)
- **Onboarding loop**: Polls `onboarding_jobs` table for website analysis requests
- **Benchmark poller**: Polls `worker_queue` for benchmark tasks, runs adapters, uploads transcripts
- **Daily scheduler**: Checks if a daily benchmark should run, creates run entry
- **Health endpoint**: `GET /health` on port 8080
- **Deploy**: `fly deploy --config packages/worker/fly.toml --dockerfile packages/worker/Dockerfile` (from repo root)

### Vendor Taxonomy & Factors
- `taxonomy/vendors.yaml` — 60+ vendors across 12 categories with canonical IDs, display names, synonyms
- `taxonomy/vendor-factors.yaml` — 13-factor causal model scoring vendors on ecosystem position, integration speed, sentiment, training data presence, recency gradient, serverless compatibility, stack fit, free tier, docs quality, MCP integration, security, cost predictability, lock-in risk

## Tech Stack
- pnpm workspaces monorepo
- TypeScript (ESM, Node16 modules)
- Node 22
- Next.js 15 (App Router) + Tailwind CSS 4 for web
- PostgreSQL via pg (node-postgres)
- Python 3.10+ (Databricks jobs, psycopg2 for PG access)
- Databricks Asset Bundles (Delta Lake, UC Volumes, DLT)
- commander + chalk for CLI
- Fly.io for worker deployment

## Style Guide
See `style-guide.md` for the complete visual design system ("Annotated Instrument"). All UI work in `apps/web/` must follow this guide.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `ANTHROPIC_API_KEY` — Claude API key (required for enrichment & benchmarks)
- `OPENAI_API_KEY` — Optional, for Codex CLI adapter
- `DATABRICKS_HOST` / `DATABRICKS_TOKEN` — Optional, for transcript uploads to UC Volumes
- `DATABRICKS_CATALOG` / `DATABRICKS_SCHEMA` — Defaults: `benchmarks` / `prod`
- `DATABRICKS_WAREHOUSE_ID` — SQL warehouse ID (set in Dockerfile)
