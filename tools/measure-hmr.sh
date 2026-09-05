#!/usr/bin/env bash
set -euo pipefail

workspace="${BUILD_WORKSPACE_DIRECTORY:-}"
if [[ -z "$workspace" ]]; then
  script_path=$(readlink -f "$0")
  workspace=$(cd "$(dirname "$script_path")/.." && pwd)
fi
artifact_dir="${SWARM_ARTIFACT_DIR:-$workspace/artifacts/hmr}"
probe="$workspace/app/renderer/hmr-probe.css"

if [[ -z "${DISPLAY:-}" ]]; then
  echo "HMR measurement requires an X11 DISPLAY" >&2
  exit 2
fi
if [[ "${XDG_SESSION_TYPE:-x11}" == "wayland" && "${SWARM_ALLOW_XWAYLAND:-0}" != "1" ]]; then
  echo "HMR measurement detected Wayland; X11 window-title observation is unavailable" >&2
  exit 2
fi

window_id=$(xdotool search --name '^swarm-ide —' 2>/dev/null | head -n1 || true)
if [[ -z "$window_id" ]]; then
  echo "no swarm-ide desktop window found; first run: nix develop --command bazel run //:dev" >&2
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
import -window "$window_id" "$artifact_dir/before.png"
start_ms=$(date +%s%3N)
sed -i 's/--hmr-probe-hue: 165/--hmr-probe-hue: 166/' "$probe"

after_title="$before_title"
for _ in $(seq 1 100); do
  after_title=$(xdotool getwindowname "$window_id")
  if [[ "$after_title" != "$before_title" && "$after_title" == *"HMR "* ]]; then
    break
  fi
  sleep 0.01
done
if [[ "$after_title" == "$before_title" ]]; then
  echo "Vite did not publish a visible HMR generation" >&2
  exit 4
fi
end_ms=$(date +%s%3N)
import -window "$window_id" "$artifact_dir/after.png"

paint_ms=$(sed -n 's/.*HMR [0-9][0-9]*:\([0-9][0-9]*\)ms.*/\1/p' <<<"$after_title")
difference=$(compare -metric AE "$artifact_dir/before.png" "$artifact_dir/after.png" null: 2>&1 || true)
changed_pixels=${difference%% *}
if [[ ! "$changed_pixels" =~ ^[0-9]+([.][0-9]+)?$ ]] || ! awk -v value="$changed_pixels" 'BEGIN { exit !(value > 0) }'; then
  echo "HMR title changed but screenshot assertion did not" >&2
  exit 5
fi

echo "HMR measurement passed"
echo "edit_to_visible_title_ms=$((end_ms - start_ms))"
echo "vite_event_to_next_paint_ms=${paint_ms:-unknown}"
echo "changed_pixels=$changed_pixels"
echo "before_title=$before_title"
echo "after_title=$after_title"
echo "artifacts=$artifact_dir"
