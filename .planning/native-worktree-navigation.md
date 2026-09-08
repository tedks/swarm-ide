# Explore agent worktrees in the ordinary workspace

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Selecting an agent's worktree should move the ordinary directory browser, editor and Context together. A dirty `README.md` in one worktree must never become the contents of another worktree's `README.md`. Back and Forward restore deliberate locations rather than replaying commands.

## Progress

- [x] (2026-09-08) Confirmed designated branch and inspected root-bound providers and renderer identities.
- [x] (2026-09-08) Implement immutable privileged contexts and exact-root request/event routing; actual two-Git-worktree read/write tests pass.
- [x] (2026-09-08) Implement ordinary Worktree selection, retained dirty editors/cursors, scoped cameras and deliberate Back/Forward.
- [x] (2026-09-08) Packaged production entry passed the ordinary two-worktree/different-bytes/dirty source/history journey on owned :172/55432, cleanup complete.
- [x] (2026-09-08) Review corrections pushed, reviewed build/architecture topics normally joined, final30 focused +56 build +91 design checks and both types/package passed; handoff ready for ROOT landing.

## Surprises & Discoveries

`core/repository-registration.ts` already produces distinct project IDs from canonical worktree roots, but every world uses `world:working`. World alone is therefore not a worktree identity. File requests/events and renderer file maps are currently path-only. The existing central worktree browser is read-only and does not switch ordinary providers.

Native review found and corrected late provider creation after close, held history overtaking a new user gesture, retained reads overtaking a newer Save/Reload, and camera cleanup reading the incoming scope. The first GUI driver used Electron's unsupported `ArrowDown` key name; no workspace.open request was sent. Using native `Down` corrected that driver boundary; no product failure or unchanged retry was called a fix.

## Decision Log

Use immutable core contexts per opened worktree, not a mutable root string. Each operation captures its context before awaiting; inactive facts are never published into another workspace. Only canonical registered worktrees sharing the launch repository's Git common directory are selectable. Renderer exploration state is retained per project ID; conversations remain shared. Switching while an accepted save is settling may be held, but a save can never change roots.

## Outcomes & Retrospective

The implemented vertical reaches the actual ordinary browser and source editor, not just a contract or auxiliary viewer. The one packaged happy path passed in 2.509 seconds with real Git worktrees and labelled registry transcripts, zero renderer exceptions, unchanged on-disk source/indexes and owned cleanup. Direct mounted tests additionally cover failed selection, stale reads, pending Save exclusion, and newer-navigation cancellation. Native launch stays in the original workspace; steering existing sessions remains shared. Cross-repository selection and idle-context eviction remain explicit follow-ups.

Reviewed PR124 and PR127 were normally joined, preserving independent target-build services per root and the responsibility/contract diagram semantics. Final30 scoped checks include actual build observations from two real workspace runtimes; the56 build and91 living-design checks pass after exact fixture/header compatibility changes. Both native reviewers converged CLEAN. Desktop package passed6.989s; the earlier actual worktree GUI remains attributed to its own pre-peer-composition executable, not a repeated aggregate GUI claim.

## Context and Orientation

`core/worker-runtime.ts` currently constructs all providers for the launch root. `protocol/schema.ts` validates the bridge. `app/renderer/App.tsx` owns source tabs, focus and ordinary navigation. `core/worktree-inspection.ts` already validates the private registry and canonical registered roots. `app/renderer/repository/` owns directory presentation. The new pure `navigation-history.ts` stores only location identities, never operations.

## Plan of Work

First expose an additive workspace-open request and scoped operations. Reuse checked registrations and create independently rooted providers. Then make the normal browser choose that scope and retain dirty buffers, directory state and camera identity across switches. Add bounded Back/Forward for deliberate locations and native side-button/keyboard inputs. Keep unavailable capabilities explicit instead of retaining mislabeled observations.

## Concrete Steps

From this worktree, use `nix develop --command bazel test --jobs=3 //tools/workspace-navigation:checks`, then `nix develop --command bazel build --jobs=3 //:desktop-bundle`. The dedicated tests exercise real disposable Git worktrees plus renderer state. Use an owned virtual display :172 and port 55432 only after checking availability.

## Validation and Acceptance

Create two committed worktrees with the same path and different bytes. Open and edit the first, switch to the second through the normal browser, and return: each path retains its own bytes, cursor and dirty state. A request accepted for the first root cannot write the second. Invalid/unregistered/foreign-repository selection keeps the current view usable. Back/Forward restores locations, truncates a forward branch after new navigation, and never triggers build or message commands.

## Idempotence and Recovery

Keep each scope's provider lifetime independent of navigation. Failed creation does not replace the active renderer scope. Retain branches, user worktrees and transcripts. Clean only owned test processes, displays and temporary fixtures. ROOT alone lands the PR and updates the shared app.

## Artifacts and Notes

The concise seam and evidence live in `/tmp/swarm-ide-demo-close.BrSWmt/worktree-nav/`. The draft PR records pushed increments.

## Interfaces and Dependencies

Add `workspace.open` with a registered session identity (or the launch workspace), a validated workspace descriptor, and an optional stable workspace ID on routed requests/events. Existing repository IDs name canonical worktrees; do not create another identity system. Ordinary provider requests carry that identity or their existing repository ID. Agent observation/steering remains on the shared owner, not duplicated per exploration scope.
