#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "hmr-scenario.test: $*" >&2
  exit 1
}

test_root=$(mktemp -d "${TEST_TMPDIR:-/tmp}/swarm-hmr-scenario-test.XXXXXX")
scenario_pid=""
cleanup_test() {
  [[ -z "$scenario_pid" ]] || kill -KILL "$scenario_pid" 2>/dev/null || true
  rm -rf -- "$test_root"
}
trap cleanup_test EXIT

workspace="$test_root/workspace"
artifact_dir="$test_root/artifacts"
probe_dir="$workspace/app/renderer"
mkdir -p "$probe_dir" "$artifact_dir"
probe="$probe_dir/hmr-probe.css"
printf ':root { --hmr-probe-hue: 180; }\n' >"$probe"
original_hash=$(sha256sum "$probe")

driver="$test_root/fake-driver.sh"
printf '%s\n' \
  'swarm_x11_assert_owned() { :; }' \
  'swarm_window_assert_selected() { :; }' \
  'swarm_window_title() { echo "swarm-ide — HMR 0:0ms"; }' \
  'swarm_window_capture() { printf "fake image\n" >"$1"; }' >"$driver"

env SWARM_X11_DRIVER_PATH="$driver" SWARM_SOURCE_WORKSPACE="$workspace" \
  SWARM_ARTIFACT_DIR="$artifact_dir" SWARM_SCENARIO_RESTORE_PATH="$probe" \
  SWARM_SCENARIO_RESTORE_EXPECTED="$test_root/restore-expected" \
  SWARM_HMR_TEST_MODE=1 SWARM_HMR_TEST_PAUSE_AFTER_TEMP=1 \
  "$(dirname "$0")/hmr-scenario.sh" >"$test_root/output" 2>&1 &
scenario_pid=$!

for _ in $(seq 1 100); do
  [[ -s "$artifact_dir/hmr-temp-created" ]] && break
  kill -0 "$scenario_pid" 2>/dev/null || break
  sleep 0.01
done
[[ -s "$artifact_dir/hmr-temp-created" ]] || fail "scenario did not reach the post-temp pause"
kill -TERM "$scenario_pid"
set +e
wait "$scenario_pid"
scenario_status=$?
set -e
scenario_pid=""

(( scenario_status != 0 )) || fail "interrupted scenario exited successfully"
[[ "$(sha256sum "$probe")" == "$original_hash" ]] || fail "source changed before atomic publication"
if find "$probe_dir" -maxdepth 1 -name '.hmr-probe.css.*' -print -quit | grep -q .; then
  fail "interrupted scenario left a hidden source-directory temporary file"
fi

echo "HMR scenario interruption cleanup passed"
