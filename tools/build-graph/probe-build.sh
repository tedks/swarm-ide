#!/usr/bin/env bash
set -euo pipefail
probe_out=$(readlink -m "$1")
cd "$(dirname "$(readlink -f "$2")")"
pnpm exec esbuild core/build-graph.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$probe_out"
