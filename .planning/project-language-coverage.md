# Color the languages used in our projects

This living plan follows `.planning/PLANS.md`.

## Purpose

Opening Bazel, Nix, Python and the other languages in the user's local projects
should show useful syntax colors without adding editor commands or changing how
files are opened, edited or saved. Unknown formats remain plain text.

## Assumptions and boundaries

The path identifies the language; no file execution, network lookup or content
inspection is necessary at editor runtime. Names are case-insensitive as in the
existing editor. Directory names and backup suffixes must not imply a language.
Highlighting is not semantic validation. Lightweight modes are explicitly
documented, especially Python-like Starlark and Rust-like Move fallback coloring.
One pinned CodeMirror state implementation must survive the dependency update.
The navigation owner keeps all EditorPane gestures; no App or core edits belong
to this workstream.

## Progress

- [x] Read shared ownership, inspected existing parser compartment and syntax proof.
- [x] Inventory tracked local filenames in Goals, Pure Sky, Predictionbook,
  Pairmarket, discord-agents, slowed and Swarm.
- [ ] Add bounded detection/token tests and parser-only language extensions.
- [ ] Verify dependency identity and actual editing/saving on owned virtual X11.
- [ ] Native review to clean, publish coverage and push ready PR with Ditz notes.

## Context and plan of work

`app/renderer/editor-language.ts` supplies stable parser extensions to the
existing EditorPane compartment. It currently recognizes only JS/TS/JSX/TSX,
JSON and Markdown. `tools/demo-syntax:editor-tests` runs detection, actual token,
mounted editor and dependency identity tests. `tools/demo-syntax:smoke` opens a
real disposable Git repository through packaged Electron and verifies native
input, tab/cursor/camera retention and one disk save on an owned virtual desktop.

First extend the tests with real language samples and negative filenames, then
install a small set of CodeMirror parsers and stream modes. Extend the existing
owned syntax proof to Bazel/Nix/Python. Publish `docs/editor-languages.md` with the
inventory, recognition table, fallback limitations and build mappings. Keep
living design links aligned without taking another owner's component files.

## Concrete steps and acceptance

Run all commands from this designated worktree. Use `nix develop --command pnpm
install --frozen-lockfile` after the intentional pinned dependency update. Run
`nix develop --command bazel test --jobs=3 //tools/demo-syntax:editor-tests
--test_output=errors` and the node/renderer build boundaries. The new tests must
show keyword/string/comment colors and stable extension identities, no extra
keybindings/completion, valid actual cursor commands and retained editor state.
Run `SWARM_VIRTUAL_DISPLAY=:163 SWARM_VIRTUAL_DESKTOP_PORT=55403 nix develop
--command bazel run --jobs=3 //tools/demo-syntax:smoke`; inspect its screenshot and
proof JSON. No physical desktop, provider request or shared app changes.

## Idempotence and recovery

All product edits stay on this feature branch. Package resolution is pinned;
frozen materialization can be repeated. The owned GUI harness cleans its own
resources and preserves failure evidence. Follow-up languages can be added
without altering the exported sourceLanguage API or EditorPane.

## Surprises & Discoveries

discord-agents contains 48 OCaml implementation files and 3 interfaces; Move is
present in Predictionbook and Pairmarket. These are real gaps beyond web syntax.

## Decision Log

Use upstream parsers where practical and existing stream modes for the long
tail. Avoid a grammar platform or broad GitHub scan in this bounded increment.

## Outcomes & Retrospective

Implementation and proof pending. No universal language-support claim.
