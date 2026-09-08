# Click build targets and source references

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

From a source file, clicking either a direct or transitive Context target should reveal that exact target in the build graph. From BUILD, BUILD.bazel, or a Starlark file, Alt-clicking an observed reference should open its source or declaration through the normal source broker, including dirty-buffer handling.

## Progress

- [x] (2026-09-08) Confirmed isolated branch, current graph contracts and ownership; claimed both Ditz issues.
- [x] (2026-09-08 06:14Z) Implemented exact graph selection, Context links and bounded reference gestures; pushed PR101.
- [x] (2026-09-08 06:17Z) 60 focused tests, both typechecks, existing Context regressions and desktop package pass; native production and harness review CLEAN.
- [x] (2026-09-08 06:29Z) Normally composed reviewed App mount 62a8f14; actual packaged proof passed 9.910s on owned :162/55402 with zero renderer errors and cleanup complete.
- [x] (2026-09-08 06:32Z) Fresh joined navigation/conversation local targets passed in 14.605s; final documentation and review handoff prepared.

## Assumptions and Boundaries

The bounded build observation is the source of target identity and declaration paths. A missing record is not permission to guess BUILD.bazel. Generated files, external labels, unsupported strings and ambiguous ownership remain ordinary editor text. The renderer never reads disk directly. App owns repository/world matching and its existing source-opening callback. No language parser or dependency changes belong to this task.

## Context and Orientation

`context/compose.ts` computes direct and transitive targets; `ContextPane.tsx` displays their rows. `repository/BuildGraphPane.tsx` owns manual graph selection and target details. `EditorPane.tsx` owns the existing CodeMirror instance. A new pure `bazel-reference.ts` resolves observed labels without filesystem access. The conversation workstream alone edits App.tsx to connect the additive callbacks.

## Plan of Work

First add an explicit target selection intent, reuse existing Context graph links, and remove the legacy guessed BUILD.bazel fallback. Next add Alt-click handling with current callback refs and a pure resolver. Publish the exact props to the conversation owner. Finally prove resolver negatives, mounted selection and editor retention, and exercise the actual packaged UI on an owned virtual desktop.

## Concrete Steps

Run tooling from this worktree with `nix develop --command`. Use a focused Bazel test target for resolver, Context, graph and editor tests; use the existing owned virtual desktop harness for a disposable Bazel repository. Commit and push a draft PR early, then mark it ready after native review converges. ROOT owns normal merge and app adoption.

## Validation and Acceptance

Both Context target categories should have buttons. A target button reveals exactly its label, and Open build definition uses its recorded BUILD or BUILD.bazel. Alt-click follows a resolvable reference without changing the original editor selection; an ordinary click remains ordinary. External/generated/unobserved references must never open a guessed source. Dirty buffers and graph cameras remain governed by existing navigation.

## Idempotence and Recovery

No repository mutation occurs from these gestures except an explicitly requested existing Save. Tests use disposable repositories and owned displays. Branch and evidence remain available for ROOT; no active app or peer worktree is edited.

## Surprises & Discoveries

The graph already has exact `buildFile` records, but its legacy capture fallback currently guesses BUILD.bazel. Context already permits graph links but does not render them.

## Decision Log

Use renderer-local explicit selection intents and existing callbacks, not new core routes. Use recorded build metadata and reject unsupported reference syntax rather than creating an indexing platform.

## Outcomes & Retrospective

The joined application follows direct and transitive Context targets, opens their
exact observed BUILD filenames, and follows an observed target/source with native
Alt-click. The real packaged two-package journey retained original dirty text,
logical cursor and independent graph instances, made no source writes or model
calls, and had zero renderer errors. Remaining reference forms are tracked as a
follow-up rather than guessed. Reviewed master now dismisses the compact Context
overlay when selecting a target; the original packaged proof exercised the wide
operator cockpit and is not compact-layout evidence.

## Artifacts and Notes

Concise external handoffs live in `/tmp/swarm-ide-finish-loop.0vkfJQ/navigation/`.

The actual proof is `packaged/run.fAMO5H/proof.json`, with four screenshots and
owned harness cleanup evidence. Producer 2ce9dbb and App mount 62a8f14 each had
native CLEAN review; their normal joined commit was ee8808b. All GUI inputs used
the owned virtual desktop; the watched application was not changed.

## Interfaces and Dependencies

ContextPane gains `onGraph({topologyId,id})`; TopologyViews gains a repository/revision-pinned target-selection intent. EditorPane gains an optional reference callback invoked only for a resolved Alt-click. Existing CodeMirror state and source broker remain authoritative.

Initial plan records the exact source-truth and ownership boundaries before implementation.
