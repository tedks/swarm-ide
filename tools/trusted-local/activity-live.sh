#!/usr/bin/env bash
set -euo pipefail
[[ "${SWARM_ACTIVITY_LIVE:-}" == 1 ]] || { echo 'Explicit SWARM_ACTIVITY_LIVE=1 required; no provider started.' >&2; exit 2; }
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
trusted_activity_runfiles=${TEST_SRCDIR:-${RUNFILES_DIR:?Bazel runfiles required}}
exec node "$trusted_activity_runfiles/_main/tools/trusted-local/activity-live-proof.cjs" "$trusted_activity_runfiles/_main/core/agents/owner-process.mjs"
