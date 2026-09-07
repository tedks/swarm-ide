#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_JOURNAL_EVIDENCE:?}/window-selected"
journal_deadline=$((SECONDS + 110))
while [[ ! -s "$SWARM_JOURNAL_EVIDENCE/journal-proof.json" ]]; do
  [[ ! -s "$SWARM_JOURNAL_EVIDENCE/journal-failure.json" ]] || { cat "$SWARM_JOURNAL_EVIDENCE/journal-failure.json"; exit 1; }
  (( SECONDS < journal_deadline )) || { echo 'Journal packaged proof timed out'; exit 1; }
  sleep 0.1
done
node - "$SWARM_JOURNAL_EVIDENCE/journal-proof.json" <<'JS'
const p = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!p.ok || !p.realGit || !p.packagedCore || p.productModelTurns !== 0 || p.rendererErrors.length) process.exit(1);
console.log('Actual supervised authoring output crossed packaged Journal refresh; zero product model turns.');
JS
swarm_window_capture "$SWARM_JOURNAL_EVIDENCE/journal-window.png"
