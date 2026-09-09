#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_DESIGN_TESTS_EVIDENCE:?}/window-selected"
design_deadline=$((SECONDS + 140))
while [[ ! -s "$SWARM_DESIGN_TESTS_EVIDENCE/design-tests-proof.json" ]]; do
  [[ ! -s "$SWARM_DESIGN_TESTS_EVIDENCE/design-tests-failure.json" ]] || {
    cat "$SWARM_DESIGN_TESTS_EVIDENCE/design-tests-failure.json"; exit 1;
  }
  (( SECONDS < design_deadline )) || { echo 'Packaged component test proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_DESIGN_TESTS_EVIDENCE/design-tests-proof.json" <<'JS'
const assert = require('node:assert/strict');
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2]));
assert(proof.ok && proof.realBazel && proof.packagedCore && proof.modelTurns === 0);
assert(proof.ruleClassesDistinguished && proof.selectionAndDocumentRetained);
assert.equal(proof.job.operation, 'test');
assert.equal(proof.job.status, 'succeeded');
assert.equal(proof.job.cleanup, 'confirmed');
assert.deepEqual(proof.rendererErrors, []);
console.log(`Packaged component test passed: ${proof.job.target}, ${proof.elapsedMs}ms`);
JS
swarm_window_capture "$SWARM_DESIGN_TESTS_EVIDENCE/design-tests-window.png"
