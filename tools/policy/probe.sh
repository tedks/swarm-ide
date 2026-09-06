#!/usr/bin/env bash
set -euo pipefail
policy_dir=$(dirname "$(readlink -f "$0")")
cd "$policy_dir/../.."
# Nix acquisition happens outside the probe boundary; it never starts Codex.
# No PATH fallback to a host bubblewrap/node when dependency acquisition fails.
policy_runtime=$(nix build --impure --no-link --print-out-paths --file tools/policy/runtime.nix)
exec "$policy_runtime/bin/node" "$policy_dir/probe.mjs" "$policy_runtime" "$@"
