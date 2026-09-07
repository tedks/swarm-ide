#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
cd "$scripts/../.."
pnpm run typecheck:internal
pnpm exec vitest run tests/external-agents*.test.ts tests/external-agents*.test.tsx
