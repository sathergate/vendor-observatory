#!/usr/bin/env bash
# benchmark.sh — Run the benchmark suite manually (without ingest/push)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "Building packages..."
pnpm -r build

echo ""
node packages/benchmark/dist/index.js run "$@"
