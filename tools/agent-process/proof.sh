#!/usr/bin/env bash
set -euo pipefail
script_path=$(readlink -f "$0")
workspace=$(cd "$(dirname "$script_path")/../.." && pwd)
cd "$workspace"
export SWARM_REQUIRE_OWNED_PROCESS=1
export SWARM_PROCESS_EVIDENCE_DIR="${TEST_UNDECLARED_OUTPUTS_DIR:?Bazel test evidence directory required}"
timeout --signal=TERM --kill-after=5s 60s pnpm exec vitest run tests/agent-owned-process.test.ts
