#!/usr/bin/env bash
set -euo pipefail
[[ "${SWARM_NEW_AGENT_LIVE:-}" == 1 ]] || { echo 'Manual one-turn authorization required'; exit 2; }
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
files=${TEST_SRCDIR:-${RUNFILES_DIR:?}}
exec node "$files/_main/tools/trusted-local/start-live.cjs" "$files/_main/core/agents/owner-process.mjs"
