#!/usr/bin/env bash
set -euo pipefail
cockpit_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$cockpit_workspace"
bash -n tools/operator-cockpit/{smoke,launch,scenario,plan-first}.sh
node --check tools/operator-cockpit/acceptance.cjs
pnpm run typecheck:internal
pnpm exec vitest run tests/plan-first-cockpit.test.tsx tests/recovery.test.ts tests/agent-dock.test.tsx tests/compact-workbench.test.tsx tests/cockpit-app.test.tsx tests/task-workbench.test.tsx
