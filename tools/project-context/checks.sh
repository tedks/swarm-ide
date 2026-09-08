#!/usr/bin/env bash
set -euo pipefail
context_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$context_workspace"
pnpm run typecheck:internal
pnpm exec vitest run tests/project-context*.test.ts tests/project-context*.test.tsx
