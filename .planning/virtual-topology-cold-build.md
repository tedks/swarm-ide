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
- [ ] Observe a controlled cold nested build and preserve bounded diagnostics.
- [ ] Implement and test the smallest justified improvement.
- [ ] Run local gates, provider-diverse council and normal PR landing; retain actual hosted status.

## Surprises & Discoveries


Existing hosted evidence reaches the correct owned window and Core ready but
stays Reconciling beyond 90 seconds. An earlier outer build spent 263.913 seconds
compiling protobuf. The real builder is `core/provider.ts`, not
`core/service-topology.ts`; the latter validates/adapts artifacts. The provider
buffers child stderr until exit. Neither duplicate compilation nor deadlock is
yet directly proven for the nested build.

## Decision Log


Decision (2026-09-06, C1): investigate within the existing owned virtual harness;
do not edit the shared provider without exact ownership agreement. Diagnostics
must not read arbitrary user logs, environments or credentials. Do not globally
increase deadlines or borrow an outer Bazel server locked by the running test.

## Outcomes & Retrospective


Investigation in progress. Ditz `virtual-desktop-cold-build-c1` blocks
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
