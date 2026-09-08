#!/usr/bin/env bash
set -euo pipefail
fleet_scripts=$(dirname "$(readlink -f "$0")")
cd "$(dirname "$(dirname "$fleet_scripts")")"
pnpm exec vitest run tests/trusted-fleet-contract.test.ts tests/trusted-local.test.ts tests/trusted-local-store.test.ts tests/trusted-local-fleet.test.ts tests/trusted-local-session.test.ts
