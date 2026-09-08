#!/usr/bin/env bash
set -euo pipefail
example_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$example_workspace"
pnpm exec vitest run tests/service-example.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
