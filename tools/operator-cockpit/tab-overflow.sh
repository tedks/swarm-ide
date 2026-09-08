#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
pnpm run typecheck:internal
pnpm exec vitest run tests/tab-order.test.tsx tests/overflow-strip.test.tsx tests/cockpit-app.test.tsx tests/agent-dock.test.tsx
