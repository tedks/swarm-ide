#!/usr/bin/env bash
set -euo pipefail
service_output=$1
[[ "$service_output" == /* ]] || service_output="$PWD/$service_output"
service_workspace=$(dirname "$(readlink -f "$2")")
cd "$service_workspace"
pnpm exec esbuild tools/services/inspect.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$service_output"
