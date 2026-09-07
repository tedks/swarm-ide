#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
swarm_window_wait_title 'Core 1:ready' present 30000
swarm_window_key ctrl+0
geometry=$(swarm_window_geometry)
width=$(sed -n 's/^WIDTH=//p' <<<"$geometry")
height=$(sed -n 's/^HEIGHT=//p' <<<"$geometry")
[[ "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]] || exit 2
swarm_window_capture "$SWARM_ARTIFACT_DIR/repository.png"
swarm_window_key ctrl+k
swarm_window_wait_title 'Palette open'
swarm_window_click "$((width / 2))" "$((height * 11 / 100 + 26))"
swarm_window_key ctrl+a
swarm_window_type 'Open repository path' 10
swarm_window_key Return
swarm_window_wait_title 'Palette open · exact path'
swarm_window_key ctrl+a
if [[ "$SWARM_INSTALL_CASE" == checkout ]]; then
  source_path=README.md
else
  source_path=src/hello.ts
fi
swarm_window_type "$source_path" 10
swarm_window_key Return
swarm_window_wait_title 'Palette open' absent
swarm_window_wait_title "Source ${source_path##*/}" present 15000
swarm_window_capture "$SWARM_ARTIFACT_DIR/source.png"
title=$(swarm_window_title)
if [[ "$SWARM_INSTALL_CASE" != checkout && "$title" == *'FraudCheck visible'* ]]; then
  echo 'Wrong-repository service data leaked'; exit 1
fi
if [[ "$SWARM_INSTALL_CASE" == bazel-target ]]; then
  # The source-open title proves live core registration and observation. Wait
  # through its startup effects, then positively exercise the deliberate action.
  sleep 2
  sentinel="$SWARM_INSTALL_SCRATCH/bazel target/target-wrapper-ran"
  [[ ! -e "$sentinel" ]] || { echo 'Opening the external Bazel root executed its wrapper'; exit 1; }
  swarm_window_key ctrl+k
  swarm_window_wait_title 'Palette open'
  swarm_window_click "$((width / 2))" "$((height * 11 / 100 + 26))"
  swarm_window_key ctrl+a
  swarm_window_type 'Build repository service topology' 10
  swarm_window_key Return
  swarm_window_wait_title 'Palette open' absent
  deadline=$((SECONDS + 10))
  while [[ ! -s "$sentinel" ]]; do
    (( SECONDS < deadline )) || { echo 'Deliberate Build did not reach the owned wrapper sentinel'; exit 1; }
    sleep 0.05
  done
  [[ $(wc -l <"$sentinel") == 1 ]]
  swarm_window_capture "$SWARM_ARTIFACT_DIR/deliberate-build.png"
  echo 'External Bazel wrapper: zero execution on open; one after explicit Build' >"$SWARM_ARTIFACT_DIR/wrapper-authority.txt"
fi
printf 'case=%s\nsource=%s\nwindow_title=%s\nactual_public_dev_command=1\nmodel_turns=0\n' \
  "$SWARM_INSTALL_CASE" "$source_path" "$title" >"$SWARM_ARTIFACT_DIR/proof.txt"
echo "Actual source opened through public dev launch: $source_path"
