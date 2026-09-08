#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_TRUSTED_EVIDENCE:?}/window-selected"
trusted_deadline=$((SECONDS + 100))
while [[ ! -s "$SWARM_TRUSTED_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_TRUSTED_EVIDENCE/failure.json" ]] || { cat "$SWARM_TRUSTED_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < trusted_deadline )) || { echo 'Trusted-local packaged proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_TRUSTED_EVIDENCE/proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
const required = ['ok', 'realCoreEditor', 'sourceRetained', 'camerasRetained', 'exactTargetStop',
  'composerIsolation', 'delayedAcknowledgement', 'logicalCursorRetained', 'graphDomRetained',
  'archiveReadOnly', 'activityVisible', 'draftRetained'];
if (required.some((key) => p[key] !== true) || p.modelTurns !== 0 || p.providerStarts !== 0 ||
    !Array.isArray(p.rendererErrors) || p.rendererErrors.length) process.exit(1);
console.log('Controlled fleet IPC with real packaged core/editor/graphs passed; no provider/model.');
JS
swarm_window_capture "$SWARM_TRUSTED_EVIDENCE/window.png"
