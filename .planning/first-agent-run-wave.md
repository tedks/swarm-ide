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
- [x] (2026-09-06) R0: publish validated contracts, typed unavailable behavior and module interfaces in PR #9; remote landing is recorded by that PR's normal merge transaction.
- [x] (2026-09-06) R0: strict six-command schemas, interface-only adapter/context/store modules and production unavailable dispatch; initial and contract/bridge quality passes succeeded.
- [x] (2026-09-06) R0: first full build and five uncached Bazel tests passed, including owned virtual desktop smoke (31.6 seconds); 151 focused tests passed at a6d8f4f.
- [x] (2026-09-06) R0: first fix delta d57de1c passed the full local build/test again (154 focused tests; five Bazel targets, virtual smoke 30.4 seconds). Native and Google convergence clean.
- [x] (2026-09-06) R0: final code bb3ab3b passed full build and all five uncached Bazel tests (154 focused tests; owned virtual smoke 32.2 seconds). Test-only correction 01fc34c reran quality successfully; unchanged harness tests reused that local evidence.
- [x] (2026-09-06) R0: PR #9 normal-merged as 1afb2b8; ROOT verified local gates and CLEAN three-provider review. Hosted CI was in progress under the conditional local-proof waiver. Watched master was not adopted.
- [x] (2026-09-06) W1: renderer fixture cockpit normal-merged as 6b171b9 (PR #10, topic 28669ba); local full build, all five Bazel targets and owned virtual preview passed, three-provider council CLEAN. Hosted virtual smoke subsequently failed under the recorded local-proof waiver, not green. No watched-app adoption.
- [x] (2026-09-06) E1: context/preflight normal-merged as 023c6e2 (PR #11, topic 8746804); its Ditz delivery records 212 tests with W1, full build/all five targets and three-provider CLEAN convergence. Effective limited policy remains unavailable. ROOT authorized its narrow nonblocking file-open/FIFO regression.
- [x] (2026-09-06) R1: bounded adapter, deterministic conformance fixtures and actual fixed-argv fixture subprocess implemented. Shared public contracts unchanged; no live model turn or production wiring.
- [x] (2026-09-06) R1: PR #12 normal-merged as f547e05, tested topic a1d15b0; 248 unit tests, full build/all five local targets passed. OpenAI native and Google CLEAN; Anthropic timed out without a verdict. Hosted virtual timeout failed under the user's conditional local-verification waiver. Clean pushed integration/first-agent-run includes W1/E1/R1; watched master remains deliberately unadopted.
- [x] (2026-09-06) ROOT authorized overnight R2/W2/E2 plus independent P1 policy investigation, each isolated from f547e05; small native helpers allowed within explicit owned modules. R2 service/store/namespace owner and private shutdown handshake underway; W2 bridge/recovery cockpit and E2 shared adversarial fixtures underway. No real model turn is authorized in these four slices.
- [x] (2026-09-06) R2 checkpoint355d40f: durable service/private store, real production disk preparation/history, typed policy-unavailable launch, private shutdown handshake and separately tested namespace-owned transport implemented. No real-provider transport is constructed in production.
- [x] (2026-09-06) R2 local gates at355d40f:333 tests across33 files (20 service,38 store,12 owner,23 supervisor), full19-target build and all5 uncached Bazel targets passed. Owned virtual topology smoke26.3s; dedicated virtual selective-reload scenario31.7s, cleanup_complete=1. Native window/workspace/focus retained, dirty preload deferred; renderer176ms/core504ms/crash363ms. These are local fixture evidence, not hosted CI or live-agent execution.
- [x] (2026-09-06) R2 final code c6aa292: 340 tests across 33 files, full 19-target build and all five uncached local test targets passed. The final virtual reload scenario took 31.739 seconds, cleanup_complete=1; renderer 173 ms, core 501 ms and crash 407 ms, preserving native window/workspace/focus and dirty-buffer protection.
- [x] (2026-09-06) R2 council converged CLEAN in OpenAI native and Google seats after fixing missing push-only storage-failure publication and safely recovering abandoned private snapshot temporaries. Anthropic timed out without a verdict and is explicitly missing, not approval. Hosted run 34011115120 failed its dedicated virtual smoke's known 90-second Reconciling wait; the conditional local-verification waiver applies, not a green-CI claim. PR #16 records the normal merge transaction and landing evidence.
- [x] (2026-09-06) Reviewed integration d8cf40d combines R2 code with normal-merged W2 PR #15 (6ead046), E2 PR #14 (a4ae558) and P1 PR #13 (2f3ca7f). Full local build and all five uncached targets passed; 404 tests across 36 files. W2 supplies the actual bridge cockpit, E2 supplies adversarial fixtures, and R2 supplies durable lifecycle and separately tested owned process cleanup. No real provider was launched or watched master adopted.
- [x] (2026-09-06, I1) Separate test-only worker/virtual execution journey delivered in agent-integrated-journey from normal merge e443b38; agent-run-runtime-r2-vertical and agent-run-virtual-scenario-e2 are the completed slice. Two small native helpers supplied fixture composition/tests and fixed desktop driver; I1 integrated and verified them. No policy promotion.
- [x] (2026-09-06, I1 checkpoint b9782ea) Actual fixed-focus disk draft, admission, literal stream, accepted/stale steering, Stop/completion versus cleanup, history paging/Reveal and real core crash/unknown/no-replay journey passed on owned virtual X11. Reviewed W2B fa263e7 is included. Full21-target build,435 tests and all6 uncached local targets passed. Deliberate failure after active streaming also retained diagnostics and confirmed owned cleanup. Review fixes/final aggregate landing remain pending, not live-provider proof.
- [x] (2026-09-06, I1 final code14d6da7) Reviewed W2B/P2/C1 normal merges included; full24-target build and all8 uncached local targets passed,474 tests across43 files. Virtual agent journey3.189s automation/4.936s total, cleanup_complete=1; same-head admitted/streaming failure probe returned expected nonzero and cleanup1. OpenAI native and Google CLEAN fixpoint; Anthropic600s timeout without verdict, explicitly missing. Hosted34013611396 was in progress under conditional local-proof waiver, not green. PR20 records the normal-merge transaction; watched master/app unadopted.
- [ ] R3/W3/E3: integrate, demonstrate one real read-only run, finish relevant local gates/review and normal-merge the feature PRs.
- [ ] ROOT deliberately adopts the integrated build if native-main changes require restart; do not silently replace the watched app.

## Surprises & Discoveries


I1's native reviewer identified a test-only timing hazard: screenshot capture,
PNG encoding and disk I/O were inside R2's two-second disposal deadline. The
journey now asserts pending cleanup, releases the manual fixture gate, and only
then captures the completed/cleaned view. The production deadline is unchanged.
Optional failure screenshots cannot suppress the independent JSON/socket error.

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


Decision (2026-09-06, I1): production worker construction remains a fixed entry
calling startCoreWorker without overrides. A separately compiled test-only entry
injects E2's deterministic adapter into the real service/store/E1 disk context.
The actual Electron main/supervisor/preload and renderer are reused. A fixed
test-build alias observes the exact owned utility process; private harness
controls never join the six public commands or normal development environment.
Only the owned virtual-X11 scenario can trigger compiled automation. In-process
fixture disposal confirms no external process existed, not namespace policy or
provider cleanup. Crash recovery still blocks on unknown ownership exactly as
production does; it never upgrades knowledge from the test harness.

Decision (2026-09-06, ROOT delegated overnight): intentional core replacement
closes admission and waits at most 1000 milliseconds for outstanding agent
mutation acknowledgements, or their earlier existing deadlines. It does not wait
for an entire turn. Unresolved commands become unknown and are never replayed.
File saves retain their existing protection. After drain, a private
core.shutdown/core.shutdown.ready handshake gives the service up to 2000
milliseconds to persist unknown receipts/outcomes and dispose owned work before
supervisor fallback termination. A real crash has no acknowledgement grace;
durable recovery stays conservative. This resolves agent-run-restart-drain-policy.

Decision (2026-09-06, R2 assumptions): a single Linux core owns a private
per-canonical-workspace store under Electron application data, not in Git.
Atomic bounded snapshots and an abstract Unix-socket writer lock avoid stale PID
lock reclamation. The store validates hashes and lifecycle relationships, not
only JSON shapes. Persisted process IDs never authorize a signal. A namespace
owner is a Linux lifetime boundary, not evidence of disabled tools or provider
policy; unavailable user namespaces fail closed. Production constructs no CLI
transport until ROOT separately accepts P1 and the integration gate. Disk context
preparation and history are useful without pretending execution is available.

Decision (2026-09-06, R1): the complete installed npm package now reports
0.153.4, so this slice pins its locally generated stable protocol shapes rather
than assuming the historical 0.146.0 installation remains. The default adapter
probe can inspect version but returns policy-unavailable; only a trusted core
probe/transport injection can exercise fixture execution. E1/R2 must supply
effective profile evidence before real use. No orchestration bundle is packaged.
Requested reasoning effort remains explicitly unsupported without model-specific
capability evidence. The adapter reports the actual initial model, records
reroutes as status, and preserves the frozen AdapterEvent contract.

Decision (2026-09-06, R1 convergence): delay process-exit publication until
stdout EOF or a one-second bounded drain, retaining buffered terminal/reply
evidence; reject new controls during that drain. Deferred transport cleanup is
close-once even when open reports synchronous failure. These are local stdio
ordering rules, not the unresolved ROOT core-restart acknowledgement policy.
Make invisible controls visible in normalized output and preserve observed
unsupported versions rather than displaying the tested baseline as actual.

Decision (2026-09-06, first-wave integration): merge reviewed W1/E1 upstream
commits into the runtime topic before its final combined local verification.
R1 reuses E1's landed validateCodexThreadPolicy instead of keeping divergent
echo-policy rules. The default capability probe and prepared context are both
unavailable without full effective-profile evidence. Schema/version support or
thread echoes alone never attest disabled hooks/MCP/connectors/plugins/delegation.
Non-null reasoning effort is explicitly unsupported until the separately tracked
agent-run-model-capabilities work establishes model-specific evidence.

Decision (2026-09-06, R1): use one bounded byte-framed transport and normalize
only consumed lifecycle/message fields. Keep raw reasoning and stderr private.
Unknown optional notifications are ignored; unknown server requests get a
bounded unsupported reply and safe stop, known approval requests get cancel.
Direct-process disposal is explicitly unknown for descendant cleanup, which
requires R2's owner; a zero exit status never supplies turn success.

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

Decision (2026-09-06, Anthropic R0 triage): add INVALID_CURSOR and
INSTRUCTION_LIMIT errors for invalid history cursors and the explicit receipt
cap; name the page-record cap. Tighten time ordering, confirmed-turn start time,
pending receipt errors and identifier control characters. Only setup rejection
and provider turn evidence are adapter terminal events; the service owns
prevented dispatch and owned termination. Unavailable capabilities may retain a
verified policy observation when another capability (for example authentication)
is unavailable; availability and policy evidence deliberately stay separate.
ROOT/R2 must consider acknowledgement draining in
agent-run-restart-drain-policy; bounded late-acknowledgement evidence and
old-generation definitive rejections are tracked in
agent-run-late-response-evidence. Neither authorizes replay nor blocks the
independent R1/W1/E1 fixture slices. Existing conservative behavior is retained.

Decision (2026-09-06, final R0 triage): agent-run-boundary-diagnostics tracks
non-blocking read-error wording/classification, bounded sanitized validation
diagnostics and visible Unicode-control handling for operator-facing provider
summaries. R1/W2 own those concerns; never log raw context/transcript secrets.
The final test-only correction starts timing rejection tests from a valid
completed/cleaned-up baseline, so each assertion isolates its intended rule.

## Outcomes & Retrospective


I1 joins the previously separate seams through an actual owned desktop: the
test provider is deterministic, but admission/storage, public requests, live
events, renderer controls and crash recovery are real. The first complete
journey took roughly3 seconds of fixed automation; this is not model latency.
`docs/agent-journey.md` explains exact targets, evidence and failure mode. The
provider and process-owner proof remain deliberately separate; production is
still unavailable. Final executable14d6da7 passed474 tests/all8 local targets,
full build, repeated actual journey and active-failure cleanup, including the
reviewed reload-protection/policy-test/cold-build slices. OpenAI and Google
converged CLEAN; Anthropic timed out without a verdict. Dedicated hosted CI now
includes the new journey and its separate evidence archive, but hosted status
was still in progress at final local verification. PR20 and the executive
handoff record actual merge/integration state; neither claims a model turn.

R2 final code c6aa292 joins durable admission, bounded event/command queues,
steering intent/outcomes, Stop races and recovery against the actual file store.
Linux namespace fixtures demonstrate hard core-control loss stopping detached
descendants without touching an unrelated canary. Store and service tests also
exercise disk-full, corrupted/hostile snapshots, exclusive writers, unknown
cleanup, old/duplicate events and shutdown during steering-intent persistence.
Actual production worker construction supplies disk context and private history
while returning ADAPTER_POLICY_UNAVAILABLE for launch. Full local and owned
virtual reload gates passed; exact evidence is archived under
master/artifacts/overnight-wave/runtime. The two available council seats converged
CLEAN; the third timed out. PR #16 records the normal merge transaction because
this commit cannot name its future merge commit. Reviewed integration d8cf40d
passed all five local targets and 404 tests with W2, E2 and P1. Hosted CI failed
the known dedicated virtual Reconciling timeout; local evidence is not hosted
CI success. The watched checkout and application remain deliberately unchanged.

This remains a coherent nonlaunchable checkpoint. The separate core-owned test
worker journey with W2/E2 is agent-run-runtime-r2-vertical (coordinated with E2's
agent-run-virtual-scenario-e2). P1's investigation supplies no effective-policy
attestation; it must not silently unlock the adapter. Snapshot-write amplification
is tracked in agent-run-store-throughput, and explicit proof-based unknown-cleanup
resolution in agent-run-cleanup-resolution. The runtime parent and vertical proof
issues remain open; the broader swarm roadmap is not claimed complete.

First parallel wave: W1 supplies an explicitly labeled renderer-only rehearsal;
E1 supplies bounded disk-context capture/revalidation and truthful unavailable
policy; R1 supplies normalized adapter events and fixture-proven stdio handling.
The current combined runtime topic contains the committed/pushed W1 and E1
normal merges, not edits copied from sibling worktrees. No integration desktop
or watched master update occurred. Separate integration-preview ownership remains
Runtime; ROOT alone chooses visible adoption.

W2 has no new renderer contract dependency on R1: R2 turns AdapterEvent and
the landed context provider into durable Run/snapshot/read results through the
existing six-command protocol. W2 wires live subscriptions, sequence/core
generations, HMR, historical pagination and explicit uncertain steering. The
service/store/owned-lifetime checkpoint and ROOT restart-drain decision are
implemented; the separate execution journey and effective-policy blocker still
prevent any real turn. R1 by itself does not claim authenticated execution,
host confidentiality or descendant-cleanup proof.

R0 now supplies the protocol v3 base: protocol/common.ts holds shared version
and focus primitives; protocol/agents.ts validates six methods, named results,
immutable prepared context, run summaries/detail, terminal/process/cleanup
evidence and bounded transcript pages. core/agents/adapter.ts,
context-provider.ts and store.ts are interfaces only. core/agents/unavailable.ts
is the only production agent handler: snapshot explicitly reports unavailable,
and every other agent method returns ADAPTER_UNAVAILABLE. No fake run fallback
exists. core/worker.ts, app/lifecycle.ts, preload and supervisor carry separate
agent events/results through the existing generation envelope. App.tsx merely
ignores agent events in the workspace reducer; there are no new UI controls.

Tests exercise the actual worker dispatcher and preload with explicitly injected
test doubles, mutation uncertainty, invalid generations/results, bounded Unicode
payloads, identity/cursor correlation and lifecycle evidence. Full local build
and five tests, including owned virtual X11, passed for the final production
code. Exact counts/head-specific logs and review receipts live under the ignored
master/artifacts/agent-run-contract-base-final directory; PR #9 is the authority
for normal-merge state, since a commit cannot name its future merge commit.

R1/W1/E1 can build independently from the merged base. R1 owns normalized adapter
events and shared seams; W1 consumes named results/snapshots with explicit
fixtures; E1 implements AgentContextProvider and policy evidence. Actual provider
execution, authentication/policy enforcement, durable storage, process ownership,
recovery, cockpit controls and real vertical proof remain unimplemented. No
credentialed run or physical-desktop automation occurred in R0. The existing
master checkout and app are deliberately not adopted by this child. Keep these
distinctions in subsequent recaps.

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

Plan revision note (2026-09-06, R0 handoff): record delivered module seams,
local verification and scoped review dispositions. Merge/cleanup is a separate
recorded transaction; no later department or runtime adoption is claimed.

Plan revision note (2026-09-06, R1 start): record the merged R0 base, current
installed CLI evidence and first-slice fail-closed adapter boundary. No R2 or
real-run acceptance is implied.

Plan revision note (2026-09-06, R1 convergence): preserve verified peer landings,
adapter ordering fixes, reused policy seam and exact next-slice dependencies.
Master/app adoption and the R2 gate stay with ROOT.

Plan revision note (2026-09-06, R2 checkpoint): record the delegated restart
decision, bounded durable/runtime ownership implementation, exact local evidence,
nonlaunchable production scope and smallest independently reviewable continuation.

Plan revision note (2026-09-06, R2 convergence): record exact final code tests,
review dispositions, hosted failure, reviewed peer integration and the remaining
test-worker/policy/adoption gates without claiming a real model run.

Plan revision note (2026-09-06, I1 start): split fixed production composition
from explicit test bootstrap, retain all runtime state/unknown/no-replay rules,
and implement one credential-free vertical journey before any live-policy gate.
