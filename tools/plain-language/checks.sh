#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
pnpm run typecheck:internal
pnpm exec vitest run \
  tests/agent-workbench-live.test.tsx \
  tests/agent-workbench.test.tsx \
  tests/agent-workbench-reload.test.tsx \
  tests/task-surface.test.tsx \
  tests/task-workbench.test.tsx \
  tests/agent-task-draft.test.tsx \
  tests/repository-search-ui.test.tsx \
  tests/github-prs.test.ts \
  tests/github-prs-ui.test.tsx \
  tests/trusted-local-pane.test.tsx \
  tests/fleet-cockpit.test.tsx
