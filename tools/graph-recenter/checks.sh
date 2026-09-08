#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
pnpm exec vitest run tests/graph-click-recenter.test.tsx tests/graph-navigation-intent.test.tsx tests/graph-camera.test.tsx tests/projection-selection.test.tsx tests/service-graph-activation.test.tsx tests/context-source-links.test.tsx tests/build-patterns.test.ts tests/task-graph-surface.test.tsx
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.node.json
