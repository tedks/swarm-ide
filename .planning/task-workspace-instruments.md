# Open tasks as a useful workspace

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Clicking a repository task should open its read-only document in the central editor area immediately. The adjacent Context panel should explain its metadata, recorded updates, blockers, downstream work, source links and explicitly associated agent activity. The task graph should start with a readable bounded neighborhood and allow an explicit whole-graph view, without changing dependency meaning. Source buffers, draft attachments and graph cameras remain independent of task document navigation.

## Progress

- [x] (2026-09-07) Read the assigned worktree, shared ownership and relevant existing contracts.
- [ ] Implement click-to-document, task Context and bounded graph scope with regressions.
- [ ] Add separately pinned real metadata history if available within the existing bounded reader.
- [ ] Run focused red/green tests, native review and actual owned virtual task journey.
- [ ] Push ready PR, record evidence and hand back to ROOT for normal merge/adoption.

## Surprises & Discoveries

Existing TaskDetail deliberately has no timestamps/update log. It participates in canonical prepared task bytes, so adding display metadata there would conflate observation with execution context. Task graph currently fits all summary nodes even though only 64 details are read; this makes a large repository hard to read.

## Decision Log

Use one reviewable vertical PR; it is not a PR stack. Keep the shared source editor and non-task Context untouched. Preserve Ditz's actual model rather than inventing Jira fields. Use a separate task-history projection if feasible; unavailable history is a truthful empty state, not invented content. Only explicit task IDs can associate agent activity. The desired future 50/50 central task-and-graph split is a later layout seam, not part of this change.

## Outcomes & Retrospective

In progress. ROOT owns merge, managed preview adoption and any later roadmap step.

## Context and Orientation

`app/renderer/tasks/TaskPanel.tsx` lists task summaries. `TaskDetail.tsx` renders the read-only central document; `App.tsx` currently separates selecting from opening. `TaskGraph.tsx` reads bounded details through `tasks/client.ts`; `graph.ts` builds dependency edges and `plans/ProjectionCanvas.tsx` owns a persistent camera. `core/tasks/provider.ts` caches one complete pinned Git metadata revision, parsed through the owned `metadata-worker.ts`; `protocol/tasks.ts` defines validated immutable details. A pin means a specific metadata commit, not whichever ref happens to exist when a response arrives.

## Plan of Work

First add new mounted and graph-helper regressions for ordinary activation, task Context relationships and focused scope. Implement a standalone `tasks/TaskContext.tsx` and small App task-only wiring. Display recorded dependency titles using current pinned summary lookup; missing targets remain explicitly missing. Preserve the central source editor instance when hidden. Scope task graph to the selected task and direct neighbors, or a bounded open-task view before selection; make whole projection explicit and state omitted/unread counts. If history can be read with the existing bounded Git/YAML ownership, expose a separate typed request and result keyed by world, repository, metadata commit and task ID, with cancellation/generation fencing. Do not alter TaskDetail canonical bytes. Add unit tests and one actual virtual click/document/history/links/retention journey.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/task-workspace-instruments`, branch `feature/task-workspace-instruments`, reviewed base `83e53e7`. Use `nix develop --command pnpm install --frozen-lockfile`, then Bazel-owned checks with `--jobs=3`. Existing `nix develop --command bazel test //:quality --jobs=3` typechecks, tests and bundles. Add an owned task-workspace proof target under `tools/` if necessary, using the existing virtual desktop helper and display `:143`, port `55223`. All fixtures must be explicitly identified as test repositories authored through Ditz CLI.

## Validation and Acceptance

A single click in the task list or graph opens the Task document. Context displays the same pinned task, human-readable dependency titles, actual metadata fields and recorded history or a precise unavailable state. Clicking a dependency navigates to that task; clicking a file still requires explicit Reveal. A dirty source buffer and draft attachment survive task navigation. A large task graph shows its current bounded scope and can deliberately switch to all recorded nodes without claiming unread dependencies are absent. New tests must exercise stale pin, missing target and no fabricated agent association. The final owned virtual journey must produce a screenshot and verify no renderer exception or leaked owned GUI process. Review substantive changes using native Codex to fixpoint; foreign reviewers are intentionally omitted under the user's quota directive. Hosted CI is ignored.

## Idempotence and Recovery

Tests create disposable repositories and own their virtual processes; never touch physical display 0 or ROOT port 55176. Retain branches, worktrees and evidence. Do not merge or adopt peer heads without ROOT clearance. Preserve an old task observation as labelled retained data; do not let it authorize new attachment or source activation.

## Artifacts and Notes

Operational handoff files live in `/tmp/swarm-ide-demo-controls.q2i33c/task-workspace`. Keep `seam.md` concise and record final checks in `verification.md`.

## Interfaces and Dependencies

Reuse React, existing typed bridge, pinned Git reader and YAML worker, and the existing React Flow canvas. No new runtime dependency or provider/model integration is required. `TaskContext` will accept the existing task client state plus deliberate navigation callbacks and explicitly associated activity. Optional task-only canvas layout/scope inputs must preserve Plan's default behavior.

Initial plan records T4's implementation scope and current assumptions before code changes.
