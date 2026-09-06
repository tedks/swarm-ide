#!/usr/bin/env bash
set -euo pipefail
if (( $# != 0 )); then
  printf 'LINUX_PREREQUISITE_INVALID_ARGUMENTS: this command accepts no arguments.\n' >&2
  exit 2
fi
ci_dir=$(dirname "$(readlink -f "$0")")
cd "$ci_dir/../.."
# Acquire the existing lock-pinned independent runtime, never a host bwrap fallback.
runtime=$(timeout --signal=TERM --kill-after=5s 120s nix build --impure --no-link --print-out-paths --file tools/policy/runtime.nix)
unshare_path=$(readlink -f "$(command -v unshare)")
exec "$runtime/bin/node" "$ci_dir/preflight.mjs" "$runtime" "$unshare_path"
