#!/usr/bin/env bash
set -euo pipefail
navigation_scripts=$(dirname "$(readlink -f "$0")")
cd "$navigation_scripts/../.."
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.node.json
pnpm exec vitest run tests/bazel-reference.test.ts tests/context-source-links.test.tsx tests/editor-reference.test.tsx tests/context-metrics.test.tsx tests/build-patterns.test.ts
