#!/usr/bin/env bash
set -euo pipefail
progress_probe_out=$(readlink -m "$1")
cd "$(dirname "$(readlink -f "$2")")"
pnpm exec esbuild tools/build-graph/progress-probe-entry.mjs --bundle --platform=node --format=cjs --target=node22 --outfile="$progress_probe_out"
