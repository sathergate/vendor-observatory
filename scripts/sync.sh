#!/usr/bin/env bash
# sync.sh — Run benchmarks and ingest transcripts into PostgreSQL
# Intended to be run by launchd daily or manually.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$REPO_DIR/db/sync.log"

# Source .env.local if it exists (for DATABASE_URL, API keys, etc.)
if [[ -f "$REPO_DIR/.env.local" ]]; then
  set -a; source "$REPO_DIR/.env.local"; set +a
fi

# Require DATABASE_URL — data now goes to PostgreSQL, not a git-committed SQLite file
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Set it in .env.local or your environment." >&2
  exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_DIR"

log "=== Sync started ==="

# 1. Rebuild packages (picks up any parser/extractor changes)
log "Building packages..."
pnpm -r build >> "$LOG_FILE" 2>&1

# 2. Run daily benchmark (generates new transcripts across all assistants)
log "Running daily benchmark..."
node packages/benchmark/dist/index.js run --budget 25 >> "$LOG_FILE" 2>&1 || log "Benchmark run had errors (continuing...)"

# 3. Wait for transcripts to be flushed to disk
sleep 5

# 4. Run ingestion (picks up both organic AND benchmark transcripts, writes to PostgreSQL)
log "Running ingest..."
node packages/ingest/dist/index.js ingest >> "$LOG_FILE" 2>&1

log "=== Sync finished ==="
