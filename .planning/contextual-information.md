# Deliver the first truthful file-specific Context instruments


This ExecPlan follows `.planning/PLANS.md`. Keep Progress, Surprises &
Discoveries, Decision Log, and Outcomes & Retrospective current. Q0 authors the
design only; ROOT accepted its single-owner Q1 gate on 2026-09-07. Q1 implements
that approved slice in PR41. The full contract is `docs/contextual-information.md`.

## Purpose / Big Picture


Opening two unrelated files must show their own supported facts and links, not
the same FraudCheck service cards. The first implementation keeps the current UI
shape, makes Context attention explicit, and composes already available source,
service artifact, dated build capture, and task observations. Missing providers
are visibly unavailable. It does not activate agents or create a new scanner.

## Progress


- [x] (2026-09-07 02:18Z) Grounded Q0 in PR39 source, exact service artifact,
  source/task attention, captured links, and the user-approved UI seam.
- [x] (2026-09-07 02:22Z) Specified publication, attention, provenance, bounds,
  gestures, negative cases, and one coupled Q1 owner.
- [x] (2026-09-07 02:26Z) Q0 light native design review CLEAN after fixing both
  substantive clarifications; local links, plan sections, scope and whitespace
  checks passed. PR40 owns normal docs landing and the final recap its receipt.
- [x] (2026-09-07 02:40Z) ROOT verified Q0, approved Q1 and designated the contextual-information worktree.
- [x] (2026-09-07 02:45Z) Red provider regressions proved ordinary-file and required-declaration ownership leakage: 2 failed, 1194 passed. Frozen log in Q1 step red.log.
- [x] (2026-09-07 02:56Z) Q1 typed publication, explicit attention and bounded
  local composition pushed as `b0ad27c`; draft PR41 opened.
- [x] (2026-09-07 03:21Z) Verified earlier two-repository packaged acceptance on
  `ebd71eb`, including exact source/artifact relations and retained work.
- [x] (2026-09-07 03:16Z) Fixed native/Google Back acknowledgement race and
  publication provenance cache identity; added mounted regressions, unrelated
  document-close retention and actual failed-manifest build proof in `d53c63f`.
- [x] (2026-09-07 03:21Z) Frozen `d53c63f` full 34-target build and all 13 local
  suites passed; quality 1,212 tests / 90 files. Native and Google convergence
  CLEAN; Anthropic attempted but timed out at 600 seconds without a review.
  PR41 is the normal landing unit; its merge receipt and exact integration tree
  are recorded in the Q1 executive handoff rather than inferred from test success.

## Surprises & Discoveries


`core/provider.ts::RealWorkspaceProvider.selectFocus` unconditionally adds the
last `serviceWidgets` for any file. `core/service-topology.ts` has exact structured
artifact inputs but converts them to global widgets and one-directional
service/interface-to-repo mappings. Keeping the structured evidence avoids a
new lookup service. `retagSnapshot` changes working mapping revisions even while
old built data remains retained, so mapping revision is not artifact provenance.

The example's `payments.proto` declares a required interface; it is not an owning
implementation file. The manifest's Payments dependency is not an observed call:
the implementation has no corresponding call expression. Existing Ditz summary
counts cannot implement a complete file-to-task index. These are limits to show,
not gaps to fill with plausible strings.

Q1's removed subjectless widgets were also test file-opening controls. The first
iteration exposed 47 failures in six legacy suites. ROOT approved migrating only
those setup gestures to the real command palette and changing obsolete default
widget labels. This exposed a real first-activation bug: a layout effect could
use the previous workspace reference. Publishing the accepted reference before
the attention reset fixes that bug; the retention assertions were not waived.

Explicit Reveal of an already open dirty buffer previously skipped checking the
destination. It now performs a broker read to validate the explicit link while
retaining dirty bytes and cursor. Context composition itself does not reread.
The old focus-only request-list assertion was updated to require read then focus.

Native and Google review both caught Back reading an event-owned workspace after
an acknowledgement that need not be accompanied by the graph event yet. Back now
captures its actual requested destination, guarded by intent/realm/attention.
The native pass also caught reuse of an artifact index when build bytes stayed
identical but the source fingerprint changed; the index now keys all publication
provenance. New mounted tests exercise both, including unchanged artifact bytes.
One first regression used an impossible same-epoch green publication and was
correctly rejected; the test now models a new reconciliation epoch, without
weakening the receiver. Earlier failures remain in the step's iteration logs.

## Decision Log


Decision (2026-09-07, Q0): Recommend one Q1 owner, with read-only review helpers
if useful. Publication, attention, and rendering share source/snapshot semantics
and App.tsx; artificial parallel ownership would slow this small vertical.

Decision (2026-09-07, Q0): Publish optional typed service context with the existing
workspace snapshot and compose locally. The producer already owns bounded,
validated data; no context RPC, source reread, timer, or scanner is warranted.

Decision (2026-09-07, Q0): Context follows last deliberate inspection, not an
always-winning source tab or graph focus. Async Reveal commits only after valid
foreground activation. The user can inspect a graph and return to an editor
without either surface being destroyed or one silently stealing attention.

Decision (2026-09-07, Q0): Preserve separate evidence clocks and limited coverage.
Capture is never live, Ditz commit is not working source, unsaved buffer is not
built/deployed, and a complete example artifact is not a complete monorepo index.

Decision (2026-09-07, Q1): ROOT approved preserving the original optional service
observation in `retainDerived`, and refusing cross-world retention beside the
existing repository guard. No lifecycle, replay or freshness authority changed.

Decision (2026-09-07, Q1): Keep the existing task inspector for explicit task
attention, including its honest empty selection. Closing a non-inspected source
tab must not steal graph/task attention. The explicit mock panel stays separate.

Decision (2026-09-07, Q1): File the Google review's pre-existing `graphs` document
sentinel collision and the producer's working-world-only limitation as
`document-surface-sentinel-collision` and `service-topology-world-parameter`.
They need independent compatibility/producer changes, not a wider Q1 refactor.

## Outcomes & Retrospective


Q0 specifies a bounded next implementation, not contextual UI. The light native
review is CLEAN on `1493c7b` after directory-evidence and pending-activation
clarifications. Foreign review was not requested under docs-only proportionality;
there is no claim of a full provider council or unavailable-seat attempt. Local
checks passed for three documents, four relative links and all twelve required
plan sections, with no build or GUI execution. PR40 and the final executive recap
record actual normal landing/Ditz status. The larger contextual, knowledge,
configuration, callsite, and real-agent gates remain open. The useful simplification
is to retain evidence already produced, not commission another general platform.

Q1 delivers exact file/source/buffer facts, separately sourced service and capture
relationships, literal task attention, and matching directory/service/interface/
edge facts. `core/files.ts` no longer inherits FraudCheck ownership;
`fraudcheck.ts` is an implementation member, `fraudcheck.proto` also declares a
provided interface, and `payments.proto` declares a required interface without
claiming implementation ownership or an observed callsite. Unsupported providers
remain unavailable. Source receipt timestamps are explicitly client receipts;
retained artifacts preserve their original fingerprint through failure/recovery.

At executable head `d53c63f90589241e8e2ec1bcc63ba95d6d5f9fde`, the full build
passed in 56.453 seconds and all 13 freshly executed local suites in 245.528
seconds. Quality passed 1,212 tests in 90 files. Real packaged navigation passed
in 92.1 seconds across Swarm, an unfamiliar repository, an invalid filename and
an unavailable-fingerprint case. Swarm used actual broker bytes and a real Bazel
artifact, then an owned invalid manifest to prove retained failure. All four
virtual sessions recorded cleanup_complete=1 and zero renderer exceptions.
Delayed/out-of-order activation races are deterministic unit/mounted proofs,
not claimed as controlled timing in the package. Product model turns were zero.

Council seats were OpenAI native and Google via ask-agent (both CLEAN on fix delta
`ebd71eb..d53c63f`), and Anthropic via ask-agent (missing: actual 600-second
timeout, exit 124, no review). This is two-provider convergence, not three-provider
approval. Hosted CI was ignored under ROOT authority. The unchanged-head local
owned-process proof passed but does not resolve its separately tracked discrepancy.
Normal PR41 landing and the integration-only merge consume this reviewed tree;
the final handoff records exact hashes. Human ui-canvas55175 and old master remain
untouched. Broad contextual/provider/configuration and real-agent work remain open.

## Context and Orientation


The base is normal PR39 `0313fa7e258916650d7b732b8e5784a9e412e549`.
`core/provider.ts` owns working/built workspace state and last service publication;
`core/service-topology.ts` validates/adapts its single example. `protocol/schema.ts`
runtime-validates snapshots and currently defines subjectless Widget values.
`app/renderer/App.tsx` owns graph selection, file tabs, source buffer state, task
document state, navigation intents, and existing Context markup.

`app/renderer/repository/build-view.ts::fileBuildTargets` matches exact references
inside `fixtures/ui-build-links.snapshot.json`, whose repository ID, revision,
date and command describe a capture. It is not a live query. `protocol/tasks.ts`,
`app/renderer/tasks/client.ts`, `app/renderer/tasks/TaskDetail.tsx`, and
`app/renderer/tasks/reveal.ts` supply separate Ditz observations and explicit
current-file Reveal. `core/files.ts` remains final file access authority.

A Context subject is the thing deliberately inspected, identified by repository,
world and exact path/domain identity. An evidence reference names where a fact
came from, the revision it describes, when it was observed, and how much was
covered. Known-empty means a complete named scope was checked and contained no
matches; unknown/partial means it is not safe to make that negative claim.

## Plan of Work


### Milestone 1: make the leak fail and publish exact evidence


After ROOT dispatch, add failing contract/provider/composition regressions for
unrelated-file service leakage and a required declaration incorrectly labelled
as an owned implementation. Add `protocol/context.ts` and optional
`WorkspaceSnapshot.serviceContext` in `protocol/schema.ts`, with explicit
unavailable handling for old snapshots. In `core/service-topology.ts`, return
validated service identity, target, implementation/declaration associations and
build evidence alongside the graph; `core/provider.ts` publishes/retains it
atomically without rewriting its source fingerprint during working retags.

Use exact artifact membership, not labels or preferred paths. Keep the one-record,
64 implementation/64 declaration/32+32 interface ceilings, a 256 KiB serialized
context cap, canonical paths and 512-character display text bounds. Optional
context overflow/unsupported data reports unavailable, not a whole-navigation
failure. Construct that unavailable value in the producer; malformed incoming
bridge messages still fail strict validation. No public request, worker process,
new dependency, source scan, or
capability is added. Existing IPC snapshot validators carry the additive field.

### Milestone 2: bind Context and reuse navigation


Create `app/renderer/context/attention.ts`, `compose.ts`, `ContextPane.tsx` and,
only if needed, a small `context.css`. Bind explicit graph/source/task/edge
inspection events in `App.tsx` to one subject reducer. Source-tab activation and
visible editor interaction select that exact file. Task document activation
selects that task. A graph inspection can temporarily own Context while a source
tab remains open. Passive publication, palette preview and background Reveal
never choose a subject. Closing the inspected document uses its deliberate
foreground successor or explicit graph subject, never a hidden last-file fallback.

Composition produces Source, Service relationships, and dated Captured build
references sections for files, existing literal TaskDetail for task attention,
matching observed directory facts (with directory observation ID/page coverage)
for directory attention, and a compact notice
for unsupported knowledge/runtime/deployment facts. Remove the unconditional
snapshot.widgets/Truth source fallback from real Context; do not change separate
mock-command semantics or graph/lens layout. Keep mocks visibly isolated.

Each section inherits one compatible evidence reference or is split. For file-read
responses without producer timestamps, label client receipt time explicitly;
restored receipt times are not new observations. Retained
build evidence retains original build hash/input fingerprint; green requires
observed matching working evidence and matching green publication. Dirty buffers,
file observation loss/deletion, failed builds and unavailable fingerprint prevent
claims of current source correspondence. Ditz uses its own commit/blob/freshness.
Capture never becomes live. An unmatched path means no association within the
limited artifact/capture, not globally no relationships.

Index once per accepted publication/capture, replace old indexes, and drop them
on disposal. Cap capture input at 4,096 links/1 MiB, render at most 32 links per
section with explicit partial-display counts. No per-file unbounded cache,
cursor-triggered work, or new timer. Preserve existing core/navigation generations.
Pending Reveal B keeps A active until its captured attention generation, pending
destination/navigation intent, repository/world and live core generation validate.
It need not match active A; any newer deliberate inspection invalidates it.
After successful activation, fact population must separately match committed B
and its observation identity/core generation. This distinguishes activation
authorization from evidence population and prevents late focus stealing.
Restore neither current evidence authority nor green status from old HMR memory.

Source links use exact validated paths through existing broker-backed Reveal.
They retain dirty buffers and logical cursors; failure retains prior attention.
Task links use task ID and pinned metadata commit/blob. Graph links identify an
existing exact domain item. There are no arbitrary executable URI actions.
Service-click auto-opening and actual callsite highlighting are separate future
consumers; Q1 provides labelled implementation/declaration source links only.

### Milestone 3: prove the behavior in the actual package and land


Extend the existing owned virtual repository-navigation acceptance, not a
renderer-only demo, to open Swarm and an independently generated unfamiliar Git
repository. In Swarm, actually build the supported topology, inspect ordinary
`core/files.ts`, mapped `fraudcheck.ts`/`fraudcheck.proto`, and required
`payments.proto`. Show distinct facts and exact relation types. For the unfamiliar
repo, use ordinary files with duplicate basenames and no topology artifact/capture;
the panel still shows correct source and explicit unavailable relationships.

Prove successful explicit declaration-file activation using real file bytes, and
deleted destination refusal without overwriting dirty text. Exercise graph→file,
file A→B→A, task preview, delayed/superseded Reveal, source error/deletion, dirty
editor/cursor/draft preservation, failed/unavailable build fingerprint, and owned
core replacement. Check graph DOM identity/cameras at 100% and compact 150% zoom.
Require zero renderer exceptions and owned virtual cleanup. Retain screenshots
of the two contrasting files and unavailable cases with machine-readable proof.

Unit fault injection covers out-of-order source/task results and snapshot
generation mismatch; package tests prove actual plumbing, not synthetic timing
claims. No fixture model execution or context data injection can substitute for
real file/artifact evidence. Real product agents stay disabled.

## Concrete Steps


Work only in ROOT's designated Q1 feature worktree after authorization. Materialize
dependencies and use the existing Nix/Bazel entry points; never run renderer
tools directly. Relevant commands from that worktree are:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test --jobs=3 //tools:quality
    nix develop --command bazel test --jobs=3 --nocache_test_results //tools/repository-navigation:packaged-navigation-test //tools/task-integration:packaged-task-test
    nix develop --command bazel build --jobs=3 //...
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test --jobs=3 --nocache_test_results //...

Serialize shared owned-virtual proofs with ROOT's current virtual lock if peers
exist. Use the harness's private display/profile/port, never physical DISPLAY=:0
or the human ui-canvas55175. Frozen-head full local results plus proportional
code council convergence are the Q1 merge gate; hosted CI is ignored/nonblocking.
Retain exact commands/head/logs, not a claim that a passing unit count proves UI.

For Q0 only, run whitespace and local Markdown target/plan-section checks on the
three owned docs, with one light design review. Do not build or launch a GUI.

## Validation and Acceptance


Q1 must visibly distinguish two unrelated actual files without leaking example
service facts, show implementation versus required-declaration relations exactly,
and preserve independent source/built/captured/task evidence labels. A later A
response never fills B; no unavailable fingerprint makes a retained artifact
green. Explicit valid links open current supported artifacts; deleted/unsupported
ones fail without losing work. Camera/draft/source tests must check exact retained
state, not only final text presence. Overflow, empty complete scope, partial
display, absent producer, old optional-field snapshots, recovery, and disposal
must have direct negative tests. All relevant local suites must pass with no
renderer errors. Q0 itself claims only reviewed documentation, never these tests.

## Idempotence and Recovery


The implementation adds no persistent migration or new write authority. Optional
context absence is unavailable, not legacy widget fallback. Repeated publications
replace bounded indexes; disposal invalidates pending activation. Do not replay
builds, saves, model requests, or navigation while recovering. Preserve worktree,
branch, review and proof artifacts. Land through a normal PR merge only; keep
the human preview and master worktree unchanged unless ROOT separately adopts.

## Artifacts and Notes


Q0 evidence and handoff live in `/tmp/swarm-ide-context-contract-q0.3e2VDI`.
Q1 should retain frozen-head tests/screenshots in its own step directory and record
normal merge/tree identity. Ditz `contextual-information-contract-q0` covers only
design; `contextual-information` and `ui-context-linkages` remain open. Existing
`ui-service-source-navigation`, `ui-live-build-links`, reverse knowledge/task,
scoped configuration, and process ownership followups are not closed by Q1.

Q1 evidence is `/tmp/swarm-ide-context-q1.XvJMyh`: `red.log`, all `iteration*.log`,
`review-fixes*.log`, `build-final1.log`, `full-final1.log` and council logs retain
both failures and final results. `evidence-d53c63f/testlogs` is an independent copy
of every suite, not rewritable Bazel output. Under `evidence-d53c63f/extracted/
repository-navigation/run.XG3W3e`, each case has proof JSON and owned cleanup;
`swarm/q1-*.png` contrasts ordinary, implementation, provided, required and failed
build contexts. Earlier real-package evidence remains in `evidence-ebd71eb` and
is not substituted for the final frozen-head run.

## Interfaces and Dependencies


Use existing Zod, React, source broker, TaskBridgeClient and build-view helpers;
no dependency changes. Proposed stable seams are:

    protocol/context.ts: ServiceContextObservationSchema, ContextSubject,
      ContextEvidenceRef, ContextLink, ContextSection
    core/service-topology.ts: adaptServiceTopology(...).serviceContext
    app/renderer/context/attention.ts: reduceContextAttention(state, event)
    app/renderer/context/compose.ts: composeContext(subject, observations)
    app/renderer/context/ContextPane.tsx: ContextPane with typed link callbacks

Q1 owns those new modules plus narrow edits to `protocol/schema.ts`,
`core/provider.ts`, `core/service-topology.ts`, `app/renderer/App.tsx`, and regression
files `tests/context-{contract,provider}.test.ts`, `tests/context-workbench.test.tsx`.
It may extend `tests/provider.test.ts`, `tests/task-workbench.test.tsx`, and
`tools/repository-navigation/acceptance.cjs` for the genuine package journey.
If harness setup needs new inputs, narrowly extend that package's existing
`fixture.mjs`/`launch.mjs`, not global desktop tooling. Existing root globs cover
new app/core/protocol/tests; explicit package source lists must remain accurate.
No core agent/runtime/auth modules, manifests, capture contents, dependencies,
global instructions, or unrelated UI files are part of this ownership.

Revision note (2026-09-07): Q0 initial contract chooses one publication/composition
vertical instead of another asynchronous query layer, to correct misleading
Context with the minimum independently provable product change.

Review revision (2026-09-07): the light native pass required explicit directory
evidence and separate pending-activation versus committed-subject checks. Both
are incorporated above; source receipt-time honesty and strict receiver
validation were also made explicit without expanding implementation scope.
Q1 found `retainDerived` retained the old built graph but would drop the additive
service observation. ROOT approved only copying that original observation in the
existing retention branch and focused recovery regressions (step ownership.md).
The old workbench tests use unconditional legacy widgets as file-opening controls;
these setup gestures must migrate to deliberate navigation without restoring the
misleading fallback. Existing behavioral retention assertions remain required.

Q1 implementation revision (2026-09-07): records the implemented vertical,
ROOT-approved narrow recovery/test migrations, two real review findings and their
regressions, exact frozen local/packaged proof and honest missing review seat.
No new RPC, scanner, timer, worker, dependency, model call or persistent migration
was introduced. This closes the first truthful Context slice, not its parents.
