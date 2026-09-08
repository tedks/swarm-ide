#!/usr/bin/env bash
set -euo pipefail
navigation_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$navigation_workspace"
pnpm run typecheck:internal
pnpm exec vitest run tests/navigation-history.test.ts tests/workspace-context.test.ts tests/workspace-navigation
