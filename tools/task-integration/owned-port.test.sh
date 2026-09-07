#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
exec node --test "$scripts/owned-port.check.mjs"
