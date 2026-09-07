#!/usr/bin/env bash
set -euo pipefail
journal_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies the source workspace}"
exec node "$journal_scripts/launch.mjs"
