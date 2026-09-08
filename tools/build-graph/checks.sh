#!/usr/bin/env bash
set -euo pipefail
build_graph_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$build_graph_workspace"
pnpm exec vitest run tests/automatic-build-context.test.tsx tests/build-graph.test.ts tests/startup-topology.test.tsx
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
