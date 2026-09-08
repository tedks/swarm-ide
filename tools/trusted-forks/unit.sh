#!/usr/bin/env bash
set -euo pipefail
fork_scripts=$(dirname "$(readlink -f "$0")")
cd "$(dirname "$(dirname "$fork_scripts")")"
pnpm run typecheck:internal
pnpm exec vitest run tests/trusted-forks.test.ts tests/trusted-forks-session.test.ts tests/trusted-local.test.ts tests/trusted-local-session.test.ts tests/trusted-local-fleet.test.ts tests/trusted-local-store.test.ts tests/trusted-fleet-contract.test.ts
