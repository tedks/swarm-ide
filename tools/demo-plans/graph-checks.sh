#!/usr/bin/env bash
set -euo pipefail
task_graph_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$task_graph_workspace"
pnpm exec vitest run tests/task-graph.test.ts tests/task-graph-client.test.ts tests/task-workspace-graph.test.ts tests/task-graph-surface.test.tsx
pnpm exec tsc --noEmit -p tsconfig.node.json
pnpm exec tsc --noEmit -p tsconfig.json
