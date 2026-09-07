#!/usr/bin/env bash
set -euo pipefail
[[ "${SWARM_TRUSTED_LIVE_SMOKE:-}" == 1 ]] || { echo 'Explicit SWARM_TRUSTED_LIVE_SMOKE=1 required; no provider started.' >&2; exit 2; }
[[ "${SWARM_TRUSTED_LIVE_CODEX:-}" == /tmp/swarm-ide-codex-runtime.70xtjj/codex ]] || { echo 'Exact reviewed SWARM_TRUSTED_LIVE_CODEX required; no provider started.' >&2; exit 2; }
[[ "${SWARM_TRUSTED_LIVE_EVIDENCE:-}" == /* ]] || { echo 'Absolute SWARM_TRUSTED_LIVE_EVIDENCE required; no provider started.' >&2; exit 2; }
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
trusted_runfiles=${TEST_SRCDIR:-${RUNFILES_DIR:?Bazel runfiles required}}
exec node "$trusted_runfiles/_main/tools/trusted-local/live-proof.cjs" "$trusted_runfiles/_main/core/agents/owner-process.mjs"
