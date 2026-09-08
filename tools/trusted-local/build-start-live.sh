#!/usr/bin/env bash
set -euo pipefail
out=$1
[[ "$out" == /* ]] || out="$PWD/$out"
cd "$(dirname "$(readlink -f "$2")")"
pnpm exec esbuild tools/trusted-local/start-live.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$out"
