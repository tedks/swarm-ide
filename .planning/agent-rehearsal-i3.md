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
- [ ] Implement fixed test-only responder/service, main/worker and compiled launch target.
- [ ] Prove ordinary UI operation and reload/close behavior on owned virtual X11.
- [ ] Complete local gates, provider-diverse review, Ditz, normal merge and reviewed integration.

## Surprises & Discoveries


I1's fixture is deliberately externally settled and automatically exits. Keeping
that launcher open cannot provide a usable manual rehearsal. The production
worker already accepts a privileged createAgents dependency, so this step can
reuse its exact runtime without new public commands or production selectors.

## Decision Log


Decision (2026-09-06): use separate fixed compiled main and worker entries,
unchanged production renderer/preload and an in-process paced responder.
This gives useful manual interaction without promoting unproved live policy.
The main adds a static text-only label after every document load; it does not
mutate app state or expose execution tools to the renderer. The launch command
requires explicit desktop and workspace arguments and creates a fresh private
profile whose path is printed and whose human history is retained on close.

## Outcomes & Retrospective


Implementation and acceptance are underway. No model readiness, hosted success,
watched-master adoption or completed user-facing delivery is claimed yet.

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
