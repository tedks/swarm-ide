#!/usr/bin/env bash
# The fixed-target topology scenario was retired with the shipped example.
# Its replacement owns its own desktop, declaration edits, snapshots and cleanup.
set -euo pipefail
echo 'Retired topology scenario: run nix develop --command bazel run //tools/services:smoke (or //tools:desktop-smoke) for the declared-services proof.' >&2
exit 2
