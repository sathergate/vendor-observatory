#!/bin/sh
set -e

# Authenticate Codex CLI if API key is available
if [ -n "$OPENAI_API_KEY" ]; then
  echo "$OPENAI_API_KEY" | codex login --with-api-key 2>/dev/null || true
fi

exec node packages/worker/dist/index.js
