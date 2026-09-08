#!/usr/bin/env bash
set -euo pipefail
generation_source=${BUILD_WORKSPACE_DIRECTORY:-$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)}
cd "$generation_source"
pnpm run typecheck:internal
pnpm exec vitest run tests/plan-generation.test.ts tests/plan-generation-ui.test.tsx tests/plans-reader.test.ts tests/trusted-local-session.test.ts tests/trusted-local.test.ts tests/workspace-context.test.ts
