#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || exit 2
rehearsal_output=$(realpath -m "$1")
rehearsal_manifest=$(readlink -f "$2")
rehearsal_build=$(mktemp -d)
trap 'find "$rehearsal_build" -depth -delete' EXIT
cd "$(dirname "$rehearsal_manifest")"
node tools/agent-rehearsal/build.mjs "$rehearsal_build"
tar -C "$rehearsal_build" -czf "$rehearsal_output" app core renderer rehearsal-inputs.json
