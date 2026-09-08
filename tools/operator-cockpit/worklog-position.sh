#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
bash -n tools/operator-cockpit/smoke.sh tools/operator-cockpit/scenario.sh tools/operator-cockpit/launch.sh
node --check tools/operator-cockpit/acceptance.cjs
pnpm run typecheck:internal
pnpm exec vitest run tests/cockpit-app.test.tsx tests/cockpit-inspection.test.tsx tests/agent-dock.test.tsx tests/overflow-strip.test.tsx tests/work-log-ui.test.tsx
