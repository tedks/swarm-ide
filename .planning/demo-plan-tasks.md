# Browse real task dependencies and authored plans

This living ExecPlan follows `.planning/PLANS.md`. Update Progress, discoveries, decisions and outcomes as evidence arrives.

## Purpose / Big Picture

The Plan lens will expose two separate views: real Ditz task blockage and an explicitly authored plan/component hierarchy. A person can follow a dependency into the existing task detail, Attach and Reveal workflow, or follow a plan to its document, source or task. No selection dispatches an agent. The existing System, Service and Build graphs retain their independent navigation and open source/draft state.

## Assumptions and failure boundaries

The opened workspace is a registered local Git worktree. Ditz summaries and details are read-only observations pinned to a metadata commit, not scheduling authority. Metadata may be missing, malformed, incomplete, cyclic or change while requests are in flight. Graph loading must bound total detail work and concurrency and discard old-world/revision/lifetime replies without changing the user's selected task. Plans are ordinary working-tree `.swarm/plans.json` bytes, read through the contained-file broker; their content hash is not a claim that the document links or implementation are current. Missing or invalid data never falls back to fixtures. Author-controlled labels are text, never HTML, shell commands or authority to read outside the registered repository.

## Progress

- [x] (2026-09-07) Verified designated clean branch and ROOT-cleared baseline e8ec0f9; consumed exact task and read instructions.
- [x] Created and started Ditz issue demo-plans-20260907; synchronized metadata.
- [x] Add explicit bounded task-dependency projection and mounted Plan lens UI.
- [x] Add bounded authored plan reader, linked browser, truthful Swarm index and maintenance instructions.
- [x] Prove real CLI-authored disposable metadata and actual packaged UI on owned virtual X11; default repository passed at 123fa18 with strict source/draft/camera/negative checks and zero renderer exceptions.
- [x] Finish the separate authored-Swarm archive case after correcting its exposed controlled-selection feedback loop: actual six-node/three-level committed index and 71 CLI-authored tasks, with 64 read / 7 unread coverage, passed at 8bd8367.
- [x] Run meaningful local gates and proportional provider-diverse council; push reviewed PR53. Full build42 passed; all18 suites executed,17 passed and quality found two owned test typing options. Test-only correction07317bb passes quality1558/111,109 focused regressions and packaged edge/task/Attach proof; unchanged production covered by the17 other full-suite passes.
- [ ] Normal merge and Ditz closure: held for ROOT's written B1-base clearance and merge-order slot, not an implementation gate. Do not consume later remote master without approval.

## Surprises & Discoveries

The current Plan lens is only a label over the System layout. The existing TaskBridgeClient deliberately owns one selected detail; graph reads must not reuse its selection-changing method. TaskDetail already contains complete bounded blocks/blockedBy rows with missing/cyclic/asymmetric diagnostics.

Review found actual late-intent, client-lifetime and aggregate canceled-request-cap holes. Controlled tests failed before those corrections, then passed. Real packaged navigation found measurable graph containers were necessary to avoid System camera restoration drift; opacity plus inert was required because Flow descendants explicitly override visibility/pointer defaults. The three-node default journey then passed in 6.3 seconds. A separate six-node Swarm archive journey exposed selection ping-pong: an internal Flow selection observation can lag the controlled selection prop. Installed Flow source confirms independent node-sync and selection effects. The correction retains explicit click/keyboard/outline authority and does not feed observations back into parent selection. Its dedicated retained-selection regression failed before correction (1 RED / 106 PASS).

## Decision Log

Task graph reads will be a small read-only method on the existing client, pinned to the currently observed snapshot, with independent cancellation and bounded concurrency. Graph selection will use explicit pinned activation rather than a latest-revision lookup. Plans use a versioned explicit index rather than directory inference. Both views stay mounted across lens switches so source/draft and independent graph cameras survive navigation.

Native review converged on each substantive delta. Anthropic Sonnet produced no review before a bounded stop; Google returned acknowledgements, not reviews, on an initial call and one continuation. Both are recorded as unfilled seats, never as CLEAN. The misleading busy-versus-expired graph notice is a noncritical Ditz follow-up, not hidden. ROOT has explicitly cleared integration base 94efa689 in the demo wave's written integration authority; no later remote tip is implied.

The 71-task Swarm proof and 70-task small-repository proof exercise real visible partial coverage after the legible fork/join tour. Repeated exact ResizeObserver warnings remain in raw evidence (34 in the final Swarm case,10 in the corrected small case); they are the exact user-accepted noncritical class, not suppressed or called fixed. The proof's outer gate recomputes classification from preserved raw diagnostics and rejects all other errors, forged classifications, missing evidence or model activity. Source, attachment and cameras survived those runs. Inspecting another task correctly adds an existing retained-preview notice; immutable attachment content is compared separately from that explicitly asserted freshness state.

## Outcomes & Retrospective

The bounded views, strict broker reader, authored Swarm index and maintenance guide are implemented, reviewed and locally verified in PR53. Normal landing remains coordinated by ROOT because remote master advanced to B1 and its previous landing slot is still reserved. This step does not implement planning automation, task mutation, live managed providers or orgs' full skill system. Default disposable data is CLI-authored test input; the Swarm case archives committed authored source but creates its own matching task records, not the source repository's metadata branch. Final runtime code is unchanged from the frozen full-suite tree; the later correction changes only test typings and adds the explicit edge endpoint proof.

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
