#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_BUILD_GRAPH_EVIDENCE:?}/window-selected"
build_deadline=$((SECONDS + 120))
while [[ ! -s "$SWARM_BUILD_GRAPH_EVIDENCE/build-graph-proof.json" ]]; do
  [[ ! -s "$SWARM_BUILD_GRAPH_EVIDENCE/build-graph-failure.json" ]] || { cat "$SWARM_BUILD_GRAPH_EVIDENCE/build-graph-failure.json"; exit 1; }
  (( SECONDS < build_deadline )) || { echo 'Packaged build graph proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_BUILD_GRAPH_EVIDENCE/build-graph-proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if (!proof.ok || !proof.realBazel || !proof.packagedCore || proof.modelTurns !== 0 || proof.rendererErrors.length) process.exit(1);
console.log(`Actual packaged build graph passed: ${proof.case}, ${proof.elapsedMs}ms`);
JS
swarm_window_capture "$SWARM_BUILD_GRAPH_EVIDENCE/build-graph-window.png"
