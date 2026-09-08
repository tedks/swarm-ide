#!/usr/bin/env bash
set -euo pipefail
fixture_workspace=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
cd "$fixture_workspace"
bash -n tools/desktop-agent-scenario.sh tools/desktop-reload-scenario.sh tools/desktop-smoke.sh tools/desktop-topology-scenario.sh tools/virtual-desktop-run.sh
node --check tools/agent-rehearsal/launch.mjs
node --check tools/agent-rehearsal/options.mjs
pnpm exec vitest run \
  tests/contracts.test.ts \
  tests/reconciliation.test.ts \
  tests/graph-adapter.test.ts \
  tests/graph-camera.test.tsx \
  tests/context-contract.test.ts \
  tests/context-compose.test.ts \
  tests/context-metrics.test.tsx \
  tests/recovery.test.ts \
  tests/desktop-topology-scenario.test.ts
