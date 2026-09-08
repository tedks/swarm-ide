#!/usr/bin/env bash
set -euo pipefail
target_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$target_workspace"
pnpm exec vitest run tests/target-build-jobs.test.ts tests/target-build-ui.test.tsx tests/build-resources.test.tsx tests/build-progress.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
