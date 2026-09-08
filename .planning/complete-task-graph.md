# Show the whole available task graph

This ExecPlan follows `.planning/PLANS.md` and is updated as the repair proceeds.

## Purpose / Big Picture

The task reader can load this repository, but the graph displays only its first
64 task details and then hides more nodes and edges. Remove those presentation
cutoffs so the overview includes every available task, isolated node and recorded
dependency. A deliberate selected-task view may show only direct neighbors, but
must show all of those neighbors.

## Progress

- [x] (2026-09-08 21:05Z) Inspected graph, client, existing tests and schema; claimed `swarm-complete-task-graph`.
- [x] (2026-09-08 21:09Z) Reproduced five pure completeness failures and two mounted completeness/lifetime failures. Nine existing client tests also exposed their mismatched workspace fixture.
- [x] (2026-09-08 21:12Z) Removed graph caps and coalesced progress; 27 focused tests and both TypeScript boundaries passed after the fixture correction.
- [x] (2026-09-08 21:16Z) Reproduced the native review slot-saturation finding, then repaired it; 31 focused tests/types passed and native fix-delta review was CLEAN. Code pushed as `633aea1` in PR138.
- [ ] Finish documentation/status handoff and mark the pushed PR ready for ROOT.

## Surprises & Discoveries

The old projection tests supplied dependency arrays without updating summary
counts. New large examples will parse through the actual task schemas. The core
permits 32 incoming and 32 outgoing declarations per task, sufficient for a
64-neighbor regression without changing that unrelated reader contract.

The first new check launcher lacked executable mode, so its first invocation
never ran tests. The actual baseline then recorded 16 failures / 10 passes:
seven intended graph/lifetime failures and nine inherited graph-client setup
failures. `initialSnapshot()` names `project:test-fixture` while those tests pass
tasks for `project:swarm-ide`. Aligning only `snapshot.project.id` restores the
strict client tests. A first correction mistakenly used `snapshot.repository.id`;
that failed visibly before being corrected, not hidden as an environment failure.

Native review found that restarting a batch while canceled RPCs still occupied
all four slots returned null for all new reads. Its added regression was one
failure / 27 passes before repair. Waiting abortably for slots fixes this without
increasing actual request concurrency. The current local metadata tree contains
311 Ditz issue files; this count is read-only Git evidence, not an app/UI proof.

## Decision Log

Keep four concurrent detail reads and the existing client identity checks. Remove
count truncation rather than replacing it with larger arbitrary numbers. Coalesce
progress publications so cached results do not rebuild the entire graph for each
detail. Keep the plan schema and shared canvas unchanged; parallel workers own
those concerns. ROOT owns merge and managed-app adoption.

The graph client now waits for occupied read slots and rechecks identity after
waking. It still owns each sent RPC until settlement. Use indexed task IDs in the
edge outline and component-local edges for layout to avoid repeated full scans.
These are narrow scaling corrections inside the existing graph, not a new
rendering platform. The shared canvas implementation and its tab/camera API are
unchanged.

## Outcomes & Retrospective

The complete available graph and every direct neighbor now survive projection.
31 focused tests, both TypeScript checks and native fix-delta review are clean.
The mounted test uses a canvas stand-in to prove TaskGraph keeps that component's
identity, selection and camera state; no new actual ReactFlow/desktop proof is
claimed. ROOT still owns merge, canonical index mapping integration and adoption.

## Context and Orientation

`app/renderer/tasks/graph.ts` loads details and projects directed blocker-to-blocked
edges. `TaskGraph.tsx` owns the visible graph and its read lifetime. `client.ts`
pins each read to the task metadata commit and rejects late responses after
repository, revision or core-lifetime changes. `tests/task-graph*.ts` exercise
those boundaries; `tests/task-workspace-graph.test.ts` exercises layout and scope.
No task or agent operation is authorized by graph selection alone.

## Plan of Work

First change the graph tests to require all 100+ tasks, more than 512 edges and
128 missing endpoints, plus a selected task with 64 neighbors. Run the new focused
Bazel target before implementation and record the failures. Then remove detail,
edge, endpoint, overview and neighborhood caps; keep only concurrency as a work
limit. Update the graph's copy and tests, coalesce progress, and add mounted
cancellation/camera checks. Update `docs/task-workspace.md` and the existing task
design description; canonical `.swarm/plans.json` remains owned by the plan repair.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/task-graph-complete` on
`fix/complete-task-graph`. Materialize dependencies with
`nix develop --command pnpm install --frozen-lockfile`. Run
`nix develop --command bazel test //tools/demo-plans:graph-checks --jobs=2`.
The target runs the graph, graph-client, scope and mounted graph tests plus both
TypeScript boundaries. Use granular commits, an early draft PR, and native review
to a clean fix delta. Never run the full quality suite for this bounded repair.

## Validation and Acceptance

All graph summary identities, edges and missing endpoints in contract-valid test
inputs must be preserved; reciprocal declarations deduplicate with diagnostics
intact. Default overview hides nothing; selected scope includes all direct
neighbors. At most four reads run at once. Aborting, hiding, changing repository
or revision, or disposing suppresses late publication and further reads. Failures
remain unread rather than becoming fabricated empty relations. Existing layout,
selection and camera ownership remain unchanged. Record actual checks and any
inherited failures precisely in the step directory verification.

## Idempotence and Recovery

No repository metadata, user app, model run or physical desktop is changed by
tests. Temporary tests own their resources. Keep pushed branches for ROOT's
normal merge; preserve unrelated worktree changes if encountered.

## Artifacts and Notes

Control and concise proof live in `/tmp/swarm-ide-graph-repairs.YJnbyZ/tasks`.
The final recap records PR, checks, review, Ditz status and remaining limits.

## Interfaces and Dependencies

Existing task schemas, client bridge, projection types and React canvas remain
the integration boundary. No new package, provider or shared App seam is planned.

Initial plan recorded before code changes, 2026-09-08. Updated after focused
verification and native convergence to preserve actual failures and proof limits.
