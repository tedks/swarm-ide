#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "$SWARM_ARTIFACT_DIR/window-selected"
deadline=$((SECONDS + 60))
while [[ ! -s "$SWARM_ARTIFACT_DIR/fleet-proof.json" ]]; do
  [[ ! -s "$SWARM_ARTIFACT_DIR/failure.json" ]] || { sed -n '1,30p' "$SWARM_ARTIFACT_DIR/failure.json"; exit 1; }
  (( SECONDS < deadline )) || { echo 'Real fleet UI proof timed out'; exit 1; }
  sleep 0.1
done
swarm_window_capture "$SWARM_ARTIFACT_DIR/live-fleet.png"
touch "$SWARM_ARTIFACT_DIR/close-request"
while [[ ! -s "$SWARM_ARTIFACT_DIR/postclose.json" ]]; do
  (( SECONDS < deadline )) || exit 1
  sleep 0.1
done
node -e 'const p=require(process.argv[1]);if(p.desktopCode!==0)process.exit(1)' "$SWARM_ARTIFACT_DIR/postclose.json"
