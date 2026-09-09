#!/usr/bin/env bash
set -euo pipefail
design_workspace=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$design_workspace"
for design_script in tools/design-tests/*.sh; do bash -n "$design_script"; done
for design_script in tools/design-tests/*.mjs tools/design-tests/*.cjs; do node --check "$design_script"; done
pnpm exec vitest run tests/design-component-targets.test.tsx tests/design-targets-app.test.tsx tests/target-build-ui.test.tsx tests/build-resources.test.tsx tests/target-build-jobs.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
