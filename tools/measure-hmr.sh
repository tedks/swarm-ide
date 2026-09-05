#!/usr/bin/env bash
set -euo pipefail

workspace="${BUILD_WORKSPACE_DIRECTORY:-}"
if [[ -z "$workspace" ]]; then
  script_path=$(readlink -f "$0")
  workspace=$(cd "$(dirname "$script_path")/.." && pwd)
fi
artifact_dir="${SWARM_ARTIFACT_DIR:-$workspace/artifacts/hmr}"
probe="$workspace/app/renderer/hmr-probe.css"
renderer_argument=$(node "$workspace/tools/dev-port.mjs" renderer-process-argument)
renderer_url=${renderer_argument#*=}

if [[ -z "${DISPLAY:-}" ]]; then
  echo "HMR measurement requires an X11 DISPLAY" >&2
  exit 2
fi
if [[ "${XDG_SESSION_TYPE:-x11}" == "wayland" && "${SWARM_ALLOW_XWAYLAND:-0}" != "1" ]]; then
  echo "HMR measurement detected Wayland; X11 window-title observation is unavailable" >&2
  exit 2
fi

window_id=""
for candidate in $(xdotool search --name '^swarm-ide —' 2>/dev/null || true); do
  candidate_pid=$(xdotool getwindowpid "$candidate" 2>/dev/null || true)
  if [[ -n "$candidate_pid" ]] &&
     tr '\0' '\n' <"/proc/$candidate_pid/cmdline" 2>/dev/null |
       grep -Fq -- "$renderer_argument"; then
    window_id="$candidate"
    break
  fi
done
if [[ -z "$window_id" ]]; then
  echo "no swarm-ide desktop window found for $renderer_url; first run with the same SWARM_DEV_PORT: nix develop --command bazel run //:dev" >&2
  exit 3
fi

mkdir -p "$artifact_dir"
backup=$(mktemp)
cp "$probe" "$backup"
restore_probe() {
  cp "$backup" "$probe"
  rm -f "$backup"
}
trap restore_probe EXIT

wmctrl -i -a "$window_id"
before_title=$(xdotool getwindowname "$window_id")
import -window "$window_id" -crop 48x48+0+0 +repage "$artifact_dir/before-probe.png"
before_generation=$(sed -n 's/.*HMR \([0-9][0-9]*\):[0-9][0-9]*ms.*/\1/p' <<<"$before_title")
start_ms=$(date +%s%3N)
sed -i -E 's/(--hmr-probe-hue: )[0-9]+/\1205/' "$probe"
grep -q -- '--hmr-probe-hue: 205' "$probe"

after_title="$before_title"
after_generation=""
title_ms=""
pixel_ms=""
changed_pixels="0"
for _ in $(seq 1 100); do
  after_title=$(xdotool getwindowname "$window_id")
  after_generation=$(sed -n 's/.*HMR \([0-9][0-9]*\):[0-9][0-9]*ms.*/\1/p' <<<"$after_title")
  now_ms=$(date +%s%3N)
  if [[ -z "$title_ms" && -n "$after_generation" && "$after_generation" != "$before_generation" ]]; then
    title_ms=$((now_ms - start_ms))
  fi
  import -window "$window_id" -crop 48x48+0+0 +repage "$artifact_dir/after-probe.png"
  pixel_observed_ms=$(date +%s%3N)
  changed_pixels=$(magick "$artifact_dir/before-probe.png" "$artifact_dir/after-probe.png" \
    -compose difference -composite -threshold 0 -format '%[fx:round(mean*w*h)]' info:)
  if [[ -z "$pixel_ms" && "$changed_pixels" =~ ^[0-9]+$ ]] && (( changed_pixels > 0 )); then
    pixel_ms=$((pixel_observed_ms - start_ms))
  fi
  if [[ -n "$title_ms" && -n "$pixel_ms" ]]; then
    break
  fi
  sleep 0.005
done
if [[ -z "$title_ms" ]]; then
  echo "Vite did not publish a visible HMR generation" >&2
  exit 4
fi
if [[ -z "$pixel_ms" ]]; then
  echo "HMR title changed but the dedicated screen probe did not" >&2
  exit 5
fi

paint_ms=$(sed -n 's/.*HMR [0-9][0-9]*:\([0-9][0-9]*\)ms.*/\1/p' <<<"$after_title")

echo "HMR measurement passed"
echo "edit_to_observed_pixel_ms=$pixel_ms"
echo "edit_to_visible_title_ms=$title_ms"
echo "vite_event_to_next_paint_ms=${paint_ms:-unknown}"
echo "changed_pixels=$changed_pixels"
echo "renderer_url=$renderer_url"
echo "before_title=$before_title"
echo "after_title=$after_title"
echo "artifacts=$artifact_dir"
