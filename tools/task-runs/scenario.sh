#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TASK_RUNS_EVIDENCE:?}/window-selected"
task_runs_deadline=$((SECONDS + 75))
while [[ ! -s "$SWARM_TASK_RUNS_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_TASK_RUNS_EVIDENCE/failure.json" ]] || { cat "$SWARM_TASK_RUNS_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < task_runs_deadline )) || { echo 'Controlled task runs proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TASK_RUNS_EVIDENCE/proof.json" <<'JS'
const assert = require('node:assert/strict');
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
assert(proof.ok && proof.exactAssociations && proof.lateTaskSwitch && proof.deliberateOpen && proof.archivedRetained);
assert(proof.codeMirrorTextCursorAndDomRetained && proof.draftRetained && proof.graphStandInRetained);
assert.equal(proof.callbackCount, 2); assert.equal(proof.modelTurns, 0); assert.equal(proof.remoteRequests, 0);
assert.deepEqual(proof.rendererErrors, []);
console.log(`Controlled standalone task-runs UI passed in ${proof.milliseconds}ms; no production admission/provider claim.`);
JS
