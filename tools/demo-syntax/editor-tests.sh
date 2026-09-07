#!/usr/bin/env bash
set -euo pipefail
syntax_scripts=$(dirname "$(readlink -f "$0")")
cd "$syntax_scripts/../.."
if (( $# == 0 )); then
  set -- tests/editor-syntax.test.tsx tests/editor-syntax-dependencies.test.mjs tests/source-handoff-authorization.test.tsx tests/task-editor-command-regression.test.mjs
fi
exec pnpm exec vitest run "$@"
