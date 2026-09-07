#!/usr/bin/env bash
# Exercises the real topology publication and source-editor transitions after
# virtual-desktop-run.sh has selected the exact owned Electron window.
set -euo pipefail

[[ -n "${SWARM_X11_DRIVER_PATH:-}" && -f "$SWARM_X11_DRIVER_PATH" ]] || {
  echo "topology scenario requires the shared X11 driver" >&2
  exit 2
}
# shellcheck source=tools/x11-driver.sh
source "$SWARM_X11_DRIVER_PATH"
swarm_x11_assert_owned
swarm_window_assert_selected

artifact_dir=${SWARM_ARTIFACT_DIR:?}
mkdir -p "$artifact_dir"

before_zoom_revision=""
for _ in $(seq 1 100); do
  initial_zoom_title=$(swarm_window_title)
  before_zoom_revision=$(sed -n 's/.*Zoom [0-9][0-9]*%@\([0-9][0-9]*\).*/\1/p' <<<"$initial_zoom_title")
  [[ -n "$before_zoom_revision" ]] && break
  sleep 0.04
done
if [[ -z "$before_zoom_revision" ]]; then
  echo "initial zoom never reached a confirmed state: ${initial_zoom_title:-unknown}" >&2
  exit 4
fi
swarm_window_key ctrl+0
after_zoom_revision=""
for _ in $(seq 1 100); do
  zoom_title=$(swarm_window_title)
  after_zoom_revision=$(sed -n 's/.*Zoom 100%@\([0-9][0-9]*\).*/\1/p' <<<"$zoom_title")
  if [[ -n "$after_zoom_revision" ]] && (( after_zoom_revision > before_zoom_revision )); then break; fi
  sleep 0.04
done
if [[ -z "$after_zoom_revision" ]] || (( after_zoom_revision <= before_zoom_revision )); then
  echo "Ctrl+0 did not receive a confirmed zoom acknowledgment: ${zoom_title:-unknown}" >&2
  exit 4
fi

geometry=$(swarm_window_geometry)
WIDTH=$(sed -n 's/^WIDTH=//p' <<<"$geometry")
HEIGHT=$(sed -n 's/^HEIGHT=//p' <<<"$geometry")
if [[ ! "$WIDTH" =~ ^[0-9]+$ || ! "$HEIGHT" =~ ^[0-9]+$ ]]; then
  echo "could not parse Electron window geometry" >&2
  exit 4
fi

capture_window() {
  local destination="$1"
  sleep 0.05
  swarm_window_capture "$destination"
}

run_command() {
  local command="$1"
  swarm_window_key Escape
  swarm_window_wait_title "Palette open" absent
  swarm_window_key ctrl+k
  swarm_window_wait_title "Palette open"
  local palette_input_y=$((HEIGHT * 11 / 100 + 26))
  swarm_window_click "$((WIDTH / 2))" "$palette_input_y"
  swarm_window_key ctrl+a
  swarm_window_type "$command" 10
  last_command_submitted_ms=$(date +%s%3N)
  swarm_window_key Return
  if (( $# == 2 )); then
    # Exact-path mode remains in the same palette until the path is submitted.
    swarm_window_wait_title "Palette open · exact path"
    swarm_window_key ctrl+a
    swarm_window_type "$2" 10
    swarm_window_key Return
  fi
  swarm_window_wait_title "Palette open" absent
}

current_title=$(swarm_window_title)
if [[ "$current_title" != *" — Graphs — "* ]]; then
  run_command "Show system graphs"
  swarm_window_wait_title "Graphs"
fi
capture_window "$artifact_dir/before.png"

run_command "Build repository service topology"
build_started_ms=$last_command_submitted_ms
swarm_window_wait_title "Reconciling"
yellow_ms=$(( $(date +%s%3N) - build_started_ms ))
yellow_title=$(swarm_window_title)
if [[ "$yellow_title" != *"Graphs"* ]]; then
  echo "yellow state left the graph surface unexpectedly: $yellow_title" >&2
  exit 4
fi
# Cold CI recompiles protobuf/protoc in the isolated nested cache (197 actions;
# hosted evidence was still compiling action80 at90s, outer cold build264s).
# Budget initial preparation separately; never spend this budget on hot rebuilds.
swarm_window_wait_title "Consistent" present 360000
swarm_window_wait_title "FraudCheck visible"
green_ms=$(( $(date +%s%3N) - build_started_ms ))
green_title=$(swarm_window_title)
if [[ "$green_title" != *"Consistent"* ]]; then
  echo "topology did not reach a consistent real publication: $green_title" >&2
  exit 4
fi
capture_window "$artifact_dir/reconciled.png"

# Rebuild the same working world through the UI, not a differently warmed input.
# A warm no-op can finish before a yellow frame is sampled. Require the next
# persistent green epoch instead, scoped to this same core/document lifetime.
before_epoch=$(sed -n 's/.* — Topology \([0-9][0-9]*\):green.*/\1/p' <<<"$green_title")
before_lifetime=$(sed -n 's/.* — Core \([0-9][0-9]*\):ready — Doc \([0-9][0-9]*\).*/\1:\2/p' <<<"$green_title")
if [[ -z "$before_epoch" || -z "$before_lifetime" ]]; then
  echo "missing initial topology epoch or core/document identity" >&2
  exit 4
fi
run_command "Build repository service topology"
incremental_started_ms=$last_command_submitted_ms
swarm_window_wait_title "Topology $((before_epoch + 1)):green" present 30000
incremental_title=$(swarm_window_title)
after_lifetime=$(sed -n 's/.* — Core \([0-9][0-9]*\):ready — Doc \([0-9][0-9]*\).*/\1:\2/p' <<<"$incremental_title")
if [[ "$after_lifetime" != "$before_lifetime" || "$incremental_title" != *" — Consistent — "* ]]; then
  echo "incremental build lost its consistent core/document lifetime" >&2
  exit 4
fi
swarm_window_wait_title "FraudCheck visible"
incremental_ms=$(( $(date +%s%3N) - incremental_started_ms ))

run_command "Open repository path" "examples/checkout-world/services/fraudcheck/fraudcheck.ts"
swarm_window_wait_title "Source fraudcheck.ts"
capture_window "$artifact_dir/fraudcheck-source.png"

run_command "Open repository path" "examples/checkout-world/services/fraudcheck/fraudcheck.proto"
swarm_window_wait_title "Source fraudcheck.proto"
capture_window "$artifact_dir/fraudcheck-contract.png"

run_command "Show system graphs"
# Graph focus no longer closes or replaces the independent text document.
swarm_window_wait_title "Source fraudcheck.proto"
swarm_window_wait_title "FraudCheck visible"
capture_window "$artifact_dir/returned-to-graphs.png"

changed_pixels=$(magick "$artifact_dir/reconciled.png" "$artifact_dir/fraudcheck-source.png" \
  -compose difference -composite -threshold 0 -format '%[fx:round(mean*w*h)]' info:)
if ! awk -v changed="$changed_pixels" 'BEGIN { exit !(changed + 0 >= 1000) }'; then
  echo "desktop source assertion failed: only '$changed_pixels' pixels changed" >&2
  exit 5
fi

echo "desktop topology scenario passed"
echo "window_id=$SWARM_WINDOW_ID"
echo "window_pid=$SWARM_WINDOW_PID"
echo "app_session=$SWARM_APP_SESSION"
echo "renderer_marker=$SWARM_RENDERER_PROCESS_ARGUMENT"
echo "window_title=$(swarm_window_title)"
echo "click_to_yellow_ms=$yellow_ms"
echo "click_to_green_ms=$green_ms"
echo "incremental_to_green_ms=$incremental_ms"
echo "changed_pixels=$changed_pixels"
echo "artifacts=$artifact_dir"
identify "$artifact_dir/before.png" "$artifact_dir/reconciled.png" "$artifact_dir/fraudcheck-source.png" "$artifact_dir/fraudcheck-contract.png" "$artifact_dir/returned-to-graphs.png"
