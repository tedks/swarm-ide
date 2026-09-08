# Make activity and work status useful at a glance

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Operators should see timestamped raw tool/file operations in Activity, completed logical outcomes in Work Log, and readable run states in the agent list. A saved outcome is not still running just because it has not been written to Ditz. Background reads must not make the panels blink or steal focus.

## Progress

- [x] 2026-09-08 13:33Z: Read ownership, current panel implementations and start Ditz issue.
- [ ] Add concrete presentation regressions and implement independent Activity/settings/jobs cleanup.
- [ ] Consume the reviewed shared lifecycle producer and add accessible badges/status regressions.
- [ ] Run focused local checks, native convergence, useful owned virtual proof, update docs, push and hand off.

## Surprises & Discoveries

Current Work Log entries use the producer's `working` state until explicitly recorded in Ditz. Activity previews include assistant paragraphs while the main raw stream excludes them. Normal observation refresh is rendered as extra explanatory labels. Real job contracts expose progress and status, but resource values have no measurement provenance; zero placeholders cannot be treated as live measurements.

## Decision Log

Use only the agent-state owner's lifecycle classification; this branch owns rendering, not inference. Keep current session state distinct from a historical outcome. Reuse existing ActivityTime and callbacks. Keep measured-job absence quiet rather than inventing resources. App and global layout belong cockpit-layout; communicate exact mounts rather than editing its files.

## Outcomes & Retrospective

Implementation and proof pending.

## Context and Orientation

`app/renderer/external-agents/ExternalAgents.tsx` renders the registered agent tree. `ObservedActivity.tsx` renders the small Activity stream and `FleetActivityView.tsx` its expanded form. `work-log/WorkLogPanel.tsx` owns summary controls and outcome presentation. `build-resources/BuildResources.tsx` renders current jobs and an explicitly optional illustrative profile. Shared validated data lives in `protocol/`; its lifecycle changes belong agent-state.

## Plan of Work

First add tests for raw operation filtering, stable focus and the settings gear. Simplify the local Activity presentation without changing event activation identity. Add a shared glyph component and consume the committed lifecycle API once reviewed; update Work Log current-state display without mutating saved outcomes or record controls. Improve real job labels/counts while keeping unmeasured resources honest. Update `docs/design/activity.md` and check the matching design mapping, coordinating manifest repairs with plans.

## Concrete Steps

From this worktree run `nix develop --command bazel test --jobs=3 //tools/live-observers:unit //tools/work-log:check //tools/build-resources:unit --test_output=errors`. Use the existing owned virtual launcher for one local visual check; never automate physical :0. Commit granular changes to feature/usability-activity-ui, push, open draft PR, and complete scoped native review. ROOT normally lands and adopts.

## Validation and Acceptance

Tests must prove raw tool/file entries remain linked to their originating session, assistant prose does not swamp Activity, refresh preserves the selected event node, gear settings remain keyboard accessible, and status glyphs have visible text and distinct shapes. Completed outcomes remain completed when session state changes; record actions keep their exact entry/task identity. Build jobs display only provided jobs, no fake running rows or calculated resource distributions.

## Idempotence and Recovery

No schema/storage migration is owned here. Existing Work Log mutation lane remains intact and never retries. Retain clean pushed branch and all evidence for ROOT; clean only this worker's virtual desktop and Bazel server.

## Artifacts and Notes

Authoritative handoff and evidence: `/tmp/swarm-ide-usability.BirZCk/activity-ui/`. Exact tests and review will be recorded there.

## Interfaces and Dependencies

Existing callbacks carry session IDs, source paths and recorded patches. Preserve them. Optional lifecycle data must render unknown when absent, not pretend progress. The agent-state committed seam will define its exact type. No new model calls or summarizer runs are needed.

Initial plan written before implementation; records bounded ownership and assumptions.
