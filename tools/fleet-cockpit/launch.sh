#!/usr/bin/env bash
set -euo pipefail
trusted_scripts=$(dirname "$(readlink -f "$0")")
cd "${BUILD_WORKSPACE_DIRECTORY:?Owned harness supplies the source workspace}"
exec node "$trusted_scripts/launch.mjs"

