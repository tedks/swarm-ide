# Explore a human-paced agent rehearsal in the real cockpit

This living ExecPlan follows `.planning/PLANS.md`. Keep Progress, Surprises &
Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture


A developer can deliberately open a separate rehearsal window and explore real
Prepare, Launch, Steer, Stop, history, source and graph controls at human pace.
Only the responder is synthetic: the typed bridge, current on-disk context,
durable run service and private history store are the actual implementations.
The normal application remains policy-unavailable. No model, credentials or
external agent process is involved, and the rehearsal never opens a physical
desktop without an explicit human launch choice.

## Progress


- [x] (2026-09-06) Read the reviewed I2 base and ownership; create designated worktree at 6e054e5.
- [x] (2026-09-06) State bounded responder, no replay, honest cleanup and private history assumptions.
- [x] (2026-09-06 07:10Z) Implement fixed test-only responder/service, main/worker and compiled launch target; PR29 published at2f6c348.
- [x] (2026-09-06) Real context/service tests and packaging/argument boundary quality passed; initial eight new service tests included566 tests across50 files.
- [x] (2026-09-06) Integrate ROOT-cleared P4 normal3c50d7f without production changes.
- [x] (2026-09-06 07:24Z) Actual ordinary-UI four-run proof passed26.058s on owned virtual X11, cleanup_complete=1; final disk/zero-timer validator passed after ordinary active close.
- [x] (2026-09-06) Native OpenAI and foreign Google convergence CLEAN; Anthropic actual session-limit unavailable, not approval. Final evidence-label nit independently verified at657c4d6.
- [x] (2026-09-06 07:43Z) ROOT-cleared T0/W4 aggregatea218277 included atb67d1ec. Final executable4bba518 passed full29-target build, all10 uncached local targets and716 tests across57 files; actual rehearsal27.6s target/cleanup1.
- [x] (2026-09-06 07:51Z) Complete all relevant local gates and provider-diverse review: native/Google CLEAN, Anthropic full review600s timeout without verdict after earlier actual session limits. Final normal PR/Ditz/integration transaction is recorded by PR29 and the executive handoff, not inferred from local readiness.

## Surprises & Discoveries


I1's fixture is deliberately externally settled and automatically exits. Keeping
that launcher open cannot provide a usable manual rehearsal. The production
worker already accepts a privileged createAgents dependency, so this step can
reuse its exact runtime without new public commands or production selectors.

The first actual virtual run showed why pre-ready Electron configuration must
remain synchronous: awaiting filesystem work before importing the fixed main
allowed ready to fire first. Bootstrap now synchronously validates its small
fixed launch envelope before importing main. Later actual GUI proof passed
navigation/steering/Stop/history and dirty-buffer protection, but DOM click()
did not establish browser sticky activation after reload. Ordinary controls now
use actual trusted keyboard activation and wait for click delivery before another UI
action. These are test-bootstrap/input corrections, not product guard changes.

Native council identified stale success-file reuse and unasserted shutdown
diagnostics. Each proof receives a fresh evidence subdirectory, complete JSON is
published by rename, and a read-only after-exit validator checks all four actual
stored runs and disposed responder timers. Old success/failure and premature
shutdown evidence receive explicit negative tests.

The first full-suite invocation additionally exposed an artifact lookup hazard:
the preceding topology build temporarily repoints workspace/bazel-bin. Resolve
the fixed declared artifact through Bazel runfiles instead, with a missing-path
regression. The next invocation exposed native window activation restoring an
old DOM focus target; settle native focus before focusing the exact button and
attest document/element focus before one gesture. Never retry uncertain action
delivery. The actual Bazel rehearsal target and then the entire combined suite
passed with those fixes, not just the earlier standalone launcher.

## Decision Log


Decision (2026-09-06): use separate fixed compiled main and worker entries,
unchanged production renderer/preload and an in-process paced responder.
This gives useful manual interaction without promoting unproved live policy.
The main adds a static text-only label after every document load; it does not
mutate app state or expose execution tools to the renderer. The launch command
requires explicit desktop and workspace arguments and creates a fresh private
profile whose path is printed and whose human history is retained on close.

Decision (2026-09-06): both human and virtual modes load the same compiled
file renderer. The old owned-X11 harness requires a loopback readiness port;
virtual mode serves the same artifact only for that established ownership
protocol. Human mode has no listener. The test-only shutdown wrapper delays
final app exit for the existing private core shutdown handshake; production
shutdown code and native window behavior are not changed.

## Outcomes & Retrospective


The compiled human target now remains open between ordinary actions without
I1's private settlement driver. Actual virtual acceptance exercised fixed-focus
disk preparation, literal multibyte/HTML-shaped output, accepted and delayed-race
steering, Stop versus terminal/cleanup, paged history, source/graph retention,
unsaved-buffer veto, clean reload with zero replay, and closing during active
output. After core exit a read-only validator found all four actual retained
runs, including conservative unknown/delivery-unknown state, four disposals and
zero pending timers/operations. The passing journey took26.058 seconds; total
owned harness time27.002 seconds with cleanup_complete=1. Both modes use the
same compiled file renderer. Human desktop access remains deliberately uninvoked.

Final executable4bba518 includes only ROOT-cleared T0/W4/P4/I2 peer heads and
passes the full29-target local build, all10 uncached Bazel targets and716 tests
across57 files. The repeated actual rehearsal target passed27.6 seconds; the
older I1 journey5.3 seconds and I2 external process proof3.6 seconds also passed.
The latest runfiles and native-focus fix deltas each converged CLEAN in native
OpenAI and foreign Google; Anthropic's earlier actual session limit was missing,
not approval. A full own-PR Anthropic review was requested after its reset and
it timed out after600 seconds without a verdict, so that seat remains missing,
not approval. The exact disposition is in the PR review record. Source/code contracts
match the reviewed aggregate; accounting-only updates are checked inline.
Normal PR merge and sole-owned integration landing are recorded in the PR and
sanitized executive handoff. No model readiness, hosted success or watched-master
adoption is implied. User remote-CI waiver applies only after these actual local
gates; existing hosted private-namespace/policy-prerequisite debt is not green.

## Context and Orientation


`tests/support/agent-journey-service.ts` demonstrates the existing disk-context
and durable-store composition. `core/worker-runtime.ts` accepts createAgents;
`app/electron/main.ts` supplies the registered process working directory and
private store path. `tools/virtual-desktop-run.sh` owns disposable Xvfb windows
and process cleanup. I3 owns new rehearsal files and additive Bazel declarations;
T0 owns task-only protocol/runtime edits, W4 owns GraphPane and P4 owns policy.
No peer's uncommitted work may be consumed. ROOT's clearance file is
`/tmp/swarm-ide-agent-rehearsal-i3.dLrYMQ/root-integration.md`.

## Plan of Work


First add `tests/support/agent-rehearsal-service.ts` with the real context/store
and a bounded timer-driven adapter. Its start/steer/interrupt/dispose operations
produce adapter evidence; only the real service produces durable acceptance and
state. Add focused tests using temporary registered Git worlds and stores.

Then add separate rehearsal main/worker entries and `tools/agent-rehearsal/`
build/launch helpers. Compile the production renderer without its old demo flag.
Require `--interactive-desktop --workspace <absolute path>` for human access;
the virtual acceptance path verifies owned X11 and never trusts inherited DISPLAY.
Show explicit workspace/profile and literal-data limitations. Preserve existing
reload vetoes rather than forcing dirty buffers to unload.

Finally add an ordinary-UI virtual scenario, record sanitized lifecycle evidence,
and verify production bundle exclusion. Keep the existing I1 and I2 proofs
unchanged. Review and normally merge only after all relevant local gates pass.

## Concrete Steps


Work in `/home/tedks/Projects/swarm-ide/agent-rehearsal` on feature/agent-rehearsal.
Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`.
Use `nix develop --command bazel test //tools:quality --jobs=3 --test_output=errors`
for focused changes and `nix develop --command bazel build //... --jobs=3` for the
complete artifact gate. Run GUI and full tests with
`flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` and port55174.
Exact human and acceptance commands will be recorded in docs/agent-rehearsal.md.

## Validation and Acceptance


The new tests must prove literal multibyte data, bounded output/timers, pending
versus accepted steering, Stop acknowledgment distinct from terminal/cleanup,
early disposal and zero replay on reconnection. The actual virtual window must
exercise source and both graph cameras, prepare/launch/steer/Stop, paged history,
reload retaining the visible label/history and dirty-buffer veto, then close
during active output with owned cleanup complete. No private settlement driver
may make the responder progress. Test desktop argument gating without opening
the physical desktop. Read the built production metadata to prove exclusion.

## Idempotence and Recovery


Every human launch receives a fresh isolated profile and prints its location;
normal close retains user text/history. Only synthetic automated test storage
is auto-cleaned. A renderer reconnect cannot launch or steer again. Crash recovery
retains the service's unknown evidence and does not reset authority. Never kill
by port/name, touch watched55173/unrelated5173 or delete a peer's lock/resources.

## Artifacts and Notes


Sanitized handoff/evidence goes under master/artifacts/overnight-wave/agent-rehearsal-i3.
Ditz slice is agent-run-human-rehearsal-i3; the real-agent/policy parents stay open.
The child remains open for ROOT retirement after its marker-qualified recap.

## Interfaces and Dependencies


Use only existing Electron, Node, React, Zod, esbuild and Vite dependencies.
`createRehearsalAgentService` has the production createAgents signature, returning
request/shutdown methods. Only normalized AdapterEvent and actual agent schemas
cross the boundary. No production core, renderer, protocol, package or flake edit
is authorized. I3 solely maintains the existing integration worktree and shared
first-agent ExecPlan, but integrates only ROOT-cleared reviewed heads.

Revision note (2026-09-06): initial bounded human-rehearsal plan, distinct from
I1 automated controls and I2 external-process proof.
