#!/usr/bin/env bash
set -euo pipefail
context_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$context_workspace"
pnpm exec vitest run tests/context-metrics.test.tsx tests/context-compose.test.ts tests/context-workbench.test.tsx tests/context-contract.test.ts tests/context-attention.test.ts tests/task-backlinks.test.ts
