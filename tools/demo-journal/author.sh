#!/usr/bin/env bash
set -euo pipefail
journal_scripts=$(dirname "$(readlink -f "$0")")
journal_source=${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$journal_scripts")")}
journal_temp=$(mktemp -d /tmp/swarm-journal-author.XXXXXX)
trap 'rm -f "$journal_temp/cli.cjs"; rmdir "$journal_temp"' EXIT
cd "$journal_source"
pnpm exec esbuild "$journal_scripts/cli.ts" --bundle --platform=node --format=cjs --target=node22 --outfile="$journal_temp/cli.cjs" >/dev/null
node "$journal_temp/cli.cjs" "$@"
