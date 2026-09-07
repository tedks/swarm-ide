#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TASK_WORKSPACE_EVIDENCE:?}/window-selected"
task_workspace_deadline=$((SECONDS + 90))
while [[ ! -s "$SWARM_TASK_WORKSPACE_EVIDENCE/task-workspace-proof.json" ]]; do
  [[ ! -s "$SWARM_TASK_WORKSPACE_EVIDENCE/task-workspace-failure.json" ]] || { cat "$SWARM_TASK_WORKSPACE_EVIDENCE/task-workspace-failure.json"; exit 1; }
  (( SECONDS < task_workspace_deadline )) || { echo 'Task workspace proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TASK_WORKSPACE_EVIDENCE/task-workspace-proof.json" <<'JS'
const assert = require('node:assert/strict');
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
assert(proof.ok && proof.realDitz && proof.packagedCore && proof.retainedSource && proof.retainedDraft && proof.retainedCameras);
assert.equal(proof.rendererErrors.length, 0);
assert.equal(proof.modelTurns, 0);
console.log(`Actual CLI task workspace passed in ${proof.milliseconds}ms: click/document/history/dependencies/graph/source/draft.`);
JS
