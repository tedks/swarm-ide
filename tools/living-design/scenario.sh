#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "${SWARM_DESIGN_EVIDENCE:?}/window-selected"
design_deadline=$((SECONDS + 50))
while [[ ! -s "$SWARM_DESIGN_EVIDENCE/proof.json" ]]; do
  [[ ! -s "$SWARM_DESIGN_EVIDENCE/failure.json" ]] || { cat "$SWARM_DESIGN_EVIDENCE/failure.json"; exit 1; }
  (( SECONDS < design_deadline )) || { echo 'Design navigation timed out'; exit 1; }
  sleep .1
done
cat "$SWARM_DESIGN_EVIDENCE/proof.json"
swarm_window_capture "$SWARM_DESIGN_EVIDENCE/component-window.png"
