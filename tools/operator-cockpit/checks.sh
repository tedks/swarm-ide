#!/usr/bin/env bash
set -euo pipefail
cockpit_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$cockpit_workspace"
bash -n tools/operator-cockpit/smoke.sh tools/operator-cockpit/scenario.sh tools/operator-cockpit/launch.sh
node --check tools/operator-cockpit/acceptance.cjs
pnpm run typecheck:internal
pnpm exec vitest run tests/cockpit-app.test.tsx tests/cockpit-inspection.test.tsx tests/worktree-inspection.test.ts tests/activity-timestamps.test.tsx tests/journal-ui.test.tsx
