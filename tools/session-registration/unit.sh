#!/usr/bin/env bash
set -euo pipefail
registration_scripts=$(dirname "$(readlink -f "$0")")
cd "$(dirname "$(dirname "$registration_scripts")")"
export SWARM_REGISTRATION_CLI="$TEST_SRCDIR/_main/tools/session-registration/register.cjs"
export SWARM_REQUIRE_EXTERNAL_HANDOFF=1
pnpm run typecheck:internal
pnpm exec tsc -p tools/session-registration/tsconfig.json
pnpm exec vitest run tools/session-registration/registration.test.ts tests/external-agents.test.ts tests/external-agents-handoff.test.ts tests/external-agents-send.test.ts
