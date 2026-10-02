# Retain source undo history through navigation

This ExecPlan follows `.planning/PLANS.md` and stays current at each checkpoint.

## Purpose / Big Picture

Typing in a source file must be reversible with Ctrl+Z and Ctrl+Shift+Z. Switching to another document and returning must retain that file's undo and redo history. External file observations must not become user edits that Undo silently reverses.

## Progress

- [x] 2026-10-02: verified the editor installs no history and restores selection only.
- [x] 2026-10-02: wrote mounted keyboard/remount/external-observation regressions.
- [x] 2026-10-02: baseline had three undo failures; fixed history and passed 123 tests in five files plus both TypeScript boundaries.
- [ ] Run the extended native desktop syntax proof and final exact-head editor gate.
- [ ] Verify council convergence, push and normal-merge the PR.

## Surprises & Discoveries

Existing syntax and observation tests install history themselves, so they prove retention of an injected extension rather than production undo support. `EditorMemory` already retains the previous immutable CodeMirror state, but a remount copies only its selection.

## Decision Log

2026-10-02: Preserve only selection/history from a prior state whose normalized text matches the new content. Build all other extensions anew so callbacks belong to the current component lifetime. Annotate external replacements as excluded from history; CodeMirror maps the prior user history through their changes. Discard history if a hidden document changed. History remains memory-only and tab-local; this does not add disk recovery or write authority.

## Context and Orientation

`app/renderer/EditorPane.tsx` creates the CodeMirror editor and synchronizes externally supplied text. `App.tsx` supplies memory per source tab and workspace. `tests/editor-history.test.tsx` drives the actual installed keyboard map in jsdom, including component unmount/remount and replaced callbacks. `tools/demo-syntax:editor-tests` is the existing Bazel target that runs both TypeScript boundaries and selected mounted editor tests.

## Plan of Work

First run the new regressions on the unchanged editor. Then install CodeMirror history and its keyboard map, restore the history field through a freshly configured state when text matches, and exclude externally synchronized changes from undo recording. Remove manual history injection from older tests so they cover production behavior. Document this behavior in the cockpit design and include the new test in the existing editor target's default suite.

## Concrete Steps

In the feature worktree, materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel --host_jvm_args=-Xmx512m test --jobs=1 --local_resources=memory=2048 //tools/demo-syntax:editor-tests --test_arg=tests/editor-history.test.tsx --test_arg=tests/editor-syntax.test.tsx --test_arg=tests/editor-observation-stability.test.tsx --test_arg=--maxWorkers=1 --test_output=errors`. Gates are bounded because the shared host has little free RAM and nearly full swap. Keep source fixed during a gate.

## Validation and Acceptance

The unchanged editor must fail the new user undo cases. After the change Ctrl+Z undoes typing, Ctrl+Shift+Z restores it, both stacks survive remount with current callbacks, CRLF normalization permits matching state restoration, external prefix insertion survives undo of a user edit, and replaced content starts fresh history. Existing syntax/language changes and repeated equivalent observations retain state. These are mounted keyboard events, not an OS-native desktop proof; that distinction remains visible in issue disposition.

## Idempotence and Recovery

The diff utility adds pinned `@codemirror/merge` with only already-present transitive dependencies; update the Nix dependency-store hash with the lockfile. No file format or persistence schema changes. Reverting the code removes the new in-memory feature. No operator windows or processes are touched. Preserve unrelated worktrees and saved Work Logs.

## Outcomes & Retrospective

Mounted editor/history and intake checks pass (123 tests). The initial jsdom redo check exposed its empty platform setting; the test now declares Linux before CodeMirror initializes. Native desktop proof and PR review remain pending.

## Artifacts and Notes

Tracker: `editor-undo-history-20260907`. Existing cockpit and editor build mappings already include the production module. Verification logs are retained by the controller privately; public PR records contain only commands, counts, results and exact commits.

## Interfaces and Dependencies

Use the already pinned `@codemirror/commands` history extension, historyField, and historyKeymap, plus `Transaction.addToHistory` from `@codemirror/state`. Keep `EditorMemory`'s current shape and the existing file-save callback.

Initial plan records the narrowly scoped editor recommendation from the inventory; Astra owns its separate broader cleanup changes.

2026-10-02 checkpoint: added native Undo/Redo assertions after the existing packaged syntax tab-retention journey; fixture files stay disposable. No native pass claimed yet.

2026-10-02 council correction: native review found that one broad external replacement could erase history for unchanged interior text. Added a failing regression and replaced the hand-written replacement range with the pinned CodeMirror diff utility, bounded to scan depth 500 and 20 ms before conservative fallback. This is a supported utility, not a new diff engine. Strengthened native proof by navigating after the tested edit. Anthropic seat unavailable due usage credits; Google initial round clean.
