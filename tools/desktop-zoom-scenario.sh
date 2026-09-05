#!/usr/bin/env bash
# Exercises renderer zoom inside the disposable virtual desktop. No restoration
# is needed because the app profile and process are invocation-owned.
set -euo pipefail

[[ -n "${SWARM_X11_DRIVER_PATH:-}" && -f "$SWARM_X11_DRIVER_PATH" ]] || {
  echo "zoom scenario requires the shared X11 driver" >&2
  exit 2
}
# shellcheck source=tools/x11-driver.sh
source "$SWARM_X11_DRIVER_PATH"
swarm_x11_assert_owned
swarm_window_assert_selected

artifact_dir=${SWARM_ARTIFACT_DIR:?}
mkdir -p "$artifact_dir"

zoom_revision() {
  sed -n 's/.*Zoom [0-9][0-9]*%@\([0-9][0-9]*\).*/\1/p' <<<"$1"
}

wait_for_zoom_ready() {
  local title=""
  for _ in $(seq 1 100); do
    title=$(swarm_window_title)
    if [[ "$title" != *"Zoom applying"* && -n "$(zoom_revision "$title")" ]]; then return 0; fi
    sleep 0.04
  done
  echo "zoom did not reach a confirmed state: $title" >&2
  return 1
}

apply_zoom_shortcut() {
  local chord="$1"
  local expected="$2"
  local before after="" title
  swarm_window_activate
  wait_for_zoom_ready
  title=$(swarm_window_title)
  before=$(zoom_revision "$title")
  swarm_window_key "$chord"
  for _ in $(seq 1 100); do
    title=$(swarm_window_title)
    after=$(zoom_revision "$title")
    if [[ "$title" == *"Zoom ${expected}%@"* && -n "$after" ]] && (( after > before )); then return 0; fi
    sleep 0.04
  done
  echo "zoom chord '$chord' did not confirm ${expected}% after revision $before: $title" >&2
  return 1
}

capture_window() {
  local destination="$1"
  swarm_window_activate
  sleep 0.1
  swarm_window_capture "$destination"
}

wait_for_zoom_ready
swarm_window_key Escape
apply_zoom_shortcut ctrl+0 100
capture_window "$artifact_dir/zoom-100.png"

swarm_window_key ctrl+k
swarm_window_wait_title "Palette open"
swarm_window_type 'focus remains' 4
capture_window "$artifact_dir/zoom-100-focused.png"
apply_zoom_shortcut ctrl+equal 125
swarm_window_wait_title "Palette open"
capture_window "$artifact_dir/zoom-125-focused.png"
swarm_window_type ' editable' 20
capture_window "$artifact_dir/zoom-125-focus-retained.png"

swarm_window_key ctrl+r
swarm_window_wait_title "Palette open" absent
wait_for_zoom_ready
swarm_window_wait_title "Zoom 125%@"
capture_window "$artifact_dir/zoom-125-reloaded.png"

apply_zoom_shortcut ctrl+shift+equal 150
apply_zoom_shortcut ctrl+shift+equal 160
for _ in $(seq 1 4); do apply_zoom_shortcut ctrl+shift+equal 160; done
capture_window "$artifact_dir/zoom-160-bound.png"

for expected in 150 125 100 90 80; do
  apply_zoom_shortcut ctrl+minus "$expected"
done
for _ in $(seq 1 4); do apply_zoom_shortcut ctrl+minus 80; done
capture_window "$artifact_dir/zoom-80-bound.png"

apply_zoom_shortcut ctrl+0 100
capture_window "$artifact_dir/zoom-reset.png"

pixel_difference() {
  local first="$1"
  local second="$2"
  local raw
  raw=$(magick "$first" "$second" -compose difference -composite -threshold 0 -format '%[fx:mean*w*h]' info:)
  awk -v value="$raw" 'BEGIN { printf "%.0f", value }'
}

total_pixels_raw=$(identify -format '%[fx:w*h]' "$artifact_dir/zoom-100.png")
total_pixels=$(awk -v value="$total_pixels_raw" 'BEGIN { printf "%.0f", value }')
minimum_changed_pixels=$((total_pixels / 20))
changed_pixels=$(pixel_difference "$artifact_dir/zoom-100-focused.png" "$artifact_dir/zoom-125-focused.png")
reload_changed_pixels=$(pixel_difference "$artifact_dir/zoom-125-reloaded.png" "$artifact_dir/zoom-reset.png")
restored_pixels=$(pixel_difference "$artifact_dir/zoom-100.png" "$artifact_dir/zoom-reset.png")
if [[ ! "$changed_pixels" =~ ^[0-9]+$ ]] || (( changed_pixels < minimum_changed_pixels )); then
  echo "zoom assertion failed: only '$changed_pixels' pixels changed" >&2
  exit 4
fi
if [[ ! "$reload_changed_pixels" =~ ^[0-9]+$ ]] || (( reload_changed_pixels < minimum_changed_pixels )); then
  echo "reloaded zoom assertion failed: only '$reload_changed_pixels' pixels changed before reset" >&2
  exit 4
fi
if [[ ! "$restored_pixels" =~ ^[0-9]+$ ]] || (( restored_pixels >= minimum_changed_pixels )); then
  echo "reset assertion failed: '$restored_pixels' pixels still differ from the 100% baseline" >&2
  exit 4
fi

echo "desktop zoom scenario passed"
echo "window_id=$SWARM_WINDOW_ID"
echo "window_pid=$SWARM_WINDOW_PID"
echo "app_session=$SWARM_APP_SESSION"
echo "renderer_marker=$SWARM_RENDERER_PROCESS_ARGUMENT"
echo "window_title=$(swarm_window_title)"
echo "changed_pixels=$changed_pixels"
echo "reload_changed_pixels=$reload_changed_pixels"
echo "restored_pixels=$restored_pixels"
echo "artifacts=$artifact_dir"
identify "$artifact_dir/zoom-100.png" "$artifact_dir/zoom-100-focused.png" \
  "$artifact_dir/zoom-125-focused.png" "$artifact_dir/zoom-125-focus-retained.png" \
  "$artifact_dir/zoom-125-reloaded.png" "$artifact_dir/zoom-160-bound.png" \
  "$artifact_dir/zoom-80-bound.png" "$artifact_dir/zoom-reset.png"
