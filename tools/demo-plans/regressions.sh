#!/usr/bin/env bash
set -euo pipefail
plans_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$plans_workspace"
pnpm exec vitest run tests/task-workbench.test.tsx tests/task-graph.test.ts tests/task-graph-client.test.ts tests/planning-ui.test.tsx tests/plans-reader.test.ts tests/projection-selection.test.tsx tests/plans-diagnostics.test.ts
