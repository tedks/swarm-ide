#!/usr/bin/env bash
set -euo pipefail
awareness_source=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$awareness_source"
pnpm run typecheck:internal
pnpm exec vitest run tests/work-log.test.ts tests/work-log-ui.test.tsx tests/task-client.test.ts tests/awareness-plans.test.tsx
