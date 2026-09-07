#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${TEST_SRCDIR:-}${RUNFILES_DIR:-}" && -d "$0.runfiles" ]]; then export RUNFILES_DIR; RUNFILES_DIR=$(readlink -f "$0.runfiles"); fi
build_scripts=$(dirname "$(readlink -f "$0")")
build_source=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:-$(dirname "$(dirname "$build_scripts")")}}
build_artifacts=${SWARM_ARTIFACT_DIR:-${TEST_UNDECLARED_OUTPUTS_DIR:-$build_source/artifacts}/build-graph}
mkdir -p "$build_artifacts"
build_run=$(mktemp -d "$build_artifacts/run.XXXXXX")
for build_case in first second; do
  export SWARM_BUILD_GRAPH_CASE="$build_case" SWARM_BUILD_GRAPH_EVIDENCE="$build_run/$build_case"
  export SWARM_ARTIFACT_DIR="$SWARM_BUILD_GRAPH_EVIDENCE"
  mkdir -p "$SWARM_ARTIFACT_DIR"
  "$build_scripts/../virtual-desktop-run.sh" "$build_scripts/scenario.sh" "$build_scripts/launch.sh" "build-graph-$build_case"
  grep -q 'cleanup_complete=1 ' "$SWARM_ARTIFACT_DIR/supervisor.log"
done
node - "$build_run" <<'JS'
const fs = require('node:fs'), assert = require('node:assert/strict');
const a = JSON.parse(fs.readFileSync(`${process.argv[2]}/first/build-graph-proof.json`));
const b = JSON.parse(fs.readFileSync(`${process.argv[2]}/second/build-graph-proof.json`));
assert.notEqual(a.repositoryId, b.repositoryId); assert.notEqual(a.before.graph.inputDigest, b.before.graph.inputDigest);
console.log(`Actual two-repository build graph edge-change proof passed: ${process.argv[2]}`);
JS
