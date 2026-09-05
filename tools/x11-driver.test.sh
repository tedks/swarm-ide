#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "x11-driver.test: $*" >&2
  exit 1
}

expect_failure() {
  local label="$1"
  shift
  if "$@" >"$test_root/$label.stdout" 2>"$test_root/$label.stderr"; then
    fail "$label unexpectedly succeeded"
  fi
}

make_proc_entry() {
  local pid="$1"
  local command_line="$2"
  local start_ticks="${3:-1000}"
  mkdir -p "$proc_root/$pid"
  printf '%s (fake process) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 %s 0 0\n' "$pid" "$start_ticks" >"$proc_root/$pid/stat"
  printf '%s\0' "$command_line" >"$proc_root/$pid/cmdline"
}

test_root=$(mktemp -d "${TEST_TMPDIR:-/tmp}/swarm-x11-driver-test.XXXXXX")
trap 'rm -rf -- "$test_root"' EXIT
proc_root="$test_root/proc"
owner_dir="$test_root/owner"
bin_dir="$test_root/bin"
mkdir -p "$proc_root" "$owner_dir" "$bin_dir"
chmod 700 "$owner_dir"
authority="$test_root/Xauthority"
touch "$authority"
token="driver-test-token"
marker="--swarm-window-marker=http://127.0.0.1:55174/"

for record in display xauthority token xvfb.pid xvfb.start; do : >"$owner_dir/$record"; done
printf ':99\n' >"$owner_dir/display"
printf '%s\n' "$authority" >"$owner_dir/xauthority"
printf '%s\n' "$token" >"$owner_dir/token"
printf '101\n' >"$owner_dir/xvfb.pid"
printf '999\n' >"$owner_dir/xvfb.start"

make_proc_entry 101 "Xvfb :99 -auth $authority" 999
make_proc_entry 202 "electron renderer $marker"
make_proc_entry 203 "electron renderer without marker"
make_proc_entry 204 "electron renderer $marker"
make_proc_entry 205 "electron renderer $marker"

cat >"$bin_dir/ps" <<'SH'
#!/usr/bin/env bash
pid=${!#}
case "$pid" in
  101) echo 101 ;;
  202|203|205) echo 500 ;;
  204) echo 600 ;;
  *) exit 1 ;;
esac
SH

cat >"$bin_dir/xdotool" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|%s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
command_name=${1:-}
shift || true
case "$command_name" in
  search)
    if [[ "${SWARM_FAKE_AMBIGUOUS:-0}" == 1 ]]; then
      printf '11\n15\n'
    else
      printf '10\n11\n12\n14\n'
    fi
    ;;
  getwindowpid)
    case "${1:-}" in
      10) echo 203 ;;
      11) echo 202 ;;
      12) echo 204 ;;
      14) echo not-a-pid ;;
      15) echo 205 ;;
      *) exit 1 ;;
    esac
    ;;
  getwindowname)
    case "${1:-}" in
      10) echo 'unrelated editor' ;;
      *) echo "${SWARM_FAKE_TITLE:-swarm-ide — Graphs — Consistent — Zoom 100%@1}" ;;
    esac
    ;;
  getactivewindow) echo 11 ;;
  getwindowgeometry) printf 'X=0\nY=0\nWIDTH=1200\nHEIGHT=800\nSCREEN=0\n' ;;
  key|type|mousemove)
    [[ "${SWARM_FAKE_INPUT_FAIL:-0}" != 1 ]]
    ;;
  *) exit 1 ;;
esac
SH

cat >"$bin_dir/wmctrl" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|%s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
[[ "${SWARM_FAKE_ACTIVATE_FAIL:-0}" != 1 ]]
SH

cat >"$bin_dir/import" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|%s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
[[ "${SWARM_FAKE_CAPTURE_FAIL:-0}" != 1 ]] || exit 9
printf 'fake png\n' >"${!#}"
SH
chmod +x "$bin_dir/ps" "$bin_dir/xdotool" "$bin_dir/wmctrl" "$bin_dir/import"

export SWARM_PROC_ROOT="$proc_root"
export SWARM_PS_BIN="$bin_dir/ps"
export SWARM_XDOTOOL_BIN="$bin_dir/xdotool"
export SWARM_WMCTRL_BIN="$bin_dir/wmctrl"
export SWARM_IMPORT_BIN="$bin_dir/import"
export SWARM_X11_OWNERSHIP_DIR="$owner_dir"
export SWARM_X11_DISPLAY=:99
export SWARM_X11_XAUTHORITY="$authority"
export SWARM_X11_TOKEN="$token"
export SWARM_FAKE_GUI_LOG="$test_root/gui.log"
export DISPLAY=:0
export XAUTHORITY="$test_root/ambient-authority"

# shellcheck source=tools/x11-driver.sh
source "$(dirname "$0")/x11-driver.sh"

expect_failure hostile-ambient swarm_x11_assert_owned
[[ ! -s "$SWARM_FAKE_GUI_LOG" ]] || fail "hostile ambient validation invoked a GUI command"

export DISPLAY=:99
export XAUTHORITY="$authority"
swarm_x11_assert_owned
swarm_window_select "$marker" 500 '^swarm-ide —' 250
[[ "$SWARM_WINDOW_ID" == 11 && "$SWARM_WINDOW_PID" == 202 ]] || fail "decoys were not rejected"
swarm_window_activate
swarm_window_wait_title Consistent present 250
geometry=$(swarm_window_geometry)
grep -q '^WIDTH=1200$' <<<"$geometry" || fail "geometry was not returned"
swarm_window_key ctrl+k
swarm_window_type 'safe text' 0
swarm_window_click 10 20
swarm_window_capture "$test_root/capture.png"
swarm_window_capture "$test_root/crop.png" '48x48+0+0'
[[ -s "$test_root/capture.png" ]] || fail "capture was not written"
[[ -s "$test_root/crop.png" ]] || fail "cropped capture was not written"
expect_failure invalid-crop swarm_window_capture "$test_root/invalid.png" '../unsafe'
if grep -q '^:0|' "$SWARM_FAKE_GUI_LOG"; then
  fail "a GUI command targeted the ambient display"
fi
if grep -v "^:99|$authority|" "$SWARM_FAKE_GUI_LOG" | grep -q .; then
  fail "a GUI command lacked the owned display or Xauthority"
fi

export SWARM_FAKE_INPUT_FAIL=1
expect_failure input-failure swarm_window_key ctrl+k
unset SWARM_FAKE_INPUT_FAIL
export SWARM_FAKE_CAPTURE_FAIL=1
expect_failure capture-failure swarm_window_capture "$test_root/failed.png"
unset SWARM_FAKE_CAPTURE_FAIL

export SWARM_FAKE_AMBIGUOUS=1
expect_failure ambiguous swarm_window_select "$marker" 500 '^swarm-ide —' 250
unset SWARM_FAKE_AMBIGUOUS

printf 'wrong-token\n' >"$owner_dir/token"
expect_failure wrong-token swarm_x11_assert_owned
printf '%s\n' "$token" >"$owner_dir/token"
printf '998\n' >"$owner_dir/xvfb.start"
expect_failure reused-xserver-pid swarm_x11_assert_owned
printf '999\n' >"$owner_dir/xvfb.start"
rm "$proc_root/101/stat"
expect_failure dead-xserver swarm_x11_assert_owned

echo "x11 driver adversarial tests passed"
