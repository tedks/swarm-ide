# Inspect exact file-linked tasks without leaving the source


This ExecPlan is a living document maintained under `.planning/PLANS.md`. Its
Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective
must be updated as work proceeds. Q3 authors the design only. **Do not execute
Q4 until ROOT evaluates and authorizes this plan.**

## Purpose / Big Picture


After Q4, inspecting a file shows Ditz tickets that explicitly reference that
exact path, including tickets never previously opened. Clicking a row inspects
the exact recorded metadata revision without moving source, cursor, unsaved
text, agent draft or graph cameras. Unavailable metadata stays visibly unavailable
instead of looking like an empty bug list. This is a bounded real-data vertical,
not a general knowledge index or agent dispatch feature.

## Progress


- [x] (2026-09-07 04:45Z) Inspected Q2 base `7562668`, current task provider,
  runtime schemas, renderer client, Context and document/attention controls.
- [x] (2026-09-07 04:45Z) Chose complete-or-unavailable atomic publication,
  exact matching, explicit byte budgets and pinned inspection contract.
- [x] (2026-09-07 04:54Z) Q3 independent native light design review CLEAN after
  scalar-byte clarification; actual whitespace/link/plan/scope checks passed.
  Normal landing is recorded by the PR and separate landing receipt, not assumed.
- [ ] ROOT evaluation of the landed Q3 decisions; Q4 owner/worktree authorization.
- [ ] Q4 protocol/provider projection and negative boundary evidence.
- [ ] Q4 client/index/visibility/pinned attention plus Context consumer.
- [ ] Q4 actual packaged CLI-metadata proof, local full gates, substantive review,
  normal merge, Ditz and reviewed integration handoff.

## Surprises & Discoveries


`TaskSnapshotSchema` strips file refs into summary counts, while
`createDitzTaskProvider` already parses all details in one bounded refresh.
There is no need for another reader. However, 256 issues × 32 references ×
1,024 raw path bytes already exceeds 8 MiB with JSON overhead, versus the
existing 512 KiB result budget; appending paths without a separate failure mode
would break previously usable task browsing.

`TaskBridgeClient.select(id)` follows the current adopted revision and
`reconcileDetail` can replace it on refresh. A pinned click therefore needs both
a pinned read and a retained pinned-selection mode. `App.tsx` currently derives
task visibility from the compact Work pane, insufficient for a file Context
consumer when the sidebar is hidden. The two path grammars also differ: source
candidacy alone is not canonical repository-path eligibility.

## Decision Log


Decision (Q3, 2026-09-07): publish every explicit reference as an ordinal/path
association during the existing scan, with a 256 KiB complete-or-unavailable
projection. Preserve the old 512 KiB base and 16 MiB base-cache limits separately;
cap the whole augmented task result at 784 KiB and augmented cache at 16 MiB +
272 KiB. This preserves ordinary task capacity and permits receiver coverage
validation without copying descriptions/notes. Raw-byte sums are insufficient;
measure actual JSON envelopes with failure-retention reserve.

Decision (Q3, 2026-09-07): use exact intersection of existing canonical repository
and task-source path grammars, all task states, no prose inference. One row per
distinct task; 32 displayed with total and ref count. Source/doc type is not in
Ditz, so label only the recorded explicit file-reference relation.

Decision (Q3, 2026-09-07): one Q4 owner, protocol v6, optional absent projection
means unavailable. New wire data cannot reach strict v5 clients transparently.
Pinned task inspection retains its commit across refresh; only deliberate
reselection changes it. Context-only selection avoids forcing a task document
or moving source. Consumer visibility is a union on the existing client/timer.

## Outcomes & Retrospective


Q3 produced a proposed contract and implementation instructions, not new
behavior or executable evidence. Independent native light design review and its
wording-delta recheck are CLEAN; proportional local docs checks passed. The
actual normal merge is recorded in the PR and Q3 landing receipt. The
foundation Context/knowledge issues remain open after this design, and Q4 will
close only explicit file-to-task backlinks. Task-to-draft provenance, docs/wiki,
live build links, configuration, function metrics and real-agent policy are not
covered by this work.

## Context and Orientation


The renderer is unprivileged. `protocol/tasks.ts` validates all task requests,
snapshots, observations and details. An observation contains the latest attempt
status and an optional retained snapshot from a complete metadata commit.
`core/tasks/provider.ts:createDitzTaskProvider` uses `git-reader.ts` and the
bounded YAML parser in `metadata.ts`/`metadata-worker.ts`, caching only the latest
complete detail map; no filesystem navigation follows from parsing a reference.
The task-only outer deadline is 12 seconds and must remain unchanged.

`app/renderer/tasks/client.ts:TaskBridgeClient` owns lifecycle/connection epoch,
observation ordering, one selected detail and one ref-check timer.
`app/renderer/context/compose.ts` joins independent observed facts for a
`ContextSubject`, the user's last deliberately inspected artifact.
`context/attention.ts` increments an attention generation for every deliberate
inspection; asynchronous activation must retain that generation and navigation
intent. `context/ContextPane.tsx` currently handles only source links.
`App.tsx` owns document tabs, task selection and compact visibility. No graph
container should be remounted by adding a task section.

A metadata pin is `(provider, repositoryId, worldId, metadataCommit, taskId,
issueBlob)`. Git IDs have explicit SHA-1/SHA-256 algorithm tags; they are not
working-source fingerprints or sortable clocks. An association ordinal is its
zero-based position in the task's literal `fileRefs`. A complete projection is
the entire explicit association set at that metadata commit, not a scan of
working source and not a promise of all bugs relevant to a file.

## Plan of Work


Milestone 1 creates `TaskBacklinksSchema` and `TaskBacklinkTargetSchema` in
`protocol/tasks.ts`, the optional snapshot member and exact byte accounting;
increment `protocol/common.ts:PROTOCOL_VERSION` to 6 with corresponding fixture
expectations. The schemas implement the shapes in Interfaces and Dependencies.
Validate at most 8,192 entries, 256 KiB entire projection, per-summary contiguous
ordinals/count equality and task-ID/ordinal canonical sorting. Every path and
classification must satisfy `TaskFileRefSchema`'s rules. Undefined is unavailable,
not empty. Keep strict schemas and existing request IDs/revision correlation.

In `core/tasks/provider.ts:observe`, derive the projection from the already
validated details and put it in the replacement snapshot/cache before the
atomic publication. No extra Git work or asynchronous gap. Preflight original
result with backlinks removed at 512 KiB, entire augmented result at 784 KiB,
base normalized cache at 16 MiB and augmented cache at 16 MiB + 272 KiB. Reserve
maximum sequence width, identities/dates and 512-byte retained failure reason
in the result wrapper, not merely the inner snapshot. Projection overflow alone
uses the tiny unavailable variant and adopts usable new summaries/details;
base failure keeps the existing old whole snapshot and failed-attempt state.
Validate actual incoming bytes independently. Record complete CoreResponse size
in tests, including its workspace snapshot; the 784 KiB cap is on TaskResult,
not an unsupported global IPC-size claim. Existing 64 KiB detail-result limit
and 12-second task deadline remain.

Milestone 2 adds `app/renderer/tasks/backlinks.ts` for a bounded immutable path
index. Include only literal paths accepted by both `isTaskSourcePath` and
`isRepositoryPath`; do not rewrite `.`, case, Unicode, globs or basenames. Index
all task states once per accepted publication, using summaries for title/status/
blob. Group repeated same-path refs into one task row with ref count. Add
association/coverage equality to `TaskBridgeClient`'s same-commit immutability
check; unchanged ref checks reuse the old index. A changed same-commit projection
rejects adoption, surfaces `INVALID_CORE_MESSAGE`, and revokes pending reads.
Empty/missing/malformed/overflow/recovery states preserve truthful evidence.

Add `inspectPinned(target, association, stillCurrent)` to the existing task
client. It checks adopted world/repo/commit/blob and index association before
and after one existing `tasks.read`. Keep the previous selection/detail intact
while pending. Capture client epoch and detail ticket; the caller's predicate
checks attention generation/navigation intent/file identity and current core
realm. A successful still-current result adopts the exact detail and a retained
selection pin; refresh may mark it stale but must not rebase its contents.
`select(id)` explicitly leaves this mode. Do not add historical core caches,
source reads or retries at a newer commit. A pinned detail must match both
summary and projected file-reference content, not just its ID.

Milestone 3 wires `App.tsx`/`ContextPane.tsx`/`composeContext` to the same client.
Add one file-only section with provider/repo/world, metadata commit, producer
observation time, last ref-check time, coverage and per-row issue blob evidence.
Rows are literal references, not ownership/readiness. At most 32 distinct task
rows, sorted by full ID, with total and per-task ref count. Absent projection
and all failures have notices, not “No bugs.” A complete empty set says no
explicit refs in that observed/retained metadata revision. Remove only the
now-supported reverse-task portion of the unsupported-provider notice; keep
design/lesson/deploy/metrics unavailable. No new global layout or settings.

Click/Enter captures the pin and attention token, leaving file Context and
document unchanged until the client validates success. Commit task attention
only then. A failed/superseded pin offers explicit Refresh and reselect; passive
refresh cannot perform that selection. Context click does not open a task tab;
existing deliberate Show task document may open the same pin. Preserve source
tabs/dirty bytes/cursor/draft and both graph instances/cameras at 100%/150%.
Task-only Return/close retains existing behavior. No task-link action emits
source Reveal or graph focus calls.

Aggregate task-client visibility across visible Tasks sidebar, task document/
detail and file Context, intersected with window visibility. Only a transition
of that aggregate from hidden to visible or window focus calls the existing
cheap ref check. First visible consumer in a client lifetime/reconnect permits
one initial full observation. Repeated path/cursor changes never scan. Use the
same existing 5-second timer, coalescing and disposal; no new scheduler. Context
Refresh uses `taskClient.refresh()` without changing compact pane or attention.

Milestone 4 proves the actual packaged vertical. Extend
`tools/repository-navigation/acceptance.cjs` and its `fixture.mjs`/`scenario.sh`,
reusing CLI Ditz authoring from `tools/task-integration/fixture.mjs` and the owned
virtual-X11 desktop. Add focused task protocol/provider/client/Context tests
under `tests/`. The existing target is
`//tools/repository-navigation:packaged-navigation-test`; preserve its actual
package launch in `launch.mjs`, not an injected or direct native runner.
An independent read-only reviewer may audit tests, but no second builder owns
shared App/client/protocol files. Freeze executable inputs before full gates.

## Concrete Steps


Run only after ROOT assigns a dedicated Q4 feature worktree; the Q3 docs worktree
is not implementation authority. From that assigned worktree, inspect `pwd`,
`git status --short --branch`, `AGENTS.md` and this plan. All project tooling uses
Nix; Bazel is the only build/test/dev entry point. Use `apply_patch` for edits.
Materialize frozen dependencies and run the existing quality target:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test --jobs=3 --nocache_test_results //:quality

Add red tests before implementation for missing backlinks, silent newer-revision
substitution and hidden-sidebar Context freshness. Run the same quality target
after changes; those tests must become green without weakening legacy source/
attention/boundary assertions. For final local gates:

    nix develop --command bazel build --jobs=3 //...
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test --jobs=3 --nocache_test_results //...

Use the repository-owned virtual harness exclusively, port55174 only under its
lock/ownership checks, never inherited DISPLAY or human canvas55175. The packaged
test must load the built tarball's actual main/preload/core/YAML worker/assets,
not Vite or injected metadata in the renderer. No direct native test runner.
No product model turn. Do not copy or adopt the human preview worktree.

Maintain an idempotent Ditz Q4 slice after authorization; Q3's design issue is
not it. Use granular commits, early draft PR, local gates and substantive
council review to fixpoint with missing providers disclosed. Normal merge via
PR, no direct master push or squash. Hosted CI is entirely ignored. ROOT owns
shared integration and preview adoption; report exact approved parents/trees
before consuming an unexpectedly advanced base. Finish with Ditz sync, successful
topic push and a clean own worktree; retain recovery/evidence for ROOT.

## Validation and Acceptance


Actual packaged positives: in each of two disposable repositories use the real
Ditz CLI to create a previously unopened task and `ditz ref` to a real file.
Use its fixed ID and recorded Git commit/blob in evidence. The unrelated task
with an equal basename in another directory and a prose-only mention must not
appear. Duplicate refs produce one row with count; closed task refs appear
independently of the sidebar's Open filter. Inspect the matching file with the
sidebar hidden in compact mode; observe one initial task publication and the
correct row. Click it and verify the exact title/ID/commit/blob in real task
detail. Return to source; strict byte equality, logical cursor, draft and graph
DOM/camera identities survive at 100% and 150%. Source is never reopened by
task inspection. Save screenshots and complete zero-renderer-error receipts.

Actual packaged failure/recovery observations: CLI-create a newer revision and
explicitly Refresh while a pinned detail is open; the old detail stays labelled
retained until a deliberate new selection. Show failed/missing/malformed local
metadata, supported-reader projection overflow (not base overflow), unsupported
refs and owned core recovery with old data visibly stale/unavailable, never
false zero/current. Author positive refs via CLI; malformed bytes or oversized
fault inputs, if CLI cannot represent them, are explicitly labelled faults in
owned temporary repos. Never alter real metadata to manufacture failure. Verify
all disposable process/namespace cleanup and zero product model requests.

Mounted/protocol/provider tests supply deterministic races and exact ceilings,
separately labelled from packaged positives. Delay old task reads across refresh,
file A→B→A, another task, tab close, same-identity new core generation and client
dispose; no late completion changes attention, detail or tabs. Test changed
summary/projection/coverage for the same commit, forged row ID/blob, unsupported
path grammar intersection, missing ordinal, duplicate pair and wrong metadata
algorithm. Test exact-byte limit success/one-byte excess with escaped strings,
largest identity/failure-retention wrapper, full CoreResponse byte accounting,
old-capacity roster retained when only projection overflows, absent v6 member
unavailable and v5/v6 mismatch rejected. A post-overflow cheap ref check cannot
claim backlinks exist; a base failure cannot publish partial refs.

Instrument existing provider/client seams in tests: repeated file/cursor changes
produce **zero extra Git refreshes, zero detail fanout and no second timer**;
one deliberate backlink inspection reads at most one pinned detail, or none if
the exact validated detail is already retained. Unchanged ref publications do
not rebuild the index; visibility union/disconnect/dispose stop owned timers and
pending authority. These counters are test observations, not product telemetry.
All actual local suites pass; earlier failures remain reported, not erased by
a later run. Fixture-only ambiguity/camera data is never called live evidence.

## Idempotence and Recovery


Projection construction is deterministic for a metadata revision and policy
version. Full refresh atomically replaces one cache; overflow produces one small
unavailable value. A failed refresh keeps old evidence and its original pin;
no retry queue grows with clicks. Renderer restores may retain old data but no
current badge or in-flight activation. On a dirty-worktree collision stop and
request ROOT ownership, rather than resetting/copying peer files. Retain branch,
worktree, session and evidence; remove only exact owned ephemeral processes.

## Artifacts and Notes


Q3 expected scope is exactly `docs/task-backlinks.md`, this ExecPlan and one
foundation-ledger row update. Q3 local checks are whitespace, relative links,
required plan sections and scope; no fresh executable/GUI proof is claimed.
Record exact docs review, topic/normal commits, parents/trees, Ditz and cleanup
in the Q3 step's `landing-verification.md`. Q4 separately records new tested
executable SHA, packaged receipts/screenshots, counters and honest proof layers.

## Interfaces and Dependencies


In `protocol/tasks.ts`, define runtime-validated types with existing TaskId,
GitObjectId, task world identities and UTF-8 limits:

    type TaskBacklinkEntry = {
      taskId: string; refIndex: number; path: string;
      navigation: "candidate" | "unsupported";
    };
    type TaskBacklinks =
      | { status: "complete"; entries: TaskBacklinkEntry[] }
      | { status: "unavailable"; reason: "projection-limit" };
    type TaskBacklinkTarget = {
      provider: "ditz"; repositoryId: string; worldId: string;
      metadataCommit: GitObjectId; taskId: string; issueBlob: GitObjectId;
    };

The optional snapshot field is `backlinks?: TaskBacklinks`; absent never means
empty. `protocol/context.ts`'s renderer-local task link becomes
`{kind:"task"; target:TaskBacklinkTarget}`. Composition receives the existing
task client observation/index and connection/error/refresh state, not an RPC.
`inspectPinned(target, association, stillCurrent): Promise<boolean>` commits
the pinned selection only on success; `association` includes the exact path and
accepted index identity, while `stillCurrent` tests the captured UI authority.
Rejected/superseded operations return false with safe bounded notices; no raw
metadata/error fragments. Reuse Zod, the existing YAML worker, typed bridge and
TaskBridgeClient. No new dependencies, requests, worker or model capability.

Revision note (Q3, 2026-09-07): initial design explicitly budgets overflow and
retained-selection behavior because neither summary counts nor ID-only selection
can safely implement a file backlink. ROOT acceptance is a separate gate.
Light review clarified that existing scalar limits count raw UTF-8 while aggregate
limits count serialized JSON, and the plan now names the actual packaged harness.
