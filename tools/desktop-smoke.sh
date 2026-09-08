#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
# Compatibility entry point. The declaration proof owns its desktop and cleanup;
# do not launch a second virtual desktop around it. Preserve evidence settings.
proof="$script_dir/services/smoke.sh"
[[ -f "$proof" ]] || { echo "Service discovery proof missing; use //tools/services:smoke from a complete checkout." >&2; exit 2; }
exec bash "$proof" "$@"
