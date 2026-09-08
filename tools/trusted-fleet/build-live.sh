#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'usage: build-live.sh output manifest' >&2; exit 2; }
fleet_output=$1
[[ "$fleet_output" == /* ]] || fleet_output="$PWD/$fleet_output"
fleet_manifest=$(readlink -f "$2")
cd "$(dirname "$fleet_manifest")"
pnpm exec esbuild tools/trusted-fleet/live.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$fleet_output"
