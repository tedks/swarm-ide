#!/usr/bin/env bash
set -euo pipefail
trusted_activity_output=$1
[[ "$trusted_activity_output" == /* ]] || trusted_activity_output="$PWD/$trusted_activity_output"
trusted_activity_manifest=$(readlink -f "$2")
cd "$(dirname "$trusted_activity_manifest")"
pnpm exec esbuild tools/trusted-local/activity-live.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$trusted_activity_output"
