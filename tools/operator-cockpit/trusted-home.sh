#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
pnpm run typecheck:internal
pnpm exec vitest run tests/agent-trusted-home.test.tsx tests/agent-workbench-live.test.tsx
