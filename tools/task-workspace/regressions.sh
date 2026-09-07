#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
exec pnpm exec vitest run tests/task-workspace.test.tsx tests/task-workspace-graph.test.ts tests/task-activity.test.ts tests/task-workspace-context.test.tsx
