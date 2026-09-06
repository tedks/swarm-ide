# Make cold topology verification diagnosable and bounded

This ExecPlan is maintained under `.planning/PLANS.md`.

## Purpose / Big Picture


An owned virtual desktop must show the exact current repository's service graph,
not time out silently while building its toolchain. Preserve the existing
working/built distinction, exact input fingerprint checks and responsive hot
loop. This slice diagnoses the repeated hosted 90-second reconciliation timeout
and changes only the measured failing boundary. No agent or watched-app work.

## Progress


- [x] (2026-09-06 04:40Z) Read prior evidence, harness and provider; created the designated C1 worktree and Ditz slice.
- [x] (2026-09-06 04:56Z) Direct hosted evidence: at90s, nested protobuf compilation progressed50→80/197 actions with3 jobs; no observed lock wait/error. Owned failure screenshot retained.
- [x] (2026-09-06 04:57Z) Add bounded progress/owned-process diagnostics, failure screenshot and original exit-code preservation; fix nested concurrency to3. Separate360s cold preparation from30s incremental proof, topology-only420s outer deadline.
- [ ] Verify the cold/hot scenario change and complete local gates.
- [ ] Run local gates, provider-diverse council and normal PR landing; retain actual hosted status.

## Surprises & Discoveries


Existing hosted evidence reaches the correct owned window and Core ready but
stays Reconciling beyond 90 seconds. An earlier outer build spent 263.913 seconds
compiling protobuf. The real builder is `core/provider.ts`, not
`core/service-topology.ts`; the latter validates/adapts artifacts. The provider
buffers child stderr until exit. Neither duplicate compilation nor deadlock is
yet directly proven for the nested build at investigation start.

Run34012409625 now directly shows nested protobuf progress50→80/197 at the90s
deadline, with3 concurrent actions, no observed lock wait/error and the correctly
owned window still yellow. This supports productive cold work, not a deadlock.
Local32-job cold build took20.263s; bounding it to3 produced59.182s. One local
test invalidated its own fingerprint by committing during the build and stayed
yellow; the subsequent frozen-head virtual test passed75.4s. The new exact-exit
test exposed preexisting error logging under errexit replacing124 with1; fixed.
One hosted run failed earlier at occupied55174, separately tracked, not evidence
about topology. Anthropic's initial seat timed out after600s with no review;
recorded unavailable, not green or replaced by a same-provider seat.

## Decision Log


Decision (2026-09-06, C1): investigate within the existing owned virtual harness;
do not edit the shared provider without exact ownership agreement. Diagnostics
must not read arbitrary user logs, environments or credentials. Do not globally
increase deadlines or borrow an outer Bazel server locked by the running test.

Decision (2026-09-06, C1): use360s only for initial topology preparation, based
on the observed264s outer cold compiler build and directly observed productive
nested compilation. Keep30s for a second UI build of the same working world and
publish both timings. Only desktop-smoke gets420s total; other scenarios retain
120s. This is bounded cold-start allowance, not a performance improvement or
hosted acceptance claim. ROOT approved only --jobs=3 in core/provider.ts.

Decision (2026-09-06 05:02Z, C1): native convergence caught a warm-build race:
yellow may disappear before the driver samples it. ROOT approved one additive
App.tsx title suffix exposing the already-validated topology epoch/status.
The hot scenario now requires the next green epoch and unchanged core/document
lifetime; it does not require observing a transient yellow frame. Deterministic
tests include immediate completion, stale green and core/document replacement.
The cold scenario still observes yellow. No state, IPC or lifecycle behavior
was added. Reviewed upstream R2/W2B/P2 merge c52f959 was integrated cleanly for
combined final verification; only C1's delta is new review material.

## Outcomes & Retrospective


Direct cold-compilation diagnosis is complete. The pre-race-fix3d5daf5 passed
19-target build/all5 tests and virtual smoke67.1s; owned HMR measured16ms with
cleanup_complete=1. These are not final-head evidence: final combined gates and
fix convergence remain in progress. Ditz `virtual-desktop-cold-build-c1` blocks
`virtual-desktop-ci-timeout`; the parent remains open until actual resolution.

## Context and Orientation


Work only in `/home/tedks/Projects/swarm-ide/virtual-topology-cold-build`, branch
`fix/virtual-topology-cold-build`, starting at reviewed merge a4ae558.
`tools/virtual-desktop-run.sh` owns Xvfb, Openbox, app and scenario lifetimes.
`tools/desktop-topology-scenario.sh` invokes the build palette command, requires
yellow then green and opens actual source files. `core/provider.ts` builds the
fixed Bazel target and validates the emitted artifact against current inputs.
`tools/virtual-desktop-supervisor.test.sh` checks harness failures with doubles.
No physical DISPLAY or master app is a test resource.

## Plan of Work


First capture cold build command, elapsed time, cache identity and productive
compiler versus lock observations. Add bounded owned diagnostics and failure
screenshot before teardown in the harness, with regressions in its existing
test. If evidence supports a cold-only budget or cache-scope correction, make
that narrow change and retain a separate fast incremental assertion. Otherwise
land useful diagnostics and name the precise unresolved next check.

## Concrete Steps


From the designated worktree, materialize with
`nix develop --command pnpm install --frozen-lockfile`. Build/test only through
Bazel, with `--jobs=3`. Run focused `//tools:virtual-desktop-supervisor-test`,
then `bazel build //...` and uncached `bazel test //...`. Prefix every full
suite or GUI command with `flock /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock`.
The virtual harness chooses an owned display and port 55174; supply a hostile
ambient DISPLAY to prove isolation. Keep first-run and incremental timings.

## Validation and Acceptance


Failure diagnostics must remain bounded, refuse unowned windows and not replace
the scenario's nonzero result. Green must still come only from the exact build
artifact and fingerprint. Verify cleanup_complete=1 on success and intentional
failure. Review substantive changes with native OpenAI and foreign Anthropic
and Google seats, converge fixes, and record unavailable seats honestly.
Hosted acceptance is a separate observed result, never inferred from local green.

## Idempotence and Recovery


Keep all temporary roots owned and bounded; do not erase shared caches, kill
by process name or change master. Retain the clean pushed topic and archived
evidence. A failed run is safe to repeat after its own cleanup is verified.

## Artifacts and Notes


Publish concise evidence under master/artifacts/overnight-wave/ci-cold/handoff.md
and the current seam in /tmp/swarm-ide-ci-cold.l8HJKe/seam.md. Detailed logs stay
out of ROOT's context. Normal merge PR metadata will identify its future merge.

## Interfaces and Dependencies


No new dependencies, shared protocol or agent interfaces. Harness behavior is
consumed by later virtual scenarios, so any default changes must be explicit in
the seam and preserve exact-owned-window selection and teardown.

Revision (2026-09-06): initial bounded diagnostic plan; preserves uncertainty
about the cold-compilation hypothesis before making a timing change.

Revision (2026-09-06 04:57Z): record direct hosted compiler evidence, distinguish
the separate occupied-port failure and local fingerprint-invalidated trial,
then calibrate only initial preparation while adding a real incremental check.

Revision (2026-09-06 05:02Z): replace timing-sensitive hot yellow observation
with persistent fresh-epoch evidence scoped to core/document lifetime, record
ROOT's narrow title approval and reviewed upstream integration.
