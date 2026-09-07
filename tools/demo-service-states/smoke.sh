#!/usr/bin/env bash
set -euo pipefail
service_scripts=$(dirname "$(readlink -f "$0")")
exec "$service_scripts/../virtual-desktop-run.sh" "$service_scripts/scenario.sh" "$service_scripts/launch.sh" service-states
