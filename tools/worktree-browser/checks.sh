#!/usr/bin/env bash
set -euo pipefail
worktree_source=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$worktree_source"
pnpm run typecheck:internal
pnpm exec vitest run tests/worktree-inspection.test.ts tests/cockpit-inspection.test.tsx tests/agent-worktree-browser-core.test.ts tests/agent-worktree-browser.test.tsx
