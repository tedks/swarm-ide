#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_COCKPIT_EVIDENCE:?}/window-selected"
cockpit_deadline=$((SECONDS + 90))
while [[ ! -s "$SWARM_COCKPIT_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_COCKPIT_EVIDENCE/failure.json" ]] || { cat "$SWARM_COCKPIT_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < cockpit_deadline )) || { echo 'Cockpit proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_COCKPIT_EVIDENCE/proof.json" <<'JS'
const assert = require('node:assert/strict');
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (p.planOnly) {
assert(p.ok && p.packagedCore && p.capturedDesign && p.planStartup && p.planCodeRetention && p.widerConversation && p.noDuplicateShell && p.ownedSourceSaved);
assert.deepEqual(p.agentWrites, []); assert.deepEqual(p.blockingErrors, []);
console.log('Actual packaged Plan startup, authored component/doc graph, native source/Plan/Code roundtrip and wide/compact dock. Captured repo design; no model requests.');
} else if (p.workLogOnly) {
assert(p.ok && p.packagedCore && p.controlledSavedEntry && p.singlePanel && p.independentSidebar && p.wideAndCompactOrdering);
assert(p.outcomeOpened && p.settingsReachable && p.agentPanelReachable && p.sourceRetained && p.camerasRetained && p.graphNodesRetained && p.sourceBarsPreserved && p.ownedSourceSaved);
assert.equal(p.modelCalls, 0); assert.deepEqual(p.agentWrites, []); assert.deepEqual(p.blockingErrors, []);
console.log('Actual packaged Work Log dock with one controlled saved entry; wide/compact ordering, settings, central outcome and retained source. No model calls.');
} else if (p.tabsOnly) {
assert(p.ok && p.packagedCore && p.documentControls && p.selectedTabVisible && p.sourceRetained && p.darkScrollbars && p.ownedSourceSaved);
assert.equal(p.disposableSourceFiles, 10);
assert.deepEqual(p.agentWrites, []); assert.deepEqual(p.blockingErrors, []);
console.log('Actual packaged document-tab overflow, native direction controls and dirty-source retention; dark scrollbar evidence.');
console.log('Compact lens controls exercised:', p.compactLensControls, 'Agent overflow exercised:', p.agentOverflowTested);
} else {
assert(p.ok && p.packagedCore && p.realRegisteredSession && p.crossWorktreeBytes && p.readOnly);
assert(p.sourceRetained && p.camerasRetained && p.graphNodesRetained && p.ownedSourceSaved);
assert.deepEqual(p.agentWrites, []);
assert.deepEqual(p.blockingErrors, []);
console.log(p.scope === 'briefing-only'
  ? 'Actual registered-worktree briefing source; native input; dirty local source and cameras retained.'
  : 'Actual registered-worktree source/diff inspection; native input; dirty local source and cameras retained.');
}
console.log('Accepted exact resize diagnostics:', p.acceptedResizeWarnings.length);
JS
swarm_window_capture "$SWARM_COCKPIT_EVIDENCE/window.png"
