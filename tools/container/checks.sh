#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "$(readlink -f "$0")")
node --test "$scripts/checks.test.mjs"
