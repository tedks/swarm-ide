#!/usr/bin/env bash
# Human-facing mock UI rehearsal, strictly on the owned virtual desktop.
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
artifact_dir=${SWARM_ARTIFACT_DIR:?}
run_command() {
  swarm_window_key Escape
  swarm_window_wait_title "Palette open" absent
  swarm_window_key ctrl+k
  swarm_window_wait_title "Palette open"
  swarm_window_key ctrl+a
  swarm_window_type "$1" 2
  swarm_window_key Return
  if (( $# == 2 )); then
    swarm_window_wait_title "Palette open · exact path"
    swarm_window_key ctrl+a
    swarm_window_type "$2" 2
    swarm_window_key Return
  fi
  swarm_window_wait_title "Palette open" absent
}
swarm_window_wait_title "Zoom"
run_command "Demo: populate everything"
sleep .2
swarm_window_capture "$artifact_dir/mock-overview.png"
run_command "Show build graph"
sleep .2
swarm_window_capture "$artifact_dir/build-lens.png"
run_command "Open repository path" "core/files.ts"
swarm_window_wait_title "Source files.ts:saved"
sleep .2
swarm_window_capture "$artifact_dir/document-context.png"
swarm_window_key ctrl+w
swarm_window_wait_title "Source files.ts" absent
sleep .2
swarm_window_capture "$artifact_dir/document-closed.png"
if grep -E '\[console.error\]|Uncaught (Error|TypeError|ReferenceError)|ResizeObserver loop' "$artifact_dir/app.log"; then
  echo "UI sprint rehearsal encountered a renderer error" >&2
  exit 1
fi
echo "UI sprint mock commands and source open/close rehearsal passed; no model turn claimed."
