#!/usr/bin/env bash
set -euo pipefail

runfiles="$TEST_SRCDIR/$TEST_WORKSPACE/tools"
stage="$(mktemp -d "${TEST_TMPDIR:?}/swarm-dev-port.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
# Stage regular files so this focused test reads only its declared inputs
# without following Bazel runfile symlinks into the source checkout.
cp "$runfiles/dev-port.mjs" "$stage/dev-port.mjs"
cp "$runfiles/dev-port.contract-cases.mjs" "$stage/dev-port.contract-cases.mjs"
command -v node >/dev/null || { echo "dev-port contract requires Node on the Nix PATH" >&2; exit 1; }
node --version
node --test "$stage/dev-port.contract-cases.mjs"
