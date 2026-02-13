#!/usr/bin/env bash
# sync.sh — Ingest new transcripts and push updated DB to GitHub
# Intended to be run by launchd daily or manually.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$REPO_DIR/db/sync.log"
DB_FILE="$REPO_DIR/db/observatory.sqlite"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_DIR"

log "=== Sync started ==="

# 1. Rebuild packages (picks up any parser/extractor changes)
log "Building packages..."
pnpm -r build >> "$LOG_FILE" 2>&1

# 2. Run ingestion
log "Running ingest..."
node packages/ingest/dist/index.js ingest >> "$LOG_FILE" 2>&1

# 3. Check if the DB actually changed
if git diff --quiet -- "$DB_FILE" 2>/dev/null; then
  log "No changes to observatory.sqlite — skipping push."
  log "=== Sync finished (no-op) ==="
  exit 0
fi

# 4. Commit and push
log "DB changed — committing and pushing..."
git add "$DB_FILE"
git commit -m "$(cat <<'EOF'
chore: daily observatory data refresh

Automated ingest of new AI coding assistant transcripts.
EOF
)"
git push origin main

log "=== Sync finished (pushed) ==="
