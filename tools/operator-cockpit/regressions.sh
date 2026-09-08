#!/usr/bin/env bash
set -euo pipefail
cockpit_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$cockpit_workspace"
pnpm exec vitest run tests/cockpit-app.test.tsx tests/cockpit-inspection.test.tsx tests/worktree-inspection.test.ts tests/activity-timestamps.test.tsx tests/journal-ui.test.tsx
