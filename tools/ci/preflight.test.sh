#!/usr/bin/env bash
set -euo pipefail
ci_dir=$(dirname "$(readlink -f "$0")")
exec node --test "$ci_dir/preflight.test.mjs"
