#!/usr/bin/env bash
set -euo pipefail
worklog_scripts=$(dirname "$(readlink -f "$0")")
worklog_source=${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$worklog_scripts")")}
cd "$worklog_source"
pnpm run typecheck:internal
pnpm exec vitest run tests/work-log.test.ts tests/work-log-ui.test.tsx
