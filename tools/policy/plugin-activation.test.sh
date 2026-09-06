#!/usr/bin/env bash
set -euo pipefail
policy_dir=$(dirname "$(readlink -f "$0")")
exec "$policy_dir/probe.sh" --plugin-activation
