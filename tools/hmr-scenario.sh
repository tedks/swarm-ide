#!/usr/bin/env bash
set -euo pipefail

source "${SWARM_X11_DRIVER_PATH:?HMR scenario requires the shared X11 driver}"
swarm_x11_assert_owned
swarm_window_assert_selected

workspace=${SWARM_SOURCE_WORKSPACE:-${BUILD_WORKSPACE_DIRECTORY:?}}
artifact_dir=${SWARM_ARTIFACT_DIR:?}
probe="$workspace/app/renderer/hmr-probe.css"
[[ "$(readlink -f "$probe")" == "${SWARM_SCENARIO_RESTORE_PATH:?}" ]] || {
  echo "HMR probe does not match the supervisor restore path" >&2
  exit 2
}

before_title=$(swarm_window_title)
swarm_window_capture "$artifact_dir/before-probe.png" '48x48+0+0'
before_generation=$(sed -n 's/.*HMR \([0-9][0-9]*\):[0-9][0-9]*ms.*/\1/p' <<<"$before_title")
pending_probe=$(mktemp "$(dirname "$probe")/.hmr-probe.css.XXXXXX")
cleanup_pending_probe() {
  [[ -z "$pending_probe" ]] || rm -f -- "$pending_probe"
}
trap cleanup_pending_probe EXIT
sed -E 's/(--hmr-probe-hue: )[0-9]+/\1205/' "$probe" >"${SWARM_SCENARIO_RESTORE_EXPECTED:?}"
grep -q -- '--hmr-probe-hue: 205' "$SWARM_SCENARIO_RESTORE_EXPECTED"
cp --preserve=mode -- "$SWARM_SCENARIO_RESTORE_EXPECTED" "$pending_probe"
start_ms=$(date +%s%3N)
mv -f -- "$pending_probe" "$probe"
pending_probe=""

after_title="$before_title"
after_generation=""
title_ms=""
pixel_ms=""
changed_pixels="0"
for _ in $(seq 1 100); do
  after_title=$(swarm_window_title)
  after_generation=$(sed -n 's/.*HMR \([0-9][0-9]*\):[0-9][0-9]*ms.*/\1/p' <<<"$after_title")
  now_ms=$(date +%s%3N)
  if [[ -z "$title_ms" && -n "$after_generation" && "$after_generation" != "$before_generation" ]]; then
    title_ms=$((now_ms - start_ms))
  fi
  swarm_window_capture "$artifact_dir/after-probe.png" '48x48+0+0'
  pixel_observed_ms=$(date +%s%3N)
  changed_pixels=$(magick "$artifact_dir/before-probe.png" "$artifact_dir/after-probe.png" \
    -compose difference -composite -threshold 0 -format '%[fx:round(mean*w*h)]' info:)
  if [[ -z "$pixel_ms" && "$changed_pixels" =~ ^[0-9]+$ ]] && (( changed_pixels > 0 )); then
    pixel_ms=$((pixel_observed_ms - start_ms))
  fi
  [[ -z "$title_ms" || -z "$pixel_ms" ]] || break
  sleep 0.005
done
[[ -n "$title_ms" ]] || { echo "Vite did not publish a visible HMR generation" >&2; exit 4; }
[[ -n "$pixel_ms" ]] || { echo "HMR title changed but the dedicated screen probe did not" >&2; exit 5; }

paint_ms=$(sed -n 's/.*HMR [0-9][0-9]*:\([0-9][0-9]*\)ms.*/\1/p' <<<"$after_title")
echo "HMR measurement passed"
echo "edit_to_observed_pixel_ms=$pixel_ms"
echo "edit_to_visible_title_ms=$title_ms"
echo "vite_event_to_next_paint_ms=${paint_ms:-unknown}"
echo "changed_pixels=$changed_pixels"
echo "window_id=$SWARM_WINDOW_ID"
echo "window_pid=$SWARM_WINDOW_PID"
echo "app_session=$SWARM_APP_SESSION"
echo "before_title=$before_title"
echo "after_title=$after_title"
echo "artifacts=$artifact_dir"
