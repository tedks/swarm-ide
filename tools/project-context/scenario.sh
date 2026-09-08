#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_PROJECT_CONTEXT_EVIDENCE:?}/window-selected"
context_deadline=$((SECONDS + 55))
while [[ ! -s "$SWARM_PROJECT_CONTEXT_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_PROJECT_CONTEXT_EVIDENCE/failure.json" ]] || { cat "$SWARM_PROJECT_CONTEXT_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < context_deadline )) || { echo 'Project context proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_PROJECT_CONTEXT_EVIDENCE/proof.json" <<'JS'
const proof = JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if (!proof.ok || !proof.realNodeServer || proof.rendererErrors.length) process.exit(1);
console.log(`Actual project runtime proof passed: ${proof.elapsedMs}ms`);
JS
swarm_window_capture "$SWARM_PROJECT_CONTEXT_EVIDENCE/context-window.png"
