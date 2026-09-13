#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: installed-package-proof.sh /nix/store/...-swarm-ide" >&2
  exit 2
fi

package=$(readlink -f "$1")
case "$package" in
  /nix/store/*-swarm-ide-*) ;;
  *) echo "proof requires an installed swarm-ide Nix package" >&2; exit 2 ;;
esac

test -x "$package/bin/swarm"
test -r "$package/share/swarm-ide/core/worker.js"
test -r "$package/share/swarm-ide/core/target-build-launcher.mjs"
nix_bin=$(grep -Eo '/nix/store/[a-z0-9]+-nix-[^/]+/bin' "$package/bin/swarm" | head -1)
test -x "$nix_bin/nix"

proof_home=$(mktemp -d)
trap 'rm -rf "$proof_home"' EXIT
help=$(env -i HOME="$proof_home" USER=swarm PATH=/usr/bin:/bin "$package/bin/swarm" --help)
grep -q 'Usage: swarm' <<<"$help"

printf '{"installedPackage":"%s","nix":"%s","isolatedHelp":true,"worker":true,"launcher":true}\n' \
  "$package" "$("$nix_bin/nix" --version)"
