#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "virtual-desktop-supervisor.test: $*" >&2
  exit 1
}

test_root=$(mktemp -d "${TEST_TMPDIR:-/tmp}/swarm-virtual-supervisor-test.XXXXXX")
unrelated_pid=""
runner_pid=""
cleanup_test() {
  [[ -z "$runner_pid" ]] || kill -KILL "$runner_pid" 2>/dev/null || true
  [[ -z "$unrelated_pid" ]] || kill -TERM "$unrelated_pid" 2>/dev/null || true
  rm -rf -- "$test_root"
}
trap cleanup_test EXIT

bin_dir="$test_root/bin"
runtime_root="$test_root/runtime"
lock_root="$test_root/locks"
socket_root="$test_root/sockets"
mkdir -p "$bin_dir" "$runtime_root" "$lock_root" "$socket_root"
runner=$(readlink -f "$(dirname "$0")/virtual-desktop-run.sh")

cat >"$bin_dir/xauth" <<'SH'
#!/usr/bin/env bash
[[ "${SWARM_FAKE_XAUTH_FAIL:-0}" != 1 ]]
SH
cat >"$bin_dir/Xvfb" <<'SH'
#!/usr/bin/env bash
[[ "${SWARM_FAKE_XVFB_EXIT:-0}" != 1 ]] || exit 19
trap 'exit 0' TERM INT HUP
while :; do sleep 1; done
SH
cat >"$bin_dir/xdpyinfo" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|xdpyinfo %s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
[[ "${SWARM_FAKE_XDPYINFO_FAIL:-0}" != 1 ]]
SH
cat >"$bin_dir/openbox" <<'SH'
#!/usr/bin/env bash
[[ "${SWARM_FAKE_WM_EXIT:-0}" != 1 ]] || exit 23
trap 'exit 0' TERM INT HUP
while :; do sleep 1; done
SH
cat >"$bin_dir/wmctrl" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|wmctrl %s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
[[ "${SWARM_FAKE_WMCTRL_FAIL:-0}" != 1 ]]
SH
cat >"$bin_dir/xdotool" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|xdotool %s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
command_name=${1:-}
shift || true
case "$command_name" in
  search) echo 41 ;;
  getwindowpid) cat "$SWARM_X11_OWNERSHIP_DIR/app.pid" ;;
  getwindowname) echo 'swarm-ide — Graphs — Consistent — Zoom 100%@1' ;;
  getactivewindow) echo 41 ;;
  getwindowgeometry) printf 'X=0\nY=0\nWIDTH=1200\nHEIGHT=800\nSCREEN=0\n' ;;
  key|type|mousemove) [[ "${SWARM_FAKE_INPUT_FAIL:-0}" != 1 ]] ;;
  *) exit 1 ;;
esac
SH
cat >"$bin_dir/import" <<'SH'
#!/usr/bin/env bash
printf '%s|%s|import %s\n' "${DISPLAY:-unset}" "${XAUTHORITY:-unset}" "$*" >>"$SWARM_FAKE_GUI_LOG"
[[ "${SWARM_FAKE_CAPTURE_FAIL:-0}" != 1 ]] || exit 31
[[ "${SWARM_FAKE_CAPTURE_SLEEP:-0}" != 1 ]] || sleep 30
printf 'synthetic virtual screenshot\n' >"${!#}"
SH
cat >"$bin_dir/ps-with-stale-member" <<'SH'
#!/usr/bin/env bash
"$SWARM_REAL_PS_BIN" "$@"
if [[ "$#" == 3 && "$1" == -e && "$2" == -o && "$3" == pid=,sid= &&
      -n "${SWARM_FAKE_UNRELATED_PID:-}" && -f "$SWARM_X11_OWNERSHIP_DIR/app.session" ]]; then
  printf '%s %s\n' "$SWARM_FAKE_UNRELATED_PID" "$(<"$SWARM_X11_OWNERSHIP_DIR/app.session")"
fi
SH
cat >"$bin_dir/dev" <<'SH'
#!/usr/bin/env bash
[[ "${SWARM_FAKE_APP_EXIT:-0}" != 1 ]] || exit 29
if [[ -n "${SWARM_FAKE_BAZEL_LOG:-}" ]]; then
  digest=$(printf '%s' "$BUILD_WORKSPACE_DIRECTORY" | md5sum | cut -d' ' -f1)
  base="$TEST_TMPDIR/_bazel_$(id -un)/$digest"
  mkdir -p "$base"
  case "$SWARM_FAKE_BAZEL_LOG" in
    fifo) mkfifo "$base/command.log" ;;
    symlink) ln -s "$SWARM_FAKE_SECRET_FILE" "$base/command.log" ;;
    progress)
      printf 'header\nPRIVATE_SOURCE_CANARY\n[1 / 197] Compiling src/google/protobuf/descriptor.cc [for tool]; 2s\nINFO: Elapsed time: 21.0s\n' >"$base/command.log" ;;
  esac
fi
exec -a "fake-electron $SWARM_RENDERER_PROCESS_ARGUMENT" node -e '
  const http = require("node:http");
  const server = http.createServer((_, response) => response.end("ok"));
  server.listen(Number(process.argv[1]), "127.0.0.1");
' "$SWARM_DEV_PORT"
SH
cat >"$bin_dir/scenario" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$DISPLAY" != :0 ]]
[[ "$DISPLAY" == "$SWARM_X11_DISPLAY" && "$XAUTHORITY" == "$SWARM_X11_XAUTHORITY" ]]
source "$SWARM_X11_DRIVER_PATH"
swarm_x11_assert_owned
swarm_window_assert_selected
printf 'started\n' >"$SWARM_ARTIFACT_DIR/scenario-started"
if [[ "${SWARM_FAKE_SCENARIO_SLEEP:-0}" == 1 ]]; then sleep 30; fi
swarm_window_key ctrl+k
swarm_window_capture "$SWARM_ARTIFACT_DIR/synthetic.png"
if [[ "${SWARM_FAKE_TAMPER_LOCK:-0}" == 1 ]]; then
  printf 'foreign-owner\n' >"$SWARM_X11_DISPLAY_LOCK/token"
fi
[[ "${SWARM_FAKE_SCENARIO_FAIL:-0}" != 1 ]]
SH
chmod +x "$bin_dir"/*

base_env=(
  DISPLAY=:0
  XAUTHORITY="$test_root/hostile-authority"
  SWARM_X11_RUNTIME_ROOT="$runtime_root"
  SWARM_X11_LOCK_ROOT="$lock_root"
  SWARM_X11_SOCKET_ROOT="$socket_root"
  SWARM_XVFB_BIN="$bin_dir/Xvfb"
  SWARM_XAUTH_BIN="$bin_dir/xauth"
  SWARM_WM_BIN="$bin_dir/openbox"
  SWARM_XDPYINFO_BIN="$bin_dir/xdpyinfo"
  SWARM_WMCTRL_BIN="$bin_dir/wmctrl"
  SWARM_XDOTOOL_BIN="$bin_dir/xdotool"
  SWARM_IMPORT_BIN="$bin_dir/import"
  SWARM_SUPERVISOR_TEST_MODE=1
  SWARM_X_START_TIMEOUT_MS=300
  SWARM_WM_START_TIMEOUT_MS=300
  SWARM_APP_START_TIMEOUT_MS=1000
  SWARM_WINDOW_START_TIMEOUT_MS=500
)

next_case=0
case_dir=""
case_display=""
case_port=""
prepare_case() {
  local name="$1"
  next_case=$((next_case + 1))
  case_dir="$test_root/cases/$name"
  case_display=":$((110 + next_case))"
  case_port="$((58000 + next_case))"
  mkdir -p "$case_dir"
}

run_success() {
  local name="$1"
  shift
  prepare_case "$name"
  env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
    SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" "$@" \
    "$runner" "$bin_dir/scenario" "$bin_dir/dev" "$name" >"$case_dir/output" 2>&1 || {
      cat "$case_dir/output" >&2
      fail "$name failed"
    }
  grep -q 'virtual desktop smoke passed' "$case_dir/output" || fail "$name lacked success proof"
  grep -q 'cleanup_complete=1' "$case_dir/supervisor.log" || fail "$name did not clean up"
  [[ -s "$case_dir/synthetic.png" ]] || fail "$name did not retain a screenshot"
  if grep -q '^:0|' "$case_dir/gui.log"; then fail "$name targeted ambient DISPLAY=:0"; fi
  if grep -v "^$case_display|" "$case_dir/gui.log" | grep -q .; then fail "$name used a different display"; fi
  [[ ! -e "$lock_root/.swarm-ide-x11-${case_display#:}.lock" ]] || fail "$name left a display lock"
}

run_failure() {
  local name="$1" expected="$2"
  shift 2
  prepare_case "$name"
  if env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
    SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" "$@" \
    "$runner" "$bin_dir/scenario" "$bin_dir/dev" "$name" >"$case_dir/output" 2>&1; then
    fail "$name unexpectedly succeeded"
  fi
  grep -q "$expected" "$case_dir/output" || {
    cat "$case_dir/output" >&2
    fail "$name lacked expected diagnostic '$expected'"
  }
  if [[ -s "$case_dir/gui.log" ]] && grep -q '^:0|' "$case_dir/gui.log"; then
    fail "$name targeted ambient DISPLAY=:0"
  fi
}

run_success hostile-ambient
# A second identical use of the same explicit display and port proves normal
# teardown is idempotent and leaves no stale ownership state.
reused_display=$case_display
reused_port=$case_port
next_case=$((next_case - 1))
run_success teardown-idempotent
[[ "$case_display" == "$reused_display" && "$case_port" == "$reused_port" ]] || fail "teardown reuse setup drifted"

run_success bounded-build-progress TEST_TMPDIR="$test_root/progress-tmp" SWARM_FAKE_BAZEL_LOG=progress
grep -q 'toolchain-work-observed' "$case_dir/topology-build.txt" || fail 'lost nested compiler progress'
grep -q 'INFO: Elapsed time: 21.0s' "$case_dir/topology-build.txt" || fail 'lost build timing'
if grep -q PRIVATE_SOURCE_CANARY "$case_dir/topology-build.txt"; then fail 'copied compiler source into diagnostics'; fi
printf 'PRIVATE_SOURCE_CANARY\n' >"$test_root/secret-canary"
run_success reject-log-symlink TEST_TMPDIR="$test_root/symlink-tmp" SWARM_FAKE_BAZEL_LOG=symlink SWARM_FAKE_SECRET_FILE="$test_root/secret-canary"
grep -q 'nested_log=unavailable-or-unsafe' "$case_dir/topology-build.txt" || fail 'followed symlink log'
run_success reject-log-fifo TEST_TMPDIR="$test_root/fifo-tmp" SWARM_FAKE_BAZEL_LOG=fifo
grep -q 'nested_log=unavailable-or-unsafe' "$case_dir/topology-build.txt" || fail 'accepted FIFO log'

run_failure missing-wm 'SWARM_WM_BIN must name an executable absolute path' SWARM_WM_BIN="$test_root/missing-wm"
run_failure missing-automation 'SWARM_XDOTOOL_BIN must name an executable absolute path' SWARM_XDOTOOL_BIN="$test_root/missing-xdotool"
run_failure xserver-exit 'X server exited' SWARM_FAKE_XVFB_EXIT=1
run_failure xserver-timeout 'X server readiness timed out' SWARM_FAKE_XDPYINFO_FAIL=1
run_failure wm-exit 'window manager exited' SWARM_FAKE_WM_EXIT=1
run_failure app-exit 'app exited' SWARM_FAKE_APP_EXIT=1
run_failure input-failure 'key input failed' SWARM_FAKE_INPUT_FAIL=1
run_failure capture-failure 'screenshot capture failed' SWARM_FAKE_CAPTURE_FAIL=1
run_failure scenario-failure 'scenario exited with status' SWARM_FAKE_SCENARIO_FAIL=1
[[ -s "$case_dir/failure.png" ]] || fail 'scenario failure lost its pre-teardown screenshot'
[[ -s "$case_dir/topology-build.txt" ]] || fail 'scenario failure lost bounded build diagnostics'
grep -q 'cleanup_complete=1' "$case_dir/supervisor.log" || fail 'failure diagnostics disrupted cleanup'
run_failure scenario-timeout 'scenario timed out' SWARM_FAKE_SCENARIO_SLEEP=1 SWARM_SCENARIO_TIMEOUT_SECONDS=1
[[ -s "$case_dir/failure.png" ]] || fail 'timeout lost its pre-teardown screenshot'
run_failure blocked-failure-capture 'failure screenshot unavailable' SWARM_FAKE_CAPTURE_SLEEP=1 SWARM_SCENARIO_TIMEOUT_SECONDS=1
grep -q 'cleanup_complete=1' "$case_dir/supervisor.log" || fail 'blocked failure capture prevented cleanup'

run_failure cleanup-failure 'cleanup_complete=0' SWARM_FAKE_TAMPER_LOCK=1
cleanup_failure_lock="$lock_root/.swarm-ide-x11-${case_display#:}.lock"
[[ -f "$cleanup_failure_lock/token" && "$(<"$cleanup_failure_lock/token")" == foreign-owner ]] ||
  fail "cleanup failure did not preserve the foreign lock token"
rm -f -- "$cleanup_failure_lock/token"
rmdir -- "$cleanup_failure_lock"

run_failure reused-session-leader 'REFUSED: session leader PID' SWARM_TEST_TAMPER_APP_START=1
reused_session=$(sed -n 's/^app_session=//p' "$case_dir/ownership.txt")
[[ "$reused_session" =~ ^[1-9][0-9]*$ ]] || fail "reused-session test did not record the app session"
kill -TERM -- "-$reused_session" 2>/dev/null || true
for _ in $(seq 1 50); do
  [[ -z "$(ps -e -o sid= | awk -v wanted="$reused_session" '$1 == wanted { print; exit }')" ]] && break
  sleep 0.02
done
[[ -z "$(ps -e -o sid= | awk -v wanted="$reused_session" '$1 == wanted { print; exit }')" ]] ||
  fail "reused-session test cleanup could not stop its intentionally retained app"

setsid sleep 60 &
unrelated_pid=$!
run_failure stale-member-pid "REFUSED: PID $unrelated_pid" \
  SWARM_PS_BIN="$bin_dir/ps-with-stale-member" SWARM_REAL_PS_BIN="$(command -v ps)" \
  SWARM_FAKE_UNRELATED_PID="$unrelated_pid"
kill -0 "$unrelated_pid" || fail "stale-member validation signaled the unrelated process"
kill -TERM "$unrelated_pid"
wait "$unrelated_pid" 2>/dev/null || true
unrelated_pid=""

prepare_case occupied-display
mkdir -p "$case_dir"
touch "$socket_root/X${case_display#:}"
if env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
  SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" \
  "$runner" "$bin_dir/scenario" "$bin_dir/dev" occupied-display >"$case_dir/output" 2>&1; then
  fail "occupied display unexpectedly succeeded"
fi
grep -q 'occupied or stale' "$case_dir/output" || fail "occupied display diagnostic missing"
[[ -e "$socket_root/X${case_display#:}" ]] || fail "occupied display sentinel was removed"

prepare_case stale-display
stale_lock="$lock_root/.swarm-ide-x11-${case_display#:}.lock"
mkdir "$stale_lock"
printf 'someone-elses-token\n' >"$stale_lock/token"
if env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
  SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" \
  "$runner" "$bin_dir/scenario" "$bin_dir/dev" stale-display >"$case_dir/output" 2>&1; then
  fail "stale display unexpectedly succeeded"
fi
grep -q 'occupied or stale' "$case_dir/output" || fail "stale display diagnostic missing"
[[ "$(<"$stale_lock/token")" == someone-elses-token ]] || fail "foreign display lock was modified"

prepare_case port-collision
port_file="$case_dir/listener.port"
node -e '
  const fs = require("node:fs");
  const net = require("node:net");
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => fs.writeFileSync(process.argv[1], String(server.address().port)));
' "$port_file" &
unrelated_pid=$!
for _ in $(seq 1 50); do [[ -s "$port_file" ]] && break; sleep 0.02; done
[[ -s "$port_file" ]] || fail "unrelated listener did not start"
case_port=$(<"$port_file")
if env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
  SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" \
  "$runner" "$bin_dir/scenario" "$bin_dir/dev" port-collision >"$case_dir/output" 2>&1; then
  fail "port collision unexpectedly succeeded"
fi
grep -q "port $case_port is already occupied" "$case_dir/output" || fail "port collision diagnostic missing"
kill -0 "$unrelated_pid" || fail "unrelated port owner was killed"
kill -TERM "$unrelated_pid"
wait "$unrelated_pid" 2>/dev/null || true
unrelated_pid=""

prepare_case interrupt
env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
  SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" \
  SWARM_FAKE_SCENARIO_SLEEP=1 SWARM_SCENARIO_TIMEOUT_SECONDS=30 \
  "$runner" "$bin_dir/scenario" "$bin_dir/dev" interrupt >"$case_dir/output" 2>&1 &
runner_pid=$!
for _ in $(seq 1 100); do [[ -s "$case_dir/scenario-started" ]] && break; kill -0 "$runner_pid" 2>/dev/null || break; sleep 0.02; done
[[ -s "$case_dir/scenario-started" ]] || fail "interrupt scenario did not start"
kill -TERM "$runner_pid"
set +e
wait "$runner_pid"
interrupt_status=$?
set -e
runner_pid=""
(( interrupt_status != 0 )) || fail "interrupted runner exited successfully"
grep -q 'received TERM' "$case_dir/output" || fail "runner did not record TERM"
grep -q 'cleanup_complete=1' "$case_dir/supervisor.log" || fail "interrupt cleanup was incomplete"
[[ ! -e "$lock_root/.swarm-ide-x11-${case_display#:}.lock" ]] || fail "interrupt left a display lock"

for registration_phase in display-lock xvfb wm app scenario; do
  prepare_case "interrupt-registration-$registration_phase"
  env "${base_env[@]}" SWARM_ARTIFACT_DIR="$case_dir" SWARM_FAKE_GUI_LOG="$case_dir/gui.log" \
    SWARM_VIRTUAL_DISPLAY="$case_display" SWARM_VIRTUAL_DESKTOP_PORT="$case_port" \
    SWARM_FAKE_SCENARIO_SLEEP=1 SWARM_SCENARIO_TIMEOUT_SECONDS=30 \
    SWARM_TEST_REGISTRATION_PAUSE_PHASE="$registration_phase" \
    "$runner" "$bin_dir/scenario" "$bin_dir/dev" "interrupt-registration-$registration_phase" \
    >"$case_dir/output" 2>&1 &
  runner_pid=$!
  for _ in $(seq 1 150); do
    [[ -s "$case_dir/registration-phase" ]] && break
    kill -0 "$runner_pid" 2>/dev/null || break
    sleep 0.02
  done
  observed_phase=""
  if [[ -f "$case_dir/registration-phase" ]]; then
    IFS= read -r observed_phase <"$case_dir/registration-phase" || true
  fi
  if [[ "$observed_phase" != "$registration_phase" ]]; then
    cat "$case_dir/output" >&2
    fail "$registration_phase registration pause was not reached"
  fi
  kill -TERM "$runner_pid"
  kill -TERM "$runner_pid" 2>/dev/null || true
  set +e
  wait "$runner_pid"
  registration_status=$?
  set -e
  runner_pid=""
  (( registration_status != 0 )) || fail "$registration_phase registration interrupt exited successfully"
  grep -q 'cleanup_complete=1' "$case_dir/supervisor.log" ||
    fail "$registration_phase registration interrupt cleanup was incomplete"
  [[ ! -e "$lock_root/.swarm-ide-x11-${case_display#:}.lock" ]] ||
    fail "$registration_phase registration interrupt left a display lock"
done

echo "virtual desktop supervisor adversarial tests passed"
