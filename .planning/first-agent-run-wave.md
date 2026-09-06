# Put one real, steerable agent run into the cockpit

This ExecPlan is a living document maintained under `.planning/PLANS.md`.
Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and
`Outcomes & Retrospective` current. This file is a plan, not evidence that the
implementation exists. The checked-in `docs/first-agent-run-contract.md` is the
normative field/state reference incorporated into this plan; essential behavior
and the steps to implement it are also explained below.

## Purpose / Big Picture


A developer will open FraudCheck's source, ask a real agent to explain its
interface, watch provider-reported work, and send a new instruction to that same
running turn without losing source or graph position. They can stop the run and
inspect its result and exact submitted context later. This first demonstration
is read-only analysis, not source implementation. The cockpit grows one honest
application of intelligence before queues, swarm coordination or write authority.

## Progress


- [x] (2026-09-06) Design: read existing cockpit, source bridge, core supervisor and prior topology/reload plans; verify local CLI schema capabilities without running a model.
- [x] (2026-09-06) Design: choose the adapter, freeze the bridge/lifecycle/context contract, and define three isolated departments.
- [x] (2026-09-06) ROOT accepted PR #8 and dispatched only R0 in its designated worktree.
- [ ] R0: publish validated contracts, typed unavailable behavior and module interfaces; merge the small base PR.
- [x] (2026-09-06) R0: strict six-command schemas, interface-only adapter/context/store modules and production unavailable dispatch; initial and contract/bridge quality passes succeeded.
- [x] (2026-09-06) R0: first full build and five uncached Bazel tests passed, including owned virtual desktop smoke (31.6 seconds); 151 focused tests passed at a6d8f4f.
- [ ] R0: final local build/test, council fixpoint, normal merge and executive handoff without adopting watched master.
- [ ] R1 and E1: establish installed-adapter conformance and bounded launch context/profile preflight; W1: show fixture-driven cockpit run surface in parallel.
- [ ] R2: durable lifecycle, process ownership, cancellation and recovery; E2: adversarial fixtures and virtual scenario; W2: wire live state, steering and uncertainty.
- [ ] R3/W3/E3: integrate, demonstrate one real read-only run, finish relevant local gates/review and normal-merge the feature PRs.
- [ ] ROOT deliberately adopts the integrated build if native-main changes require restart; do not silently replace the watched app.

## Surprises & Discoveries


The installed CLI is 0.146.0 while ROOT uses a complete pinned 0.153.4 bundle.
Both locally generated stable schemas support app-server steering and interrupt;
0.146.0 lacks the newer restricted-read-root fields. Consequently read-only is
not a promise of host-file confidentiality. The original design fork could not
execute a shell command because its copied CLI lacked `codex-code-mode-host`;
ROOT restored the matching companion and actual command execution succeeded.
This is separately tracked, not repaired by product code in this wave.

The current `CoreSupervisor` treats only `file.write` as an uncertain mutation
and tells other interrupted requests to retry. Agent launch/steer/cancel must
extend that classification. Existing `Job` requires percentage and resource
numbers; agent observations must not fill them with invented zeros.

R0 implementation assumptions: the six public agent commands cannot execute a
provider yet. Command acceptance, terminal turn evidence and process cleanup
are separate facts. Agent payloads reject unknown fields and measure UTF-8
bytes. Repository-relative links carry no filesystem authority; the local core
alone selects a registered root. Late or lost mutation replies must never
invite replay. Existing workspace and file projections must remain unchanged.

## Decision Log


Decision (2026-09-06, design department): use one Codex app-server over local
stdio, a fresh thread and one turn, with live steering and interrupt. Local
schemas substantiate those controls; a PTY or second provider adds no necessary
first-demo behavior. Exact executable configuration is operator-local.

Decision (2026-09-06, design department): start with trusted-local read-only
analysis, explicit launch confirmation and a verified limited capability
profile. This is a reversible first slice; write-enabled agents require a later
authority/worktree gate. Do not confuse shell read-only with restrictions on
MCP, plugins, hooks or all readable host files.

Decision (2026-09-06, design department): keep the run projection separate from
workspace graph snapshots while sharing the existing validated IPC and core
generation. Runtime owns shared seams; workbench and context/evidence own
separate modules and tests. One small schema base precedes actual parallel work.

Decision (2026-09-06, design department): no provider resume after core death.
Persist known history, stop the owned process tree and expose uncertain outcomes.
Renderer reconnect to the same core is supported. Never replay mutations.

Decision (2026-09-06, R0): share protocol version and focus primitives in a small
common module to avoid a schema/agent import cycle. Keep existing workspace
focus behavior unchanged and use a strict, bounded focus at the agent boundary.
Production can report explicit unavailable capabilities through agent.snapshot;
all other agent methods return ADAPTER_UNAVAILABLE. No fake run is created.

Decision (2026-09-06, R0): concrete named results use kind prepare/launch/steer/
cancel/snapshot/read. The context and transcript bounds count serialized UTF-8
bytes (including metadata), conservatively below their ceiling. Instruction
receipts are capped at 128 per run; future admission/steering must report limits
rather than evicting them silently. This fills an unspecified collection bound.
Provider observations live separately on Run, never rewrite submitted context.
The dispatch-prevented outcome describes cancellation before any process exists;
it requires not-started/not-needed process/cleanup evidence. It is not a claimed
provider interruption. These concretize the design's stated pre-dispatch stop.

Decision (2026-09-06, R0): agent mutation uncertainty classification is wired now
through supervisor/preload, because exposing new methods with the old automatic
read-retry wording would be unsafe. Durable recovery remains R2's work. One
renderer line ignores agent events in the workspace reducer; no product UI is
added. Dedicated tests/agent-bridge.test.ts exercises the real worker dispatcher
and preload with explicit injected workspace/Electron test doubles; production
has no fixture selection mechanism.

Decision (2026-09-06, R0 council fixes): bound timestamps to 32 characters, bind
prepared results back to all request-derived fields, reject contradictory
cleanup evidence and strictly validate agent failures including known transport
codes. Preserve legacy workspace error text but reject extra error fields before
envelope parsing can hide them. IPC/validation failures after a mutation dispatch
return unknown rather than a rejected promise that callers might treat as safe
retry. No persistence, process owner or provider work is introduced.

## Outcomes & Retrospective


Design only so far. No agent runtime, UI, process-control fixture or credentialed
run has been built/tested by this gate. Schema generation is evidence of API
shapes, not a claim of authentication, permission enforcement or successful
model execution. Keep that distinction in the implementation recaps.

## Context and Orientation


The repository is a bare Git/worktree layout. Master is
`/home/tedks/Projects/swarm-ide/master`; the watched app uses port 55173 and an
unrelated project owns 5173. Neither belongs to this build wave's test harness.
Linux, Nix, Bazel, TypeScript, React, Zod, Electron and Ditz are already selected.
`protocol/schema.ts` validates workspace/file requests and events at runtime.
`core/worker.ts` owns the privileged workspace and process boundary.
`app/electron/core-supervisor.ts` replaces a failed utility process without
replacing the native window. `app/lifecycle.ts` wraps IPC with a monotonically
increasing core generation; `app/electron/preload.ts` rejects old generations.
`app/renderer/App.tsx` keeps React Flow graphs beside CodeMirror and instruments.
`tools/virtual-desktop-run.sh` owns disposable Xvfb/Openbox desktops.

A run is one admitted user task, not an entire permanent agent or a graph node.
Its UUID survives reconnect. A provider thread is the harness conversation; a
turn is one invocation in it. The launch fingerprint identifies the observed
working source when dispatched, not an immutable filesystem snapshot. The
generation identifies a live core instance. An unknown outcome means execution
may have happened; it is neither success nor safe permission to repeat it.

## Plan of Work


### R0: freeze the shared code seam (runtime, 30–45 minutes)


Create `protocol/agents.ts`, strict Zod schemas for the six requests
`agent.prepare`, `agent.launch`, `agent.steer`, `agent.cancel`, `agent.snapshot`,
`agent.read`, discriminated results, `Run`, `AgentSnapshot` and `AgentEvent`.
Use the contract's exact payload table: prepare takes world/focus/task/model/
effort/links; launch takes runId/contextHash; steer takes runId/expectedTurnId/
text; cancel takes runId; read takes runId/afterRecord. IDs, UTF-8 byte bounds,
state refinements and unknown fields must be validated. Bump protocol to 3.
Wire an explicit unavailable response/event seam end to end with no process
launch, using `CoreResponse.agent` and the existing lifecycle envelope. Add
`tests/agent-contracts.test.ts`. Preserve existing workspace/file tests.

Define provider-neutral `AgentAdapter` in `core/agents/adapter.ts` with
`probe(): Promise<AdapterCapabilities>`,
`start(context: PreparedAgentContext, emit: (event: AdapterEvent) => void): Promise<AgentHandle>`;
the handle exposes `steer(expectedTurnId, text)`, `interrupt()` and
`dispose(): Promise<CleanupEvidence>`. Adapter events distinguish start/turn/item/
terminal/process-exit, not arbitrary provider JSON. Promise resolution is not
turn completion. Define `AgentContextProvider` in
`core/agents/context-provider.ts` with `prepare(input)` and
`revalidate(context)`; both return typed errors, never caller-controlled paths.
Declare a `RunStore` interface in `core/agents/store.ts` for admission, atomic
snapshot update and bounded transcript append/read. Runtime initially supplies
unavailable context and fixture adapter implementations only through explicit
test injection. Normal production must never auto-fallback to fake runs.

Publish/normal-merge this small base PR before parallel builders touch shared
contracts. Passing `//tools:quality` and schema/bridge tests proves the seam;
an unavailable harness still leaves all existing cockpit behavior working.

### R1, W1, E1: parallel first visible slices (30–60 minutes each)


Runtime R1 builds `core/agents/codex-app-server.ts`, a bounded JSONL parser and
versioned adapter conformance tests. Spawn a fixed operator-resolved executable
with `app-server` and stdio, initialize/initialized once, then use thread/start,
turn/start, turn/steer and turn/interrupt only. Provider input is untrusted;
validate consumed fields, safely ignore optional unknown notifications, reject
malformed lifecycle data and unsupported required messages. Map initial model,
sandbox and cwd evidence, item commentary/final text and terminal turn status.
Do not mark process exit zero as success. Use deterministic transport fixtures
until E1's verified policy is ready. A narrow read-only authenticated demo is
permitted only in an owned test world after that preflight, never a write test.

Workbench W1 builds `app/renderer/agents/RunRail.tsx`, `RunPane.tsx`,
`LaunchDraft.tsx`, `state.ts`, `client.ts` and `agents.css`, plus
`tests/agent-workbench.test.tsx`. Replace the existing empty agent rail through
small edits to `app/renderer/App.tsx`; mount a resizable run pane in the bottom
dock, not in place of source. Use a locally authored minimal fixture satisfying
R0 schemas, not a dependency on E2 completing. Label fixture mode unmistakably
and keep it out of normal production. Show starting, streamed output, accepted
versus unknown steering, terminal result and stop; keep graphs/source mounted.
Send ROOT a screenshot from the owned virtual harness within this first slice
if practical, otherwise a rendered-component artifact with that limitation.

Evidence/context E1 builds `core/agents/context.ts` and `policy.ts`, with
`tests/agent-context.test.ts` and `tests/agent-policy.test.ts`. Use contained
file access and existing fingerprints. Capture disk bytes, launch prompt/hash,
focus, root, HEAD, config/instruction provenance and nullable parent/task/spec
links. Reject stale launch inputs, oversized/binary/escaping files and unsupported
world mappings. Verify a no-write/no-tool-network/never-approve profile and
disabled MCP/hooks/connectors/tool plugins/delegation through the installed
harness's actual config inspection surface. No invented config keys; unknown
policy fails closed. Do not edit global config or copy credentials into fixtures.
The returned sandbox/cwd must match before turn/start. If that profile cannot
be established in this bounded slice, report the exact capability blocker to
ROOT; W1/R1's independent fixture work can still finish, but real launch stays
disabled rather than silently expanding authority.

### R2, W2, E2: harden and join the seams (30–60 minutes each)


Runtime R2 adds `core/agents/service.ts`, the store implementation and a small
owned-process lifetime helper under `core/agents/`. Keep one active run and one
5-minute draft. Persist admission before provider work; duplicate launch IDs
must find the prior admission rather than spawn. State is starting → running →
completed/failed, with cancelling and cancelled paths, and unknown whenever
dispatch/completion is ambiguous. Terminal evidence never regresses. Interrupt
acknowledgement is not cancellation; completion racing with Stop stays completed.
Dispose after terminal events; test control-pipe loss kills only owned server
descendants, even when the core is killed, not only during orderly shutdown.
Reserve five seconds before forced owned termination on cancel. Unknown cleanup
blocks another launch and cannot be cleared just because the app restarted.

Persist each pending steering instruction (request ID, text/hash, expected turn)
before sending it; recover unresolved records as delivery-unknown without replay.
Store owner-private files outside Git in Electron's supplied application-data
root. Atomically replace validated snapshots; persist admission and terminal
receipts before acknowledgement. Transcript tails can be lost on hard crash and
must say so. Core restart loads terminal history and marks unfinished records
unknown; no provider resume or launch/steer/cancel replay. Extend the existing
supervisor/preload uncertainty classification to all agent mutations. Test stale
core generations, late replies, duplicate IDs, malformed storage, disk full,
process crash and cancellation before thread/turn IDs are known. Local-core HMR
may stop a run; it must not recreate the native window or pretend work survived.

Workbench W2 joins the real bridge, subscribes before initial snapshot, uses a
separate agent sequence watermark, and preserves selected-run/draft state through
renderer HMR. Keep failed/pending/unknown user steering text inspectable without
auto-retry. **Reveal launch focus** is deliberate and respects working-world
mapping; selecting a run alone does not move source/navigation. Show requested
versus actual model, disk-versus-dirty-buffer warning, read scope and launch
fingerprint. Hide unsupported queue/PTY/global-chat controls. Render output as
text; paginate transcript and display gaps/limits instead of unbounded DOM.

Broadcast snapshots carry only the active run's tail. Selection stays in React;
use `agent.read` for a historical run's launch context, receipts and transcript.

Evidence E2 adds `fixtures/agents.ts`, `tests/agent-scenarios.test.ts`, and
`tools/desktop-agent-scenario.sh` plus a wrapper/target in `tools/BUILD.bazel`.
Use the same runtime schemas and an explicitly injected deterministic provider
for failure/delay/stale/duplicate/out-of-order/cancel-race/storage-limit cases.
The fixture cannot be selected by arbitrary renderer requests or silently used
by the normal app. The credential-free virtual test is repeatable; it is not
evidence of real model execution. Reuse exact-owned-window driver and hostile
ambient DISPLAY/XAUTHORITY checks. Keep one Electron/Xvfb instance at a time.

### R3, W3, E3: first vertical demonstration and landing (30–60 minutes each)


Runtime integrates reviewed commits into the integration worktree as they arrive;
it wires E1's context provider in `core/worker.ts` and W2's unchanged shared API.
Workbench fixes only UI/integration findings in its own files. Evidence runs the
virtual scenario and one explicitly initiated read-only real Codex run in an
owned fixture workspace: explain FraudCheck; while running, ask it to emphasize
interface failures; inspect the accepted receipt and final reply. Then a second
explicit run may exercise Stop. Never rig completion timing or claim a live
steer if the turn already ended; preserve a stale-turn response and retry the
demo explicitly if needed. Check the fixture repo's before/after source hashes;
do not test write authority. Record CLI version, verified policy, input hashes,
timestamps and actual outcome, omitting credentials/private transcript content.

Aim to show the fixture cockpit after W1 and the first real vertical journey
after the second slices join, not at the end of a large architecture rewrite.
Time boxes are steering checkpoints, not permission to declare incomplete
ownership/recovery correct. A failed acceptance gate becomes a named bounded
follow-up slice, not an unreported expansion of one department.

## Ownership and integration


ROOT creates three true session forks with step-specific compaction and default
gpt-6-astra, not departments spawning more implementers. Runtime uses branch
`feature/agent-runtime` in `agent-runtime/`, workbench uses
`feature/agent-workbench` in `agent-workbench/`, and evidence uses
`feature/agent-evidence` in `agent-evidence/`, all under
`/home/tedks/Projects/swarm-ide`. The runtime integrator owns
`integration/first-agent-run` in `first-agent-run-integration/`. Wait for R0's
base before creating/rebasing the two dependent branches; do not independently
invent protocol variants. All final topic PRs target current master after R0
lands; if any are opened earlier, use a real stack on R0 and retarget/rebase
one at a time after its normal merge. Never rewrite another agent's worktree.

Runtime exclusively owns `protocol/schema.ts`, `protocol/agents.ts`,
`core/worker.ts`, all `core/agents/` files except E1's `context.ts`/`policy.ts`,
`app/lifecycle.ts`, `app/electron/*` bridge/supervisor edits, `tools/dev.mjs`,
`tools/build-app.sh` and packaging config if the lifetime helper needs bundling,
plus `tests/agent-contracts.test.ts`, `tests/agent-adapter.test.ts`,
`tests/agent-service.test.ts`, `tests/agent-store.test.ts`,
`tests/agent-owner.test.ts` and existing bridge/supervisor test updates.
Workbench exclusively owns `app/renderer/agents/*`, composition edits to
`App.tsx`, necessary `global.d.ts` typing and `tests/agent-workbench.test.tsx`.
Evidence owns its two core files/tests, `fixtures/agents.ts`, scenario tests,
new desktop-agent scripts and `tools/BUILD.bazel`. No shared-file exception is
implicit: request a change from its named owner. Runtime updates this ExecPlan
during implementation; other departments send terse progress/decision records.

The integration branch merges committed topic work, never unsaved files. It is
a preview/test aggregate, not a bypass around independent reviews/PRs to master.
One integration lead sequences relevant Bazel/virtual tests and posts changed
head SHAs. Main/preload changes require the existing deliberate adoption flow;
the wave never restarts the user's 55173 app on its own.

## Concrete Steps


From each designated feature worktree, materialize dependencies once if absent:

    nix develop --command pnpm install --frozen-lockfile

For every slice, run the existing complete non-desktop quality gate (new test
files are included by its Vitest pattern), optionally followed by the full
non-desktop Bazel set when shared boundaries changed:

    nix develop --command bazel test //tools:quality --test_output=errors
    nix develop --command bazel build //...
    nix develop --command bazel test //... --test_tag_filters=-desktop --test_output=errors

E2 will add `//tools:desktop-agent-smoke` and
`//tools:virtual-desktop-agent-test`; these targets do not exist at design time.
From the integration worktree, run after the target exists:

    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel test //tools:virtual-desktop-agent-test --nocache_test_results --test_output=errors

The wrapper owns Xvfb/Openbox and ignores inherited physical DISPLAY/XAUTHORITY.
Use `SWARM_SOURCE_WORKSPACE` pointing to the validated integration worktree only
as supported by the existing harness. No direct Vite/Vitest/Electron invocation.
Keep one virtual test active; CI uses fixtures only and no Codex credentials.
R3's optional real-provider mode of the Bazel-owned smoke wrapper must require
explicit operator invocation and successful policy preflight, never run in the
default test suite. Capture its exact invocation and outcome during the wave.

## Validation and Acceptance


Contract/service tests reject extra fields, byte-limit bypasses, invalid run
transitions, stale context, path escape, duplicate dispatch, stale-turn steering,
late old-generation results and fake completion from process exit. Provider
fixtures exercise terminal-before-response ordering, cancellation racing with
completion, unacknowledged steering and unsupported server requests. Known
approval requests are declined/cancelled, never accepted; unknown requests get
a bounded unsupported error and safe stop rather than hanging the run.

Limits are one active run, one draft, 16 KiB task/steer, 64 KiB attachment,
128 KiB explicit context, 1 MiB JSONL line, 64 KiB record, 256 KiB page,
512 KiB in-memory tail, 8 MiB per transcript, 64 MiB store and 20 retained runs,
with a 10-minute deadline. Quota blocks admission or boundedly stops a live run
with reserved terminal evidence; do not delete private history silently.
Status/control messages bypass 10 Hz text coalescing. Test blocked consumers,
full disks, malformed/truncated persisted tails and process-tree cleanup.

Virtual evidence shows graph cameras/source buffer surviving run selection,
streamed text in the dock, live instruction pending/accepted/stale/unknown
states, honest Stop races, history after restart, old generation rejection and
no duplicated launch after HMR/core loss. Show missing executable/authentication
as actionable unavailable state, no fake fallback. Real evidence separately
shows authenticated provider activity, actual steering acceptance and final
turn evidence, plus unchanged fixture source. Record actual first-display and
first-provider-event timings; immediate local admission should paint within
100 ms once admitted, while model latency is measured, not promised. No CPU or
cost estimate is presented without measurement.

All nontrivial code PRs receive the prescribed provider-aware council review to
fixpoint and relevant local checks. Foreign seats genuinely unavailable are
recorded as missing. The user allows remote CI bypass only when all relevant
local gates pass; record hosted status honestly, particularly existing topology
timeout debt. No local-test waiver is implied. Normal merge preserves commits.

## Idempotence and Recovery


Tests create owned temporary worlds/stores/processes and may be repeated. Never
terminate a process by name or unverified saved PID, never touch ports 5173 or
55173, and never replay a lost launch. Validate stored run ownership and cleanup
evidence; leave unresolved outcomes visible and require explicit operator
resolution before another run if its old process may remain live. Stop only
owned test resources, preserve failed-test evidence, and leave the user's app
alone. Keep completed branches until all dependent PRs land, then clean their
worktrees. Do not clear somebody else's stash.

## Artifacts and Notes


Use ignored `artifacts/first-agent-run/` for short sanitized transcripts,
screenshots, timings, test logs and review/CI status. Never export private
credentials, raw model reasoning or arbitrary user transcript contents. The
root executive handoff needs outcomes, SHAs, remaining gates and the first
visible demo, not an implementation transcript. Ditz gate/workstream IDs are
`first-agent-run-contract-gate`, `agent-run-contract-base`, `agent-run-runtime`,
`agent-run-workbench`, `agent-run-context-evidence`, `agent-run-vertical-proof`.
The existing `first-real-agent-run-surface` closes only after the actual vertical
proof and landing, not when this design merges. Sync Ditz metadata and push each
department's granular commits/draft PRs; completion notifications are structured
recaps, not repeated ROOT polling.

## Interfaces and Dependencies


Use existing Node process/filesystem APIs, Zod, React and the current typed
bridge; no new app framework, terminal stack, queue service, database or second
provider is required. Only normalized `AdapterEvent`, `PreparedAgentContext`,
`CleanupEvidence` and strict public agent schemas cross module boundaries.
Secrets stay inside the trusted local harness environment. Package the complete
resolved CLI, or depend on its installed package; never treat one copied binary
as a complete executable bundle. Preserve the broader graph/planning/swarm
architecture without implementing it in this first run.

Plan revision note (2026-09-06): initial design-only wave after stable-window
adoption. Splits runtime, cockpit and context/evidence behind one small contract
base; deliberately limits the first real demonstration to read-only analysis.

Plan revision note (2026-09-06, R0 start): record accepted gate, assumptions and
the minimal shared-schema/unavailable seam before implementation. Later slices
remain unstarted; watched master/runtime adoption belongs to ROOT.
