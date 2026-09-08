#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'usage: build.sh output manifest' >&2; exit 2; }
registration_output=$1
[[ "$registration_output" == /* ]] || registration_output="$PWD/$registration_output"
registration_manifest=$(readlink -f "$2")
cd "$(dirname "$registration_manifest")"
pnpm exec esbuild tools/session-registration/cli.ts --bundle --platform=node --format=cjs --target=node22 --outfile="$registration_output"
