#!/usr/bin/env bash
set -euo pipefail
tour_scripts=$(dirname "$(readlink -f "$0")")
exec node --test "$tour_scripts/launch.test.mjs"
