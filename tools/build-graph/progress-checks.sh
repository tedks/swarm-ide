#!/usr/bin/env bash
set -euo pipefail
progress_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$progress_workspace"
pnpm exec vitest run tests/build-progress.test.ts tests/provider-build-command.test.ts tests/provider.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
