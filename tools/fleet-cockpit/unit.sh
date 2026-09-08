#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
pnpm run typecheck:internal
pnpm exec vitest run tests/fleet-state.test.ts tests/trusted-local-pane.test.tsx tests/fleet-cockpit*.test.tsx
