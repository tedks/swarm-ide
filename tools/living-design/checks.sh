#!/usr/bin/env bash
set -euo pipefail
design_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$design_workspace"
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm exec vitest run tests/living-design.test.tsx tests/plans-reader.test.ts tests/planning-ui.test.tsx tests/demo-plan-actions.test.tsx
