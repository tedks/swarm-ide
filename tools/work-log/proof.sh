#!/usr/bin/env bash
set -euo pipefail
worklog_scripts=$(dirname "$(readlink -f "$0")")
worklog_source=${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$worklog_scripts")")}
worklog_temp=$(mktemp -d /tmp/swarm-work-log-proof.XXXXXX)
trap 'rm -f "$worklog_temp/proof.cjs"; rmdir "$worklog_temp"' EXIT
cd "$worklog_source"
pnpm exec esbuild "$worklog_scripts/proof.ts" --bundle --platform=node --format=cjs --target=node22 --outfile="$worklog_temp/proof.cjs" >/dev/null
node "$worklog_temp/proof.cjs" "$@"
