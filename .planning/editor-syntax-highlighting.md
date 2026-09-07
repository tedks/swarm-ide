# Give source files readable syntax colors

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The main source editor should distinguish code keywords, strings, comments and
Markdown structure without changing how a user edits or navigates. Opening a
TypeScript, JavaScript, JSON or Markdown path selects a maintained CodeMirror
parser; unknown paths remain ordinary plain text. Source content is never run.

## Progress

- [x] (2026-09-07) Verified clean designated branch at 83e53e7 and scoped existing editor.
- [ ] Add compatible parser packages and a small path-selected extension.
- [ ] Verify focused retention/command/navigation tests and real owned virtual colors.
- [ ] Native review, push ready PR, Ditz sync and executive handoff.

## Context and Orientation

`app/renderer/EditorPane.tsx` owns a CodeMirror editor for each source-tab lifetime.
`app/renderer/App.tsx` supplies current text and callbacks but presently no path.
The editor already synchronizes text with minimal replacements, keeps diff-flash
decorations and checks source-navigation authorization at effect execution time.
Those mechanisms are outside this change. Tab memory currently restores selection
when reopening identical text, not a full editor history; do not expand its scope.

## Plan of Work

Add a small `editor-language.ts` helper using CodeMirror's maintained JavaScript
(including TypeScript and JSX), JSON and Markdown packages and its highlighting
API. A compartment is a replaceable group of editor extensions; use one to update
the language without replacing the editor or its document/history. Select by the
last filename extension, not text sniffing or source execution. Pass the actual
source path through the existing App editor call. Add restrained dark-theme token
colors. Unsupported paths get no language extension. Preserve state package 6.7.4
and its workspace override because mixed class identities previously broke input.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/editor-syntax-highlighting`. Materialize
the narrowly added pinned dependencies with `nix develop --command pnpm install`;
subsequent installation uses `--frozen-lockfile`. Build and test only via Bazel:
`nix develop --command bazel test --jobs=3 //:quality`, then
`nix develop --command bazel build --jobs=3 //:desktop-bundle`.
Add an owned `//tools/demo-syntax:smoke` using the existing virtual-desktop wrapper
for screenshots and editing verification on an owned display/port, not DISPLAY0.

## Validation and Acceptance

Tests cover supported extension mapping, no highlighting for unknown files, real
parser tokens, unchanged editor identity and selection during language changes,
text callbacks, save, undo extension retention, diff decorations and existing
source navigation and cursor command regressions. A running packaged app opens
actual TS/JSON/Markdown files in a disposable committed Git repo, shows distinct
computed colors and preserves edited text/cursor while using ordinary controls.
Evidence must distinguish mounted tests from actual app screenshots. No provider
turn is needed. Native Codex review must converge before ready handoff; hosted CI
and foreign providers are intentionally excluded by the current user directive.

## Idempotence and Recovery

Keep changes on the assigned branch and push a draft PR early. Never alter shared
master or preview. The virtual harness owns its profile, desktop and scratch repo
and cleans only those. Unknown languages remain text. ROOT performs final normal
merge and reviewed dependency materialization before preview adoption.

## Interfaces and Dependencies

`EditorPane` gains an optional path prop (plain text by default for existing callers).
The helper maps paths to stable language names/extensions and exports a syntax
highlighting extension. No new bridge/core/protocol capability or language server.

## Surprises & Discoveries

The baseline editor has no history extension; the change must not silently add an
editing subsystem. Tests can install history to prove compartment reconfiguration
preserves it, while existing behavior remains otherwise unchanged.

## Decision Log

Use synchronous, bundled maintained parsers for this small set. This avoids
asynchronous resolution races and extra infrastructure in a tightly bounded UI
enhancement. Do not add formats outside the requested set in this increment.

## Outcomes & Retrospective

Implementation and proof pending. Initial plan records preservation boundaries
before edits; update this section with actual proof and limits before handoff.
