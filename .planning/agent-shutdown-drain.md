# Accepted-event shutdown drain

## Purpose and intent

Closing the cockpit must not discard valid output that its local agent service
already accepted, or leave a known producer emitting while shutdown waits on
storage. This repair changes ordering in the existing service, not provider
permissions or a promise that arbitrary callbacks are durable acknowledgments.
The historical Q4 GUI failure remains unlocalized; deterministic counterexamples
independently establish this defect class on the exact pre-Q4 base.

## Progress

- [x] (2026-09-07 06:55Z) Verified isolated branch/base 1820e39, parent 650432b,
  original test blob 6537abcd and service blob bee40ff; read recorded RED proof.
- [x] (2026-09-07 07:05Z) Fresh baseline reproduced exactly 2 RED/1239 PASS;
  initial repair and 16 additional lifecycle cases pass complete quality.
- [ ] Prove deterministic adversarial GREEN, full local build/suites, council fixpoint.
- [ ] Normal standalone PR merge, Ditz synchronization, cleanup and ROOT handoff.

## Context and orientation

`core/agents/service.ts` accepts adapter events into a bounded promise queue. That
queue serializes durable state changes through `RunStore`. Adapter handles own
process cleanup, whose completion queues another durable change. Awaiting cleanup
inside the queue therefore deadlocks. `tests/agent-shutdown-order.test.ts` uses a
real file store and explicit promise barriers, with controlled timers rather than
timing luck. These are the only executable files owned by this step.

Assumptions: accepted events are validated by the existing lifecycle rules; the
store eventually resolves operations; adapters may reject, throw synchronously,
never resolve setup, or emit hostile callbacks after disposal. Known cleanup has
an existing two-second bound; unresolved setup is not awaited indefinitely.
Callbacks after intake closure remain rejected. No real model or policy proof
is supplied by these synthetic adapters.

## Plan of work and milestones

First preserve the original red baseline and reproduce its two mismatches. Remove
the redundant closed check when processing already accepted events, retain intake
closure, enqueue shutdown uncertainty behind accepted work, and start disposal
without awaiting that storage queue. Ensure cleanup persistence follows queued
terminal evidence and await cleanup registered while the queue drains. Guard
actual interrupt/steer dispatch against shutdown and cleanup, and clear timers
again after drain. Do not introduce a new lifecycle framework.

Then adapt only obsolete scheduling assertions in the diagnostic test, retaining
queued output and completed append equality. Model the rehearsal producer's
synchronous disposing guard separately from hostile callbacks. Add finite cases
for terminal/exit ordering, cancellation, pending steering, late setup, failed or
timed-out cleanup, storage failures and final timer disposal. A meaningful red to
green transition, not a verifier relaxation, is the acceptance criterion.

Finally freeze executable inputs, run the complete local suite including the
unchanged owned-virtual rehearsal, review substantive changes with native OpenAI
and foreign Google/Anthropic seats to fixpoint, and normal-merge a separate repair
PR. An unavailable foreign seat is reported, never replaced. ROOT reviews the
result before Q4 may consume it. Hosted CI is ignored by explicit user authority.

## Concrete steps and validation

All commands run from `/home/tedks/Projects/swarm-ide/agent-shutdown-drain`.
Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`.
Run `nix develop --command bazel test --jobs=3 --nocache_test_results //tools:quality`
for baseline and iteration. Final build is `nix develop --command bazel build
--jobs=3 //...`. Final fresh tests are `flock --close
/tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test
--jobs=3 --nocache_test_results //...`.

Expected baseline: queued item emitted 2/retained 1 and pre-dispose emission
emitted 2/retained 1 fail equality; entered append and hostile post-close controls
pass. Expected repair: accepted output retains its prefix and counts; producer
disposal starts synchronously, terminal evidence survives, cleanup is bounded,
uncertainty remains honest and no control/timer survives shutdown. A fresh final
GUI failure stops at an explicit diagnostic boundary; do not retry until green.

## Idempotence and recovery

Retain audit PR45 and its red branch/worktree untouched. No integration lease or
master/app adoption exists. Human canvas55175 buffers and the physical desktop
are prohibited. Tests own only disposable virtual X11 and private profiles.
Create/start Ditz `agent-shutdown-drain-r3` idempotently; close only after merge,
sync metadata and push. Keep historical diagnostic issues truthful and open.
Preserve branches, session, stashes and evidence for ROOT intake.

## Interfaces and dependencies

No API, protocol, adapter, store, dependency or verifier changes. Public
`shutdown(): Promise<void>` remains idempotent; reads after shutdown remain
available. Source events keep existing limits and terminal validation. New
evidence lives under `/tmp/swarm-ide-shutdown-drain-r3.NvxkqK`.

## Surprises & discoveries

The same original test and service blobs fail on pre-Q4 protocol5 as on Q4's
protocol6. That proves an existing defect class, not the lost original GUI
predicate. Adapter `emit(): void` never promised a persistence acknowledgment.

## Decision log

2026-09-07, R3: isolate this repair from Q4. Ordering and lifecycle safety can be
reviewed independently while Q4 diagnoses its separate Context observation.

## Outcomes & retrospective

Initial repair passes quality (1257 tests). Frozen62eefb4 build34 passed and
12/13 suites passed, including unchanged virtual rehearsal28.7s. The quality
suite reproduced the separately tracked Context opening-notice failure at
tests/context-workbench.test.tsx:100; 1256 other tests passed. ROOT notified;
aggregate landing remains held, no retry/waiver or unowned Context edit.

Native council found two repair-introduced races. Three new assertions reproduce
them RED on62eefb4 (1257 others pass): terminal-/grace-first reentrant cleanup
invokes disposal twice, and a resolved handle extending a post-cutoff read queue
escapes shutdown's wait. Registering cleanup before adapter entry and counting
resolved handles awaiting registration address these without awaiting unresolved
setup or arbitrary later read traffic. Convergence and repaired-tree gates remain.

Revision note: initial bounded plan records assumptions, exact ownership and
the distinction between reproducible defect class and unlocalized history.
Progress update: reserved shutdown barrier, preexisting cleanup deferral and
reentrant idempotence preserve ordering without awaiting provider setup.
Review update: retain original frozen failure and council RED receipts. Count
correction is documentary; no assertions or verifiers weakened.
