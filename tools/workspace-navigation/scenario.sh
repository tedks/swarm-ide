#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
touch "$SWARM_ARTIFACT_DIR/window-selected"
deadline=$((SECONDS + 80))
while [[ ! -s "$SWARM_ARTIFACT_DIR/proof.json" ]]; do
  if [[ -s "$SWARM_ARTIFACT_DIR/failure.json" ]]; then cat "$SWARM_ARTIFACT_DIR/failure.json"; exit 1; fi
  (( SECONDS < deadline )) || { echo 'Worktree browser proof timed out'; exit 1; }
  sleep .1
done
swarm_window_capture "$SWARM_ARTIFACT_DIR/window.png"
touch "$SWARM_ARTIFACT_DIR/close-now"
while [[ ! -s "$SWARM_ARTIFACT_DIR/readonly.json" ]]; do
  if [[ -s "$SWARM_ARTIFACT_DIR/failure.json" ]]; then cat "$SWARM_ARTIFACT_DIR/failure.json"; exit 1; fi
  (( SECONDS < deadline )) || exit 1
  sleep .1
done
