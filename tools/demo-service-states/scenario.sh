#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
swarm_window_wait_title 'Core 1:ready' present 30000
# The initial real fingerprint advances the provider's gray bootstrap to yellow
# even before a Build is requested. Assert the actual settled public state.
swarm_window_wait_title 'Topology 1:yellow'
swarm_window_key ctrl+0
swarm_window_wait_title 'Zoom 100%'
# Allow the already acknowledged state to paint before the actual window capture.
sleep .2
swarm_window_capture "$SWARM_ARTIFACT_DIR/service-needs-build.png"
swarm_window_key ctrl+k
swarm_window_wait_title 'Palette open'
swarm_window_key ctrl+a
swarm_window_type 'Open repository path' 5
swarm_window_key Return
swarm_window_wait_title 'Palette open · exact path'
swarm_window_key ctrl+a
swarm_window_type README.md 5
swarm_window_key Return
swarm_window_wait_title 'Palette open' absent
swarm_window_wait_title 'Source README.md:saved'
swarm_window_wait_title 'Topology 1:yellow'
sleep .2
swarm_window_capture "$SWARM_ARTIFACT_DIR/service-with-source.png"
if grep -E '\[console.error\]|Uncaught (Error|TypeError|ReferenceError)|ResizeObserver loop' "$SWARM_ARTIFACT_DIR/app.log"; then
  echo 'Service empty-state smoke encountered a renderer error' >&2
  exit 1
fi
printf 'real_git_repository=1\nreal_core_source_open=1\ntopology_epoch=1\ntopology_state=yellow\nmodel_turns=0\nsynthetic_state_injection=0\n' >"$SWARM_ARTIFACT_DIR/service-proof.txt"
echo 'Actual needs-build Service UI and ordinary source opening captured; no service build or agent turn.'
