#!/usr/bin/env bash
set -euo pipefail
output=$1
[[ "$output" == /* ]] || output="$PWD/$output"
manifest=$(readlink -f "$2")
cd "$(dirname "$manifest")"
pnpm exec esbuild tools/cli/registration-api.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$output"
