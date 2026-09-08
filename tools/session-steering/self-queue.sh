#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?}"
[[ "${SWARM_STEERING_REAL_SELF:-}" == 1 ]] || { echo 'Explicit one-message self-proof authorization required' >&2; exit 2; }
exec pnpm exec vitest run tests/external-agents-real-self.test.ts
