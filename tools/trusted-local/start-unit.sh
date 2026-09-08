#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")"
pnpm exec vitest run tests/new-agent-start.test.tsx tests/trusted-local-pane.test.tsx tests/fleet-cockpit.test.tsx tests/agent-trusted-home.test.tsx tests/agent-dock.test.tsx
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p tsconfig.node.json
