#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || exit 2
task_runs_output=$(realpath -m "$1")
task_runs_manifest=$(readlink -f "$2")
task_runs_build=$(mktemp -d)
trap 'find "$task_runs_build" -depth -delete' EXIT
cd "$(dirname "$task_runs_manifest")"
node tools/task-runs/build.mjs "$task_runs_build"
tar -C "$task_runs_build" -czf "$task_runs_output" index.html controlled.js controlled.css
