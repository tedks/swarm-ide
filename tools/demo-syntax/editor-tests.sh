#!/usr/bin/env bash
set -euo pipefail
syntax_scripts=$(dirname "$(readlink -f "$0")")
cd "$syntax_scripts/../.."
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
if (( $# == 0 )); then
  set -- tests/editor-syntax.test.tsx tests/editor-project-languages.test.ts tests/editor-syntax-dependencies.test.mjs tests/source-handoff-authorization.test.tsx tests/task-editor-command-regression.test.mjs
fi
exec pnpm exec vitest run "$@"
