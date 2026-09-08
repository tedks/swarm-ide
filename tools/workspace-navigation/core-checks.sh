#!/usr/bin/env bash
set -euo pipefail
navigation_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$navigation_workspace"
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm exec vitest run tests/workspace-context.test.ts tests/worktree-inspection.test.ts tests/agent-worktree-browser-core.test.ts
