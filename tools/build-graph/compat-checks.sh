#!/usr/bin/env bash
set -euo pipefail
compat_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$compat_workspace"
pnpm exec vitest run tests/project-build-compatibility.test.ts tests/build-graph.test.ts tests/automatic-build-context.test.tsx tests/provider.test.ts tests/provider-build-command.test.ts tests/target-build-ui.test.tsx
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
