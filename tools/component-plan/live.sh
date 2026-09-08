#!/usr/bin/env bash
set -euo pipefail
[[ "${SWARM_PLAN_GENERATION_LIVE:-}" == 1 ]] || { echo 'Explicit SWARM_PLAN_GENERATION_LIVE=1 required'; exit 2; }
[[ "${SWARM_PLAN_GENERATION_EVIDENCE:-}" == /* ]] || { echo 'Owned absolute evidence directory required'; exit 2; }
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
generation_runfiles=${TEST_SRCDIR:-${RUNFILES_DIR:?Bazel runfiles required}}
exec node "$generation_runfiles/_main/tools/component-plan/live.cjs" "$generation_runfiles/_main/core/agents/owner-process.mjs"
