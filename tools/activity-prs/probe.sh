#!/usr/bin/env bash
set -euo pipefail
activity_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
activity_probe=$(mktemp -d)
trap 'rm -f "$activity_probe/probe.cjs"; rmdir "$activity_probe"' EXIT
pnpm exec esbuild "$activity_scripts/probe.ts" --bundle --platform=node --format=cjs --outfile="$activity_probe/probe.cjs" --log-level=error
node "$activity_probe/probe.cjs"
