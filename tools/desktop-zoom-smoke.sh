#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
exec "$script_dir/virtual-desktop-run.sh" \
  "$script_dir/desktop-zoom-scenario.sh" \
  "$script_dir/dev.sh" \
  desktop-zoom-smoke
