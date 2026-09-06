#!/usr/bin/env bash
set -euo pipefail
policy_dir=$(dirname "$(readlink -f "$0")")
cd "$policy_dir/../.."
policy_normal=$(nix build --impure --no-link --print-out-paths --file tools/policy/runtime.nix)
policy_poisoned=$(NIXPKGS_CONFIG="$policy_dir/reject-config.nix" nix build --impure --no-link --print-out-paths --file tools/policy/runtime.nix)
test "$policy_normal" = "$policy_poisoned"
echo 'pinned_runtime_ignores_ambient_nixpkgs_config=1'
