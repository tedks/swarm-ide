# Open on the system plan and keep the cockpit usable

This ExecPlan follows `.planning/PLANS.md` and stays current as the increment is implemented.

## Purpose / Big Picture

A fresh Swarm IDE should explain the system being built instead of opening an empty lens. The Plan home combines the living design and its related implementation/task projections, while explicit source, task, worktree and agent choices retain their existing authority. The message dock gives conversation more width and uses one plain Activity heading. Empty Performance/Refactor tabs and visible reconciliation counters disappear.

## Progress

- [x] (2026-09-08) Read wave ownership, inspected existing cockpit/design/dock and started `swarm-plan-first-cockpit`.
- [x] (2026-09-08) Implemented Plan/Code startup/migration and retained-buffer/camera regressions, wider dock and plain Activity/build chrome.
- [x] (2026-09-08) Normally joined reviewed plan8b4c486, automatic-buildc4dbd42 and activity902669f components; App owns only their composition.
- [x] (2026-09-08) Native review converged after delayed-restoration/task-camera and divider fixes.61 focused tests plus both TypeScript boundaries passed; changed-layout owned package workflow passed3.843s with zero renderer errors and cleanup1.
- [x] (2026-09-08) Updated scoped design and Ditz accomplishment notes; PR107 pushed. ROOT owns normal landing and managed adoption.

## Assumptions and boundaries

The opened repository is the scope of the plan, while registered agent worktrees remain separately inspectable. No available data should be invented to fill a grid. At narrow sizes a scrollable pair of useful views is better than four illegible canvases. The existing editor and graph components remain mounted across central-surface changes; background refresh must not select a different document. Saved retired lens names can map to Plan, but saved source paths and focus must survive. ROOT owns the managed physical preview; this worktree owns only disposable virtual-X11 proof resources.

## Surprises & Discoveries

The current Plan workspace has three independent sub-tabs, and System design is a second standalone central surface. That duplicates entry points and selection. Its schema/data failure is assigned to the plans owner, not a reason to fork another plan reader. The message dock currently gives conversation 1.6 of 4.4 fractional columns, alongside large minimum log widths.

Mounted regressions found that restoring source with openFile(path,false) still navigated; background is the third argument. Restore now preserves an explicit lens choice. Task-only lens switching used to count as opening a new text surface and reframe graphs; it now tests the retained document instead. Screenshot review found the empty conversation consumed42vh and cramped Plan. A32vh default, resizable outer dock, and Plan-only760px two-column threshold make the overview useful without changing standalone design layout. Divider review caught import-order specificity and viewport-versus-container percentage errors; both were corrected, including a short-viewport pointer regression.

## Decision Log

The outer home is named Plan. The plans department owns its one hierarchy selection/breadcrumb and plan data. This department composes that component with the existing implementation navigation rather than replacing file browsing with an invented architecture. The dock retains all four instruments and adjusts their widths instead of hiding Work Log or Activity.

## Context and Orientation

`app/renderer/App.tsx` coordinates central surface, opened source tabs, context, native/registered agents and graph projections. `app/renderer/recovery.ts` reads saved navigation. `app/renderer/agents/AgentDock.tsx` and `agent-dock.css` arrange the bottom instruments. `app/renderer/styles.css` and `workspace-layout.css` arrange the outer workspace. `app/renderer/plans/PlanWorkspace.tsx` and `DesignWorkspace.tsx` are owned by the concurrent plan department. `app/renderer/startup-topology.ts` and repository build observation are owned by continuous-build. All these source files flow through `//:quality_sources` into the desktop bundle.

## Plan of Work

First add a narrow Bazel-owned cockpit test target covering fresh Plan startup, legacy lens migration, explicit document retention, one Activity heading and wider conversation. Simplify the outer tabs and visible status copy. Preserve mount positions and existing commands; hide instead of destroying editor/graph instances. Coordinate committed additive plan/build APIs directly with owners through `/tmp/swarm-ide-usability.BirZCk/*/seam.md`, then normally compose only reviewed pushed changes. Put design document and component graph together with implementation/task views responsively. Keep refresh available as a secondary action after automatic observation is actually connected.

## Concrete Steps

Run commands from `/home/tedks/Projects/swarm-ide/usability-cockpit-layout` through `nix develop --command`. Materialize dependencies once with `pnpm install --frozen-lockfile`. Use Bazel targets for TypeScript, unit tests and packaging. The focused checks run the mounted cockpit/recovery/dock regressions; the package proof uses an owned display and port 55415. Do not target `:0` or change shared `ui-sprint`.

## Validation and Acceptance

A fresh app opens a readable system plan; authored component relationships are distinguishable from the implementation graph. Existing saved source navigation can return to its dirty buffer with exact text/cursor and unchanged graph camera after opening Plan. Performance/Refactor are absent and old saved values resolve safely. Conversation gains horizontal room without either log disappearing. The visible Activity header is single and uses a divider. No visible epoch or Reconciling text remains; failures are still available. Automatic topology behavior is claimed only after the actual owner hook is joined and exercised.

## Idempotence and Recovery

No user storage is deleted. The navigation reader accepts legacy records and normalizes only retired lens values. Dependencies and provider changes remain in their owner's committed branch; unresolved joins are reported rather than copied from dirty worktrees. Preserve feature branches, task records and failed proof evidence; clean only owned virtual display/process/output resources.

## Artifacts and Notes

Status and final evidence live in `/tmp/swarm-ide-usability.BirZCk/cockpit-layout`. The final recap names actual checked behavior, remaining limits and pushed PR. ROOT normal-merges and adopts.

## Interfaces and Dependencies

No new layout framework or provider capability. Reuse `ResizeDivider`, `OverflowStrip`, `PlanWorkspace`, `TopologyViews` and the current `EditorPane`. Plan and auto-build owners publish exact optional props/hooks before the composition consumes them. Typed core boundaries remain untouched here.

## Outcomes & Retrospective

Implemented in PR107. The single Plan home uses the shared hierarchy and authored documents/component links, with implementation/task instruments in the same scrollable grid; Code retains repository/service/build projections and existing inspections. Narrow windows stack sections rather than making four tiny graphs. Not every instrument is simultaneously visible on a short window; the plan scrolls and the user can resize the dock.

Final evidence is under /tmp/swarm-ide-usability.BirZCk/cockpit-layout/gui-wide/run.BZVlIn. Earlier artifacts are retained: the first UI journey passed but its summary print assumed an optional field; subsequent explicit normal-width grid assertions exposed the narrow-layout threshold. These were concrete reporting/layout corrections, not silent retries. No real agent messages, hosted CI, full legacy sweep or physical desktop automation was run.

The later request for registered-conversation tabs and scoped Ctrl-Tab is deliberately separate (Ditz swarm-registered-conversation-tabs); it must preserve existing per-session drafts and outbox identity and is not claimed here. The core layout issue remains in progress until ROOT lands PR107; human accomplishment notes are synced.
