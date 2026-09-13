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
proof_home=$(mktemp -d)
trap 'rm -rf "$proof_home"' EXIT
help=$(env -i HOME="$proof_home" USER=swarm PATH=/usr/bin:/bin "$package/bin/swarm" --help)
grep -q 'Usage: swarm' <<<"$help"

wrapper_shell=$(sed -n '1s/^#![[:space:]]*\([^[:space:]]*\).*/\1/p' "$package/bin/swarm")
test -x "$wrapper_shell"
wrapper_environment=$(
  {
    sed '/^exec[[:space:]]/,$d' "$package/bin/swarm"
    printf '%s\n' 'printf "PATH=%s\nSWARM_BAZEL_BIN=%s\nSWARM_BAZEL_JAVA_HOME=%s\n" "$PATH" "$SWARM_BAZEL_BIN" "$SWARM_BAZEL_JAVA_HOME"'
  } | env -i HOME="$proof_home" USER=swarm PATH=/usr/bin:/bin "$wrapper_shell" -e
)
runtime_path=$(sed -n 's/^PATH=//p' <<<"$wrapper_environment")
bazel=$(sed -n 's/^SWARM_BAZEL_BIN=//p' <<<"$wrapper_environment")
java_home=$(sed -n 's/^SWARM_BAZEL_JAVA_HOME=//p' <<<"$wrapper_environment")
node=$(PATH="$runtime_path" command -v node)
nix=$(PATH="$runtime_path" command -v nix)
test -x "$node"
test -x "$nix"
test -x "$bazel"
test -x "$java_home/bin/java"

workspace=${BUILD_WORKSPACE_DIRECTORY:?}
execution=$(
  cd "$workspace"
  env -i HOME="$proof_home" USER=swarm PATH="$runtime_path" \
    SWARM_BAZEL_BIN="$bazel" SWARM_BAZEL_JAVA_HOME="$java_home" \
    "$node" tools/build-graph/target-probe.mjs \
      "$workspace/bazel-bin/tools/build-graph/target-probe.cjs" unused \
      "$package/share/swarm-ide/core/worker.js"
)
grep -q '"sourceScope": "installed Nix package worker"' <<<"$execution"
grep -q '"actualPassingAndFailingTests": true' <<<"$execution"
grep -q '"daemonPreparationCancelled": true' <<<"$execution"

printf '%s\n' "$execution"
printf '{"installedPackage":"%s","isolatedHelp":true,"installedWorkerExecution":true}\n' "$package"
