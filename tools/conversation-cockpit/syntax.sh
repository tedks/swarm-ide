#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
node --check "$scripts/launch.mjs"
node --check "$scripts/acceptance.cjs"
bash -n "$scripts/smoke.sh" "$scripts/launch.sh" "$scripts/scenario.sh" "$scripts/unit.sh"
