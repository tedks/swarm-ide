#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
exec "$script_dir/desktop-smoke.sh"
