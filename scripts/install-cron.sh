#!/usr/bin/env bash
# install-cron.sh — Install a macOS LaunchAgent to run sync.sh daily at 6 AM

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_SCRIPT="$REPO_DIR/scripts/sync.sh"
PLIST_LABEL="com.vendor-observatory.sync"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

# Make sync.sh executable
chmod +x "$SYNC_SCRIPT"

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
    <integer>6</integer>
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
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST

# Load the plist
launchctl load "$PLIST_PATH"

echo ""
echo "✅ LaunchAgent installed and loaded."
echo "   Label:    $PLIST_LABEL"
echo "   Schedule: Daily at 6:00 AM"
echo "   Plist:    $PLIST_PATH"
echo ""
echo "To run immediately:  bash $SYNC_SCRIPT"
echo "To uninstall:        launchctl unload $PLIST_PATH && rm $PLIST_PATH"
