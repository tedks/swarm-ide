#!/usr/bin/env bash
set -euo pipefail
context_scripts=$(dirname "$(readlink -f "$0")")
cd "$context_scripts/../.."
context_probe=$(mktemp -d)
trap 'rm -f "$context_probe/probe.cjs"; rmdir "$context_probe"' EXIT
pnpm exec esbuild tools/project-context/probe.ts --bundle --platform=node --format=cjs --outfile="$context_probe/probe.cjs" >/dev/null
node "$context_probe/probe.cjs" "$@"
