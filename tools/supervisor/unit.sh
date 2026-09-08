#!/usr/bin/env bash
set -euo pipefail
supervisor_scripts=$(dirname "$(readlink -f "$0")")
exec node --test "$supervisor_scripts/supervisor.test.mjs"
