# Prepare authoritative pinned task context and drain its owned readers

This ExecPlan is maintained under `.planning/PLANS.md`. It implements only D4
of the accepted `docs/repo-task-draft.md` contract. D3 is ROOT-verified at normal
PR48 `6e11ce42c004ca5fb37300d87bcbaf11807740a8`; D5 owns the independent UI.

## Purpose / Big Picture


A deliberate Prepare can include the exact title and description of one Ditz
task alongside a fixed, supported disk source. The privileged core verifies
the full Git revision and issue identity rather than trusting preview text.
Changing any metadata commit invalidates preparation, including an unrelated
task change. Production model execution remains unavailable. Tests demonstrate
real Git/YAML preparation and separately label deterministic responder behavior.

## Progress


- [x] (2026-09-07) Read shared ROOT authority, accepted full contract/plan, D3 receipts and required workflow skills; confirmed assigned clean worktree and base.
- [x] (2026-09-07 10:37Z) Baseline23 RED/1345 PASS in four owned test files; unrelated tests passed. Tests-first262b8d8 pushed, draft PR50 opened.
- [x] (2026-09-07 10:48Z) Concrete registered Git/YAML resolver, canonical materialization, disk/ref bracketing and lifecycle composition implemented; corrected quality1388/100 PASS. Exact initial implementation had TypeScript-only definite-assignment/test-this errors, fixed before behavioral execution.
- [x] (2026-09-07 10:48Z) Task-bearing Prepare40s branch passes deterministic transport checks; ordinary5s/tasks12s/write behavior unchanged. Separate synthetic late-launch receipt evidence retained.
- [x] (2026-09-07) Pushed4e19fcf adds no replacement scan while prior owned metadata settles, plus actual worker-cancellation proof. Three-provider council active; extended real late-admission transport proof and final frozen full gates pending.
- [ ] Run frozen local full gates and provider-aware council to fixpoint; record exact attribution.
- [ ] Push reviewed increment and normally merge only on ROOT-cleared base; close bounded Ditz issue after actual landing and hand off to ROOT.

## Surprises & Discoveries


The existing quality target intentionally runs all unit tests, type checking
and both bundles; no targeted Vitest entry point is supported. Tests will be
batched to avoid duplicating full executions. D3 deliberately rejects even an
injected task resolver; replacing that behavior requires positive authority
checks and preserved absent-resolver failures, not deleting a negative test.

Synchronous abort callbacks can reenter disposal or service shutdown. Shared
promises must be installed before those callbacks are invoked. Both owner drains
must start immediately even if one throws synchronously; rejection does not
permit early storage close. Tests cover both owners and both compositions.

An observation timeout is not proof its trusted resolver has settled. Context
now refuses new preparation while metadata remains owned, preventing a queue
of new scans behind a cancelled but not-yet-reaped operation. Tests use held
callbacks to distinguish bounded response from actual owned settlement.

## Decision Log


Decision (2026-09-07, D4): keep one reader implementation and one owned YAML
worker. A full bounded metadata scan is acceptable on explicit preparation
and revalidation only; no cache mutation, timer, task write or file-ref read.

Decision (2026-09-07, D4): use internal disjoint helpers for the exact supervisor
timeout and service composition hunks. This remains one D4 worktree/PR; helpers
cannot commit, adopt peers, expand scope or create departments.

## Outcomes & Retrospective


The first implementation quality execution passed1388 tests/100 files, type
checks and both bundles. It includes actual CLI-authored pinned production
Prepare while launch remains unavailable, and separately deterministic responder
admission/history with immutable task data. Extra settling/worker/transport tests
are not attributed to that earlier run. Final full gates and council remain
in progress; no merge, attachment UI, packaged attachment or model is claimed.
D6 must join reviewed D4/D5 and owns parent issue closure.

## Context and Orientation


`core/agents/context.ts` prepares one immutable V2 context, brackets disk,
mapping and instruction observations and revalidates before admission. Its
optional `AgentTaskResolver` takes a strict full task reference, AbortSignal
and absolute deadline. `core/tasks/git-reader.ts` owns fixed local Git commands;
`core/tasks/metadata.ts` owns worker parsing and existing size limits. The new
`core/tasks/draft-context.ts` composes them without using the visible task cache.
`protocol/agent-task.ts` supplies pure canonical formatting and byte accounting;
Node crypto in the core supplies SHA-256. Shared protocols and storage are frozen.

`core/agents/production.ts` constructs the disabled adapter and disk context.
The test-only matching composition is `tests/support/agent-rehearsal-service.ts`.
Both must close service intake, abort context operations immediately, await both
drains and only then close the store. `app/electron/core-supervisor.ts` owns
the response deadline; only attached Prepare changes from five to forty seconds.
Launch remains five-second unknown outcome, with receipt reads and no replay.

## Plan of Work


First record positive pinned-context and cancellation regressions against the
D3 seam. Implement a root/world/repository-bound resolver that resolves the
fixed local metadata ref, checks the claimed commit, scans and parses the exact
bounded revision, matches full ID and blob and rechecks the ref. All metadata
failures map to fixed STALE_CONTEXT diagnostics; composition overflow maps to
OUTPUT_LIMIT. Missing resolver remains UNSUPPORTED_CONTROL.

Materialize exact decoded strings as canonical untrusted data with SHA-256.
Require one actual disk attachment, never a reference-only service/directory.
Start task resolution before source observations and perform a final ref check
after the last source/config/fingerprint/mapping observation. Revalidation
repeats full resolution and compares exact materialization. Keep one thirty-
second total observation budget and five-minute expiry from Prepare entry.

Track metadata operations before invoking them so immediate disposal cannot
miss late starts. Dispose closes intake and invalidates draft synchronously,
aborts operations and awaits actual settlement. Trusted source callbacks and
kernel I/O are not claimed cancellable. Test held source/metadata, expiry,
clock reversal, late results, repeated disposal and production shutdown order.

Then run frozen full gates and council on the exact code, correct findings and
review fix deltas to CLEAN. No source edits during frozen testing. A failing
aggregate requires diagnosis and a genuine correction, not unexplained retries.

## Concrete Steps


Work only in `/home/tedks/Projects/swarm-ide/task-draft-core` on
`feature/task-draft-core`. Use:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //:quality --jobs=3 --nocache_test_results
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results

Create/start `repo-task-context-core-d4` with Ditz CLI and comment the open
`repo-task-draft-provenance` parent. Commit granularly, create an early draft
PR and push. Normal merge is authorized only while remote master is the exact
approved base; a changed remote base requires ROOT review, not automatic uptake.

## Validation and Acceptance


Real disposable Git repositories and CLI-authored supported Ditz content must
produce the exact pin, title, description, canonical bytes and hash. Reject
wrong root/world/repository/ID/blob, unrelated revision movement, missing or
malformed metadata, limits, unsupported source focus and materialization overflow.
Snapshot refs/source bytes before and after to prove no writes or dereferences.
Held-operation tests prove metadata/source bracketing and actual disposal
settlement. Production Prepare succeeds but launch stays policy-unavailable.
Existing packaged browsing and ordinary-close rehearsal remain unchanged proof,
not new attachment UI evidence. All automated GUI uses owned virtual X11 only,
serialized by the existing lock, with no renderer exceptions or cleanup gaps.

## Idempotence and Recovery


No user task metadata is mutated by tests; only explicitly owned temporary
repositories may be created and removed. Preserve raw failed runs, branch,
worktree, session and step evidence. Never update master/shared integration,
restart the app, inspect human55175 buffers, read credentials or enable a model.
An absent receipt is not rejection; do not replay launch. Store2 cannot be
reopened by older binaries. Close only the bounded Ditz issue after actual merge.

## Artifacts and Notes


Raw checks, review, seam and final receipt live in
`/tmp/swarm-ide-task-consumers.jbWXBA/core`. ROOT intakes the final marker-qualified
recap before peer consumption. Precise historical RED/GREEN attribution belongs
here as it becomes available, not inferred from later passing tests.

## Interfaces and Dependencies


New `createAgentTaskResolver({root,worldId,repositoryId})` returns the existing
`AgentTaskResolver` interface synchronously and starts no work until called.
Its registered identities never come from the pin. Reuse `TaskGitReader`,
`parseTaskMetadata`, `formatRepositoryTask`, `agentTaskBytes` and
`formatAgentContextV2`; no new dependency, protocol or public command is needed.

Revision note: initial bounded D4 execution plan and assumptions recorded before implementation.
