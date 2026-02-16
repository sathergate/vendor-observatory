#!/usr/bin/env bash
# sync.sh — Run benchmarks, ingest transcripts, and push updated DB to GitHub
# Intended to be run by launchd daily or manually.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$REPO_DIR/db/sync.log"
DB_FILE="$REPO_DIR/db/observatory.sqlite"

# Source .env.local if it exists (for CURSOR_API_KEY etc.)
if [[ -f "$REPO_DIR/.env.local" ]]; then
  set -a; source "$REPO_DIR/.env.local"; set +a
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_DIR"

log "=== Sync started ==="

# 1. Rebuild packages (picks up any parser/extractor changes)
log "Building packages..."
pnpm -r build >> "$LOG_FILE" 2>&1

# 2. Run daily benchmark (generates new transcripts across all assistants)
log "Running daily benchmark..."
node packages/benchmark/dist/index.js run --budget 25 --timeout 120000 >> "$LOG_FILE" 2>&1 || log "Benchmark run had errors (continuing...)"

# 3. Wait for transcripts to be flushed to disk
sleep 5

# 4. Run ingestion (picks up both organic AND benchmark transcripts)
log "Running ingest..."
node packages/ingest/dist/index.js ingest >> "$LOG_FILE" 2>&1

# 5. Check if the DB actually changed
if git diff --quiet -- "$DB_FILE" 2>/dev/null; then
  log "No changes to observatory.sqlite — skipping push."
  log "=== Sync finished (no-op) ==="
  exit 0
fi

# 6. Commit and push
log "DB changed — committing and pushing..."
git add "$DB_FILE"
git commit -m "$(cat <<'EOF'
chore: daily observatory data refresh

Automated benchmark + organic transcript ingest.
EOF
)"
git push origin main

log "=== Sync finished (pushed) ==="
