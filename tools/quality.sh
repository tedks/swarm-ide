#!/usr/bin/env bash
set -euo pipefail

script_path=$(readlink -f "$0")
workspace=$(cd "$(dirname "$script_path")/.." && pwd)
cd "$workspace"

pnpm run typecheck:internal
pnpm run test:internal
pnpm run build:node
pnpm run build:renderer
