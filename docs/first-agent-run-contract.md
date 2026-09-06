# First real agent-run contract

Status: design gate; no agent execution is implemented by this document. This
extends the landed repository/source cockpit, not a separate chat application.
The companion [execution plan](../.planning/first-agent-run-wave.md) divides the
implementation into three bounded departments. Product invariants remain in
[product-foundation.md](product-foundation.md).

## The first useful journey

Open a source file while keeping both navigation graphs mounted. Choose **Ask an
agent about this focus**. The work rail expands an inspectable launch draft:
task text, attached on-disk source, working-world fingerprint, actual directory,
instruction/configuration sources, requested model/reasoning, and access policy.
Launch explicitly; a real run appears immediately as starting, then shows
provider-observed activity and streamed commentary. Select it without changing
the source tab or graph camera. Send **Focus on the interface contract instead**
to that run while it works; the UI distinguishes pending, accepted, rejected,
and delivery-unknown instructions. Its final answer stays next to the source.

The first demo is **read-only analysis**, not implementation: explain FraudCheck's
inputs, outputs and failure cases, then steer the explanation. No agents move
around the graph without evidence; a focus marker means only “launched with this
focus,” not “currently editing this file.” No fabricated queue, percentage,
health, model, token count, cost or CPU measurement. Launch, live steering,
interrupt, inspection and retained history are supported. Retry is a deliberate
new run, never an invisible replay. This is the first rung of the planning and
implementation hierarchy, not its replacement.

## Adapter choice and evidence

Use a narrow **Codex app-server, stdio JSONL** adapter, one owned server process,
one fresh thread and one turn per run. JSONL means one JSON message per line;
no TCP listener, shared daemon, PTY, terminal scraping or rollout watcher is part
of the product adapter. Keep provider details behind `AgentAdapter`; Claude and
other harnesses can implement that boundary later. This does not change ROOT's
separate interactive true-fork orchestration workflow.

On 2026-09-06 the installed `codex-cli 0.146.0` and ROOT's complete pinned
`0.153.4` bundle both generated non-experimental app-server schemas locally.
Both expose `thread/start`, `turn/start`, `turn/steer` with `expectedTurnId`, and
`turn/interrupt`. `ThreadStartResponse` reports model/provider/cwd/sandbox and
instruction sources. Those are verified shapes, **not proof of authenticated
execution or sandbox enforcement**. Runtime slice R1 must demonstrate those.
The [official app-server reference](https://developers.openai.com/codex/app-server)
documents the initialize/initialized handshake, item streams and terminal turn
notifications; its newer optional fields are not automatically supported by the
installed CLI. In particular, 0.146.0's read-only policy does not expose the
newer restricted-read-root shape. Do not copy that shape from current docs.

Provisional baseline: the complete installed 0.146.0 package, with its exact
resolved executable/version recorded. No upgrade is required for this design.
Accept another version only after its required schema and local conformance
checks pass. An operator-owned local setting selects the executable; repo text
or renderer input cannot supply arbitrary executable paths, argv or environment.
The missing companion that initially blocked this department is a tooling
follow-up, not a reason to copy a lone executable into the product.

## Authority and immutable launch context

Firm: only the currently opened, core-registered working world is selectable in
v1. Its canonical root is resolved by the core, never accepted from React.
Another existing worktree is a future registered world, not a free-text cwd.
Launching from a built/deployed focus requires an explicit mapping back to a
working focus; ambiguity is a visible choice, never silent retargeting.

`agent.prepare` captures a short-lived launch draft without starting a model.
It records a core-created UUID `runId`, `worldId`, repository identity, canonical
root, Git HEAD, working fingerprint, `FocusRef`, task text and optional opaque
task/spec/parent links. V1 permits only a known local parent run and normalized
repo-relative task/spec links; these links convey no extra authority and are not
automatically dereferenced. This supports future recursive plans without making
every document a graph node. A new run gets a fresh provider thread, not inherited
parent conversation unless a later contract explicitly adds that operation.

Initial explicit context is bounded task text, the selected on-disk UTF-8 file
or user-selected range (at most 64 KiB), its path/content digest and line range,
and a small IDE instruction envelope. Attachments are read through the existing
contained-file rules; never include an unsaved editor buffer without an explicit
future “attach buffer” feature. The draft says **disk version; unsaved edits not
included**. Directory/service focus contributes identifiers and source links,
not an unbounded recursive directory dump. No automatic wiki/metrics/contracts
expansion, private-doc search or IDE MCP server in this slice.

Launch validates the draft's fingerprint and attachment/config digests again;
changed inputs require refreshing and confirming the draft. Save the exact
submitted prompt bytes and their hash before dispatch. This is an immutable
record of what the IDE sent, not a promise that a live filesystem or provider
discovery stayed frozen during the run. Record provider-reported instruction
paths, and safely digest readable ones with before/after observations; label
unobserved or changing instructions honestly. Never claim a reconstructed list
is the provider's exact expanded context. Source changes during a run show
“world advanced since launch”; they do not invalidate the historical run or
turn the service graph green.

Read-only means a verified `readOnly` shell-filesystem policy, tool network
disabled, approval policy `never`, and no authority to edit the repo, build,
deploy, modify Git/Ditz or grant approvals. It is **not a host confidentiality
sandbox**: 0.146.0 can read files available to the local account. Show that scope
and the fact that selected content is sent to the configured model service
before launch. Restrict v1 to trusted local projects and trusted user-owned
harness configuration. No arbitrary shell command is supplied by the renderer.

Before any turn, the adapter must fail closed if effective configuration cannot
be inspected, the returned policy/cwd differs, or hooks, MCP servers, connectors,
tool plugins, auto-approval or delegation can escape this limited profile. A
read-only shell policy alone does not constrain these capabilities. R1 must
prove a supported disabled-capability profile using the actual installed
configuration surface, without editing global settings. Do not invent config
keys or fall back to `dangerFullAccess`; inability to establish the profile is
a visible `ADAPTER_POLICY_UNAVAILABLE` blocker for real launch. Authentication
stays with Codex; no auth file/token crosses the bridge or enters evidence.

Model and reasoning are explicit requested settings. An empty model choice may
use a provider default only when labelled as such; display the actual returned
model separately, and record reroute notifications. Unknown effort support is
an error or an explicit unavailable control, never silent substitution. ROOT's
gpt-6-astra orchestration default is not a claim about every user's entitlement.

## Frozen bridge seam

Add strict Zod contracts in `protocol/agents.ts`; the shared-contract owner alone
integrates them with `protocol/schema.ts` and bumps `PROTOCOL_VERSION` to 3.
Re-use the existing `swarm.request/onEvent` IPC, main-frame checks and lifecycle
generation envelope. Do not expose raw provider RPC to React. Agent state is a
separate read model, not grafted into `GraphSlice` or forced into `Job`'s required
percentage/resources fields. Existing workspace responses stay coherent.

All requests retain `{protocolVersion, requestId, type}`. New bounded payloads:

| Request | Payload and result |
| --- | --- |
| `agent.prepare` | `{worldId, focus, taskText, model: string|null, effort: string|null, links}` → draft with `runId`, `contextHash`, expiry, launch context, capability evidence |
| `agent.launch` | `{runId, contextHash}` → durable admission receipt, **not** running/completed; duplicates return the known admission without another process |
| `agent.steer` | `{runId, expectedTurnId, text}` → instruction receipt with its request ID; accepted only after the matching provider reply |
| `agent.cancel` | `{runId}` → cancellation request receipt, **not** proof of interruption |
| `agent.snapshot` | `{}` → bounded `AgentSnapshot` |
| `agent.read` | `{runId, afterRecord: integer}` → bounded transcript page with next cursor and truncation indicator |

`CoreResponse` gains an optional discriminated `agent` result; validators require
the appropriate result at the agent client boundary. `AgentEvent` is
`{protocolVersion, type: "agent.changed", sequence, emittedAt, snapshot}` inside
the existing generation envelope. Use the core's single emission sequence; agent
state has its own reducer watermark, so a file event is not a missing agent
record. A snapshot contains at most 20 run summaries, active `runId|null`,
capabilities/unavailability reason and the most recent 32 transcript records for
the selected/active run. Full bounded history is paged through `agent.read`, not
copied into every workspace event. Responses carry the same sequence watermark;
subscribe before initial read, reject old generation/sequence results.

A `Run` has `runId`, nullable `providerThreadId/providerTurnId`, immutable
`launchContext`, `state`, timestamps, nullable terminal reason, provider outcome
evidence, `processState` (`not-started|live|exited|unknown`), nullable exit code,
transcript cursor/limits, and instruction receipts. A transcript record has
monotonic `recordId`, timestamp, kind (`user|message|tool|status|gap|recap`),
provider item ID when supplied and bounded text. Store/display only user-visible
commentary, final messages and bounded tool summaries; do not expose raw model
reasoning payloads. Render untrusted output as text, never executable HTML.

Firm errors include `STALE_CONTEXT`, `BUSY`, `ADAPTER_UNAVAILABLE`,
`ADAPTER_POLICY_UNAVAILABLE`, `UNSUPPORTED_CONTROL`, `RUN_NOT_ACTIVE`,
`STALE_TURN`, `OUTPUT_LIMIT`, `STORAGE_UNAVAILABLE`, `STORAGE_FULL`, and
`AGENT_OUTCOME_UNKNOWN`. Messages are bounded and sanitized. Invalid requests
fail before process work. `requestId` identifies transport commands; durable
`runId` prevents a lost launch acknowledgement from becoming a second launch.
Steering deduplication is by request ID within its run; payload reuse with
different text is rejected. Never automatically resend an ambiguous steering
instruction, cancellation or launch after timeout/reconnect.

## Lifecycle, cancellation and recovery

State transitions are firm; “completed” describes provider turn termination,
not correctness, successful tests or delivered software.

| State | Evidence / allowed next states |
| --- | --- |
| `starting` | durable admission precedes spawn/turn dispatch; then `running`, `cancelling`, `failed`, `unknown` |
| `running` | matching `turn/start` reply or `turn/started`; then `cancelling`, `completed`, `failed`, `cancelled`, `unknown` |
| `cancelling` | cancel requested; then `cancelled`, `completed`, `failed`, `unknown` |
| `completed` | matching `turn/completed` with status `completed`; no final message is still a completed turn, with “no final answer supplied” |
| `failed` | confirmed spawn/setup rejection or matching terminal provider failure; no optimistic recovery |
| `cancelled` | provider status `interrupted`, or confirmed owned-process termination following cancellation; preserve which evidence applies |
| `unknown` | execution outcome not established; never display as completed/cancelled or auto-retry |

Terminal states never regress from late messages. `processState` is independent:
app-server stays alive after a turn; exit code zero without a terminal turn is
not completion. After a terminal event, orderly disposal updates process evidence
without rewriting the outcome. An exit before terminal evidence is `unknown`
unless setup is known not to have dispatched; a nonzero exit alone does not
prove the model did nothing. A provider failure notification that may be retried
is activity, not terminal until the terminal event.

Cancellation during setup prevents dispatch if still locally possible.
Otherwise send `turn/interrupt` for the known thread/turn. Its acknowledgement
means accepted request only. If the provider finishes before interruption,
`completed` wins and the UI says the request arrived too late. After 5 seconds
without termination, stop the owned process tree; report `cancelled` only after
verified termination, otherwise `unknown`. Local cancellation never implies
undoing earlier operations or refunding model usage. Steering is one in-flight
request at a time, only with a confirmed active turn; it cannot change model,
cwd, context or permission policy. A stale-turn rejection leaves text available
for a new draft, never silently starts another turn.

Core loss marks all nonterminal records `unknown`. The existing supervisor's
generation change must settle pending agent mutations as
`AGENT_OUTCOME_UNKNOWN`, not “retry the read.” No automatic replay. Renderer HMR
or document reconnect to the **same** live core re-reads the run snapshot and
continues observing it; it does not relaunch or reattach a provider session.
After core/app restart, load durable history, expose unknown runs and any
available cleanup evidence. Provider resume/reattach is deferred.

Each run needs an owned lifetime boundary: the adapter's small process owner
must stop its server/descendants when its core control pipe closes, including a
core crash. R2 must test this using a deterministic child process; a normal
`process.on("exit")` callback is insufficient. No surviving detached agent
daemon, kill-by-name, arbitrary persisted-PID kill or killing unrelated Codex
sessions. If cleanup cannot be established, retain `processState: unknown`,
surface that a run may still be consuming resources, and block another launch
until explicit operator resolution. After restart, absence of a live owner
claim alone is not proof of termination. Do not build general distributed
recovery or silently resume a model to learn whether the old turn finished.

## Storage and resource bounds

The core owns per-workspace run records under an operator-local app data
directory supplied by Electron, outside Git. Owner-only directory/file modes,
no-follow reads, atomic snapshot replacement and validation on reload are
required. Persist admission before any provider dispatch, and persist terminal
state/steering receipts before announcing durable results. Transcript append
may lose its final buffered tail on abrupt death; record that possibility on
recovery. Retain exact explicit launch context, immutable identity and the last
durable outcome. Codex owns its own session files; do not parse/modify them or
promise their retention policy. No automatic sensitive transcript export into
the repo, CI output, bug reports or root recap.

Provisional limits, with firm visible failure behavior: one active run; one
prepared draft (5-minute expiry); 16 KiB task/steer text; 128 KiB total explicit
launch context; 1 MiB maximum provider JSONL line; 64 KiB record text; 256 KiB
read page; 512 KiB normalized in-memory transcript tail; 8 MiB normalized disk
transcript per run; 64 MiB total store; 20 history entries; 10-minute run deadline.
Count UTF-8 bytes, not JavaScript code units. Quota refuses admission rather
than deleting history silently. Local storage inspection/deletion can be an
operator workflow until the later retention UI exists.

Drain stdout/stderr promptly into a bounded parser; do not let a slow React
subscriber stall the provider. Coalesce text display updates to at most 10 Hz;
terminal/control evidence is immediate. Oversized/malformed messages terminate
the adapter with explicit protocol/output error and known-versus-unknown outcome
distinction. Truncated tool text has a visible gap record; dropped display
deltas can be repaired from normalized snapshots, never invented. At transcript
quota, interrupt and boundedly terminate, preserving a reserved terminal record.
Disk full before admission means no process starts; storage failure after
dispatch triggers stop and visible non-durable/unknown evidence. Report elapsed
time, last observed activity and truncation; unknown usage is “unavailable,” not
zero. One virtual desktop and one credentialed demo at a time; builders run
mock/contract tests concurrently without launching multiple Electron instances.

## Cockpit and division of work

The left rail owns run selection and launch draft. A resizable run pane in the
existing bottom activity area owns transcript, final answer, **Send to this
run**, and **Stop**. Source and graphs remain mounted. Inspection does not
retarget global focus; an explicit **Reveal launch focus** action can do that,
with the usual ambiguity/staleness handling. Instruments can show launch
context/access/provenance when requested, then return to source context. Do not
replace the global palette with a meta-agent. Queue remains honestly absent;
another launch is `BUSY`, not a secretly scheduled second task.

The runtime department owns the shared schema/bridge seam and process lifecycle;
the workbench department owns only React run components/state/styles and its
tests; the evidence department owns context preparation, controlled-profile
preflight, fixtures and virtual acceptance. Before parallel edits, runtime
publishes a small contracts-only base commit with strict schemas, adapter/context
interfaces and unavailable behavior. The other two branches start from that
commit. They then work independently against fixtures/interfaces; see the plan
for exact paths and 30–60-minute slices. Runtime is integration lead, not the
owner of everyone else's implementation. Shared-file edits are requested from
that owner, never independently merged conflicting stubs.

Firm deferrals: write-enabled runs and approvals, Claude adapter, embedded native
harness UI/PTY, multiple active runs/automatic task queues, follow-up turns or
provider resume/fork, durable steering retries, speculative branches/integration,
automatic context-graph/MCP assembly, recursive planners, deployment controls,
agent-attributed diffs, generated recap agents, cost/health inference and general
layout configuration. They remain roadmap items, not placeholders masquerading
as supported actions. ROOT need not settle an irreversible platform choice to
approve this wave; it should know that the first demo analyzes and steers, and
does not yet edit source.
