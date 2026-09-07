#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'usage: build-live.sh output manifest' >&2; exit 2; }
trusted_output=$1
[[ "$trusted_output" == /* ]] || trusted_output="$PWD/$trusted_output"
trusted_manifest=$(readlink -f "$2")
cd "$(dirname "$trusted_manifest")"
pnpm exec esbuild tools/trusted-local/live.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$trusted_output"
