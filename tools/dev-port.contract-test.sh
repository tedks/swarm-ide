#!/usr/bin/env bash
set -euo pipefail

runfiles="$TEST_SRCDIR/$TEST_WORKSPACE/tools"
stage="$(mktemp -d "${TEST_TMPDIR:?}/swarm-dev-port.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
cp "$runfiles/dev-port.mjs" "$stage/dev-port.mjs"
cp "$runfiles/dev-port.contract.test.mjs" "$stage/dev-port.contract.test.mjs"
node --test "$stage/dev-port.contract.test.mjs"
