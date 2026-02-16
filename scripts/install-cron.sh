#!/usr/bin/env bash
# install-cron.sh — Install a macOS LaunchAgent to run sync.sh daily at 5 AM
# (5 AM to allow ~60-90 min for benchmarks before the 6:30 AM typical wake time)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_SCRIPT="$REPO_DIR/scripts/sync.sh"
PLIST_LABEL="com.vendor-observatory.sync"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
ENV_LOCAL="$REPO_DIR/.env.local"

# Source .env.local if it exists (for CURSOR_API_KEY etc.)
if [[ -f "$ENV_LOCAL" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_LOCAL"; set +a
fi

# Make scripts executable
chmod +x "$SYNC_SCRIPT"
chmod +x "$REPO_DIR/scripts/benchmark.sh" 2>/dev/null || true

# Ensure LaunchAgents dir exists
mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing plist if present
if launchctl list "$PLIST_LABEL" &>/dev/null; then
  echo "Unloading existing plist..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Write plist
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SYNC_SCRIPT}</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>5</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${REPO_DIR}/db/sync-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>${REPO_DIR}/db/sync-launchd.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${HOME}/.local/bin</string>
    <key>CURSOR_API_KEY</key>
    <string>${CURSOR_API_KEY:-}</string>
  </dict>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST

# Load the plist
launchctl load "$PLIST_PATH"

echo ""
echo "LaunchAgent installed and loaded."
echo "   Label:    $PLIST_LABEL"
echo "   Schedule: Daily at 5:00 AM"
echo "   Plist:    $PLIST_PATH"
echo ""
echo "To run immediately:  bash $SYNC_SCRIPT"
echo "To run benchmark only:  bash $REPO_DIR/scripts/benchmark.sh"
echo "To uninstall:        launchctl unload $PLIST_PATH && rm $PLIST_PATH"
