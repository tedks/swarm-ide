#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TRUSTED_EVIDENCE:?}/window-selected"
fork_deadline=$((SECONDS + 100))
for fork_record in ui-proof.json proof.json; do
  while [[ ! -s "$SWARM_TRUSTED_EVIDENCE/$fork_record" ]]; do
    [[ ! -s "$SWARM_TRUSTED_EVIDENCE/failure.json" ]] || { cat "$SWARM_TRUSTED_EVIDENCE/failure.json"; exit 1; }
    (( SECONDS < fork_deadline )) || { echo 'Packaged fork GUI proof timed out'; exit 1; }
    sleep 0.1
  done
  if [[ "$fork_record" == ui-proof.json ]]; then
    swarm_window_capture "$SWARM_TRUSTED_EVIDENCE/window.png"
    touch "$SWARM_TRUSTED_EVIDENCE/request-app-close"
  fi
done
node - "$SWARM_TRUSTED_EVIDENCE/proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
const required = ['ok', 'packagedCore', 'ordinaryUiFork', 'nativeLineage', 'childGoalOnly', 'childAutoSelected',
  'sourceRetained', 'camerasRetained', 'graphDomRetained', 'logicalCursorRetained', 'draftRetained',
  'childStopPreservesParent', 'bothExplicitlyStopped', 'appClosed', 'bothOwnedPeersExited',
  'persistedTwoArchives', 'persistedLineage', 'noReplay'];
if (required.some(key => p[key] !== true) || p.modelTurns !== 0 || p.providerStarts !== 2 ||
    p.protocolTurns !== 2 || !Array.isArray(p.rendererErrors) || p.rendererErrors.length) process.exit(1);
console.log('Packaged native fork UI: parent + child, two owned deterministic peers, two protocol turns, no model.');
JS
