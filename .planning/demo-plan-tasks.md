# Browse real task dependencies and authored plans

This living ExecPlan follows `.planning/PLANS.md`. Update Progress, discoveries, decisions and outcomes as evidence arrives.

## Purpose / Big Picture

The Plan lens will expose two separate views: real Ditz task blockage and an explicitly authored plan/component hierarchy. A person can follow a dependency into the existing task detail, Attach and Reveal workflow, or follow a plan to its document, source or task. No selection dispatches an agent. The existing System, Service and Build graphs retain their independent navigation and open source/draft state.

## Assumptions and failure boundaries

The opened workspace is a registered local Git worktree. Ditz summaries and details are read-only observations pinned to a metadata commit, not scheduling authority. Metadata may be missing, malformed, incomplete, cyclic or change while requests are in flight. Graph loading must bound total detail work and concurrency and discard old-world/revision/lifetime replies without changing the user's selected task. Plans are ordinary working-tree `.swarm/plans.json` bytes, read through the contained-file broker; their content hash is not a claim that the document links or implementation are current. Missing or invalid data never falls back to fixtures. Author-controlled labels are text, never HTML, shell commands or authority to read outside the registered repository.

## Progress

- [x] (2026-09-07) Verified designated clean branch and ROOT-cleared baseline e8ec0f9; consumed exact task and read instructions.
- [x] Created and started Ditz issue demo-plans-20260907; synchronized metadata.
- [ ] Add explicit bounded task-dependency projection and mounted Plan lens UI.
- [ ] Add bounded authored plan reader, linked browser, truthful Swarm index and maintenance instructions.
- [ ] Prove real CLI-authored disposable metadata and actual packaged UI on owned virtual X11.
- [ ] Run meaningful local gates, proportional provider-diverse council, push reviewed PR and normal merge if base remains cleared.

## Surprises & Discoveries

The current Plan lens is only a label over the System layout. The existing TaskBridgeClient deliberately owns one selected detail; graph reads must not reuse its selection-changing method. TaskDetail already contains complete bounded blocks/blockedBy rows with missing/cyclic/asymmetric diagnostics.

## Decision Log

Task graph reads will be a small read-only method on the existing client, pinned to the currently observed snapshot, with independent cancellation and bounded concurrency. Graph selection will use explicit pinned activation rather than a latest-revision lookup. Plans use a versioned explicit index rather than directory inference. Both views stay mounted across lens switches so source/draft and independent graph cameras survive navigation.

## Outcomes & Retrospective

Implementation pending. This step does not implement planning automation, task mutation, live managed providers or orgs' full skill system.

## Context and Orientation

`protocol/tasks.ts` defines validated task snapshots, summaries, details and immutable Git object identities. `app/renderer/tasks/client.ts` owns the existing task observer and deliberate selection. `app/renderer/App.tsx` composes the source editor, task detail and graph panes. New renderer modules live under `app/renderer/plans/` and `app/renderer/tasks/graph*`. New `protocol/plans.ts` and `core/plans.ts` validate and read the authored index. The typed request/response bridge in `protocol/schema.ts` and `core/worker-runtime.ts` routes the narrow read; the renderer does not read the filesystem.

## Plan of Work

First build a pure task graph projection retaining isolated summaries and directed blocker-to-blocked edges. Explicit loading reads at most 64 details with concurrency four from one pinned snapshot; the UI labels loaded/total and missing/unread endpoints. Existing task pin validation owns activation. Add a ReactFlow pane with keyboard-accessible nodes and edge endpoint actions, plus a textual outline for predictable navigation.

Then add the fixed-path plan reader using the existing canonical byte broker, a strict 64KiB/128-node authored schema, a separate containment graph and selected-node links. Provide a small real Swarm index referencing checked-in documents/source and existing Ditz IDs. Explain the context references as selected guidance, not proof of all effective context. Core lifecycle and identity fencing make stale or disconnected views non-current.

Finally add a dedicated `tools/demo-plans` packaged acceptance target. It creates its own disposable Git worktree and CLI-authored Ditz fork/join tasks and three-level plan index, then uses the existing owned virtual-X11 infrastructure. No existing task/rehearsal proof is edited. Capture screenshots, verify negative states and preservation, and leave only owned artifacts/process cleanup.

## Concrete Steps

Run commands from this designated worktree. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Build and test only through Bazel: `nix develop --command bazel test --jobs=3 //tools:quality`, then relevant dedicated targets and one meaningful final full gate serialized with `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock`. Launch production proof through its Bazel target on owned virtual display, never inherited DISPLAY:0. Push granular topic commits and open a draft PR early. Hosted CI is ignored by explicit user direction.

## Validation and Acceptance

Unit tests must cover cancellation/revision identity, bounded work, partial coverage, isolated nodes, missing endpoints, cycles and asymmetric declarations. Reader tests must reject invalid hierarchy, unsafe paths, oversized/nonregular input and keep exact byte provenance. Mounted tests must show explicit activation only, retained graph cameras/source/drafts, useful missing metadata and no fabricated dispatch readiness. Actual packaged proof must show a CLI-authored fork/join graph and three plan levels, document/source/task links, task attachment, malformed/missing metadata and zero new critical renderer errors. A synthetic test is labelled synthetic; the shipped authored Swarm hierarchy is not called inferred.

## Idempotence and Recovery

All reads are bounded and read-only. Retry/refresh is an explicit gesture; no background scanning service or automatic replay is introduced. A failed proof remains evidence and is not turned into a fix by retrying. Preserve the topic branch/worktree and evidence. Only owned virtual desktop and child test processes are stopped; master/shared apps are ROOT's responsibility.

## Artifacts and Notes

Operational recap, seam, evidence and screenshots belong under `/tmp/swarm-ide-demo-release.GY8Uwv/plans`. The final verification records exact commit/tree, review seats, local gates and remaining limitations. Public docs contain no private transcripts or operator paths.

## Interfaces and Dependencies

Use existing React, ReactFlow and Zod dependencies. `PlanIndexSchema` validates authored hierarchy; `readPlanIndex(root)` returns safe unavailable or content-hashed observed data. Existing `TaskBridgeClient` remains the single polling owner; graph loading is deliberate bounded reads, not another observer timer. Optional callbacks coordinate source and task activation without merging distinct node domains.

Initial plan authored before implementation; task graph first because its real provider and ordinary detail workflow already exist.
