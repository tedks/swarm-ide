#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
pnpm exec vitest run tests/renderer-health.test.tsx tests/window-health.test.ts tests/new-agent-start.test.tsx tests/trusted-local-pane.test.tsx tests/recovery.test.ts tests/production-boundary.test.ts
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.node.json
