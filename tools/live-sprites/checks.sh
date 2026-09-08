#!/usr/bin/env bash
set -euo pipefail
sprite_root=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
cd "$sprite_root"
bash -n tools/live-sprites/*.sh
node --check tools/live-sprites/proof.cjs
node --check tools/live-sprites/launch.mjs
pnpm run typecheck:internal
pnpm exec vitest run tests/graph-agent-locations.test.ts tests/graph-agent-overlay.test.tsx tests/directory-layers.test.tsx tests/living-design.test.tsx tests/plan-generation-ui.test.tsx tests/tab-order.test.tsx tests/overflow-strip.test.tsx
pnpm exec vitest run tests/workspace-navigation-app.test.tsx -t 'places fresh-launch graph agents'
