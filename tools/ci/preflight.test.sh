#!/usr/bin/env bash
set -euo pipefail
ci_dir=$(dirname "$(readlink -f "$0")")
cd "$ci_dir/../.."
export SWARM_CI_TEST_RUNTIME
SWARM_CI_TEST_RUNTIME=$(timeout --signal=TERM --kill-after=5s 120s nix build --impure --no-link --print-out-paths --file tools/policy/runtime.nix)
exec "$SWARM_CI_TEST_RUNTIME/bin/node" --test "$ci_dir/preflight.checks.mjs"
