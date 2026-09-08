#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'usage: build-live.sh output manifest' >&2; exit 2; }
fork_output=$1
[[ "$fork_output" == /* ]] || fork_output="$PWD/$fork_output"
fork_manifest=$(readlink -f "$2")
cd "$(dirname "$fork_manifest")"
pnpm exec esbuild tools/trusted-forks/live.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$fork_output"
