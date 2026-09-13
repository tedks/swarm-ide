#!/usr/bin/env bash
set -euo pipefail
palette_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$palette_workspace"
pnpm exec vitest run tests/bazel-command-palette.test.tsx tests/bazel-command-palette-app.test.tsx tests/repository-search-ui.test.tsx tests/design-component-targets.test.tsx tests/target-build-ui.test.tsx
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
