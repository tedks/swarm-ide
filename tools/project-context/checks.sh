#!/usr/bin/env bash
set -euo pipefail
context_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$context_workspace"
bash -n tools/project-context/checks.sh tools/project-context/smoke.sh tools/project-context/scenario.sh tools/project-context/launch.sh tools/project-context/probe.sh
node --check tools/project-context/launch.mjs
node --check tools/project-context/acceptance.cjs
pnpm run typecheck:internal
pnpm exec vitest run tests/project-context*.test.ts tests/project-context*.test.tsx
