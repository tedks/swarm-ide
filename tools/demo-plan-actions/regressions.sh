#!/usr/bin/env bash
set -euo pipefail
actions_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$actions_workspace"
pnpm exec vitest run tests/demo-plan-actions.test.tsx tests/planning-ui.test.tsx tests/projection-selection.test.tsx
