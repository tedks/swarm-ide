#!/usr/bin/env bash
set -euo pipefail
output=$(realpath -m "$1")
source_root=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$source_root"
pnpm exec esbuild tools/worktree-browser/renderer.tsx --bundle --format=esm --platform=browser --target=es2022 --define:import.meta.env='{"DEV":false,"PROD":true}' --outfile="$output"
