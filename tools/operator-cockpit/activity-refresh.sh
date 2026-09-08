#!/usr/bin/env bash
set -euo pipefail
activity_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$activity_workspace"
pnpm exec vitest run tests/central-activity-refresh.test.tsx tests/central-activity-app.test.tsx tests/journal-ui.test.tsx
pnpm run typecheck:internal
