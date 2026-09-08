#!/usr/bin/env bash
set -euo pipefail
generation_output=$1
[[ "$generation_output" == /* ]] || generation_output="$PWD/$generation_output"
generation_manifest=$(readlink -f "$2")
cd "$(dirname "$generation_manifest")"
pnpm exec esbuild tools/component-plan/live.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$generation_output"
