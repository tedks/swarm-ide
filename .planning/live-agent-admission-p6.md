# P6: finite admission contract for the first live read-only run


## Purpose / Big Picture


Deliver two reviewed documents that let the next implementer determine exactly
why a first real run is unavailable, what evidence would change that answer,
and which bounded slice to do next. The user-visible destination is analysis of
a confirmed disk file beside the existing source editor and persistent graphs,
with live steering, honest Stop receipts and retained history. This step changes
no product behavior and performs no auth, probe, model turn or GUI action.

The companion `docs/live-agent-admission.md` defines `sealed-context-v1`: a fresh
immutable Codex configuration and private process environment, explicit prepared
context only, no model-callable tools, no imported user settings/credentials,
and no real network until separate acceptance. This narrows filesystem discovery
for the first release deliberately; canonical repo references remain navigable
by the human and future bounded read tools remain on the roadmap.


## Progress


- [x] (2026-09-06 14:10Z) Created designated worktree/branch from reviewed PR30 merge; read contracts, planning instructions and P5 evidence; started Ditz slice.
- [x] (2026-09-06 14:23Z) Pushed draft 6647ff1 / PR34: exact blocked profile, finite gates and next-slice decision using pinned source/current official interface docs.
- [x] (2026-09-06 14:30Z) Native OpenAI and Google identified bootstrap accounting; native also found initialize/auth ordering and normal-turn HTTP-only gaps. Fixed f39cc2f.
- [x] (2026-09-06 14:38Z) Native steering fix-delta finding resolved in bbb82fe. OpenAI and Google convergence CLEAN; Anthropic actual usage-credit exhaustion is MISSING, not approval.
- [x] (2026-09-06 14:38Z) Local only-two-document, whitespace, relative-link, cited-symbol and evidence-identity checks pass; no new product tests/GUI/probes performed.
- [ ] Normal merge and Ditz design closure: held for ROOT clearance of C2 merge dbe457d, now on remote master. Do not consume uncleared aggregate; independent design work is complete.
- [x] (2026-09-06 14:40Z) Publish reviewed/pushed design handoff, exact landing hold and retained resources; no successor dispatched.


## Surprises & Discoveries


P4's catalog warning is narrower than a universal plugin-disable failure.
`remote_plugin=false` alone still permits featured warmup when plugins are on;
the pinned `plugins=false` gate covers that startup branch. This is a source
finding to test under the proposed profile, not retroactive installed proof.

The existing built-in OpenAI provider does not accept the synthetic provider's
WebSocket/retry overrides. Startup prewarm builds a prompt before the regular
turn. A relay denying that traffic is containment, not effective disablement.
The first live gate therefore needs a real harness compatibility decision, not
another unrelated hook example.

Pinned source has in-memory `AuthCredentialsStoreMode::Ephemeral`, while fetched
public configuration docs list file/keyring/auto. External `chatgptAuthTokens`
is marked internal/experimental in the pinned protocol. Neither is grounds to
read the operator's auth cache or promise supported production authentication.


## Decision Log


Decision: select sealed, explicit context-only analysis for the first live
increment. Rationale: it remains useful in the existing cockpit while making
source disclosure and configuration closure finite. Do not mount a supposedly
frozen live repository. Date/author: 2026-09-06, P6.

Decision: propose the existing OpenAI built-in provider and Codex-managed
device-code authentication with process-local credentials, subject to explicit
ROOT/operator and installed-version gates. Rationale: do not require a new
billing account, scrape tokens or make a synthetic provider a production type.
Date/author: 2026-09-06, P6.

Decision: distinguish disabled behavior, independent containment, per-process
identity and credentialed acceptance. Rationale: successful P5 fixture responses
do not transfer across changes in configuration/auth/transport/lifetime.
Date/author: 2026-09-06, P6.

Decision: recommend one bounded native-provider transport-control proof before
building a credential relay. Rationale: an unsupported pre-turn control is a
known dependency that no broker or additional hook sentinel can remove.
Date/author: 2026-09-06, P6.

Decision: require a durable pre-spawn setup journal and exclusive crash-safe
claim into the confirmed run, initialize before auth, and HTTP-only normal
turns as well as disabled prewarm. Rationale: independent reviews exposed
unaccounted login lifetime and transport-ordering gaps. Date/author:
2026-09-06, P6 after native OpenAI/Google review.


## Outcomes & Retrospective


Delivered outcome: two reviewed documents in PR34, substantive head bbb82fe;
native OpenAI and Google CLEAN after fix-delta rounds, Anthropic unavailable
because of actual usage-credit exhaustion. Local documentation checks pass.
Normal merge is deliberately held: remote master now includes C2 normal
dbe457d77c44ef944c9af9fcd2663044bcc602ec, but ROOT's authority ledger currently
clears only c9e9a74/P5. An ownership request records the exact remaining gate.
The design Ditz slice remains in progress until landing; broad policy/first-run
parents remain open. Nothing is activated and no successor is dispatched.

Google's source-table wording nit was fixed. Its dense comparison-table nit is
tracked in `live-agent-gate-ledger-readability`: retain the finite comparative
map here, render concise per-gate evidence when implementing. The recommended
native-provider work is filed as `live-agent-native-provider-controls`, not
started. Current PR CI is reported in the ignored handoff, never conflated with
P5's passing local baseline or declared hosted green.


## Context and Orientation


The repository uses Nix and Bazel. `app/renderer/agents/` contains the cockpit;
the sandboxed renderer communicates over strict `protocol/agents.ts` contracts.
`core/agents/context.ts::RegisteredAgentContextProvider` prepares disk context
and revalidates fingerprints/digests/expiry. `core/agents/service.ts::AgentService`
persists admission and instruction receipts, deduplicates and preserves unknown
outcomes. `core/agents/file-store.ts` owns private bounded durable history.
`core/agents/codex-app-server.ts` implements the fixed JSONL transport and
thread/turn correlation; it currently proceeds directly from thread checks to
turn dispatch. `core/agents/owner.ts::createOwnedCodexTransport` owns a private
PID lifetime but inherits environment and is not the offline filesystem/network
boundary. `core/agents/policy.ts` returns unavailable policy; its thread-policy
validator proves only echoed cwd/readOnly/networkAccess:false/never.
`core/agents/production.ts` intentionally composes an unavailable adapter.

`tools/policy/` is an offline test harness, not production. P2 supplies 26
independent boundary checks; P5 adds ten endpoint/trust/lifetime checks and a
fixed synthetic response. All those are bounded evidence about particular
inputs. Source is cached at
`master/artifacts/overnight-wave/policy/source-audit/codex`, pinned upstream
commit `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`. Do not launch that source,
installed Codex or probes in this documentation step. P5 handoff and current
ROOT authority are outside the tracked checkout; the required evidence and
limitations are restated in the companion document so this plan stands alone.

Read-only here forbids source/build/deploy/Git/Ditz mutation by product agents.
It is not secrecy from the selected provider: the confirmed context is disclosed
for inference. Normal source editing by the human still belongs to the IDE.


## Finite Acceptance and Dependency Map


Each gate has one of three outcomes: proved for exact identities, unavailable
with a named missing mechanism, or failed with a counterexample. Only the first
admits its dependent stage. Gate closure never means “no sentinel happened.”
Unknown capabilities or new input-loading paths reopen a gate. Implementers
must not replace missing disablement with containment.

| Gate and owner | Enforcement mechanism | Current proof and limit | Missing proof / rejecting condition | Bounded completion |
| --- | --- | --- | --- | --- |
| G0 Profile closure — Policy, future new profile module/tests under `tools/policy/` | Manifest of every config/loading path, immutable inputs/ancestors, strict parse, source-mapped feature/alias resolution | P2 hostile config/aliases; P4 one plugin; P5 one hook. Not a whole target profile | Extra layer, inherited alias, hook source, unknown schema/default, cloud update or writable policy ancestor rejects | One exact manifest plus negative mutations; each loading family in companion table either has proved exclusion or exact blocking mechanism |
| G1 Required disablement — Policy | Actual capability gates for all forbidden tools/auxiliaries and startup/retry effects, independently distinguished from blocked effects | Named static MCP/plugin/ordinary-hook controls; no comprehensive observer, telemetry/notify/executor/cloud closure unproved | Any forbidden reachable activation or missing observation; builtin prewarm/retry controls not established | Finite family controls below; unknown mechanism yields an unavailable report, not indefinite experiments |
| G2 Independent containment — Boundary/Runtime | Private mount/user/PID/network/IPC namespaces, scrubbed env/FDs, immutable runtime, owned lifetime, separately tested relay | P2 26 and P5 10 for synthetic offline arrangement; R2/I2 lifetime separately | New mount/network/auth/process path not tested, replaced inode/ancestor, namespace unsupported or cleanup unknown rejects | Repeat original meanings on exact joined production-shaped synthetic envelope, including owner SIGKILL/deadline/output overflow; no leftover members |
| G3 Auth and policy transition — ROOT/operator then Policy | Approved managed device flow, isolated process-local credentials, phase-specific route, exact account/requirements freeze | Source-backed candidate only; no credentialed evidence or auth inspection | No supported storage/route/freeze, new account/billing assumed, token bridge/log leakage, changed requirements/account rejects | Synthetic auth/refresh/failure controls before any explicit real account authorization; real credentials are a later gate |
| G4 Per-process admission — Runtime | Durable pre-spawn setup record; exclusive setup/run slot and crash-safe one-use claim; exact context/process/profile binding | R2/A1 run receipts and R1 thread checks, not bootstrap/claim binding | Unresolved setup/claim, stale or wrong identity, missing inspection, TOCTOU or replacement rejects | Journal/claim fault injection and adapter/owner join; initialize before auth; reject until predecessors proved |
| G5 Full synthetic equivalence — Evidence/Runtime | Exact production-shaped adapter/service/boundary with fake credentials and fixed network responses, no external inference | I2 external fixture and I3 real cockpit separately; P5 fixed isolated Codex turn separately | Different provider/config/env/mount/lifetime, unobserved request, tool dispatch, ambiguous cleanup or hidden retry rejects | One joined positive journey and enumerated negative cases using owned virtual desktop; real and synthetic route difference explicitly itemized |
| G6 Real acceptance — ROOT only | Explicit account/disclosure/run authority, exact admitted process, bounded allowed service traffic | None. Production remains unavailable | Any unproved prior gate, unsupported auth/model/effort, hidden disclosure, source/config drift or unknown cleanup rejects | One live read-only analysis and steering; explicit separate Stop run only if necessary; actual history/process/relay closure. No replay or write agents |

G0 and G1 share a finite inventory, not an invitation to test arbitrary plugin
implementations. There are seven activation families: ordinary/managed hooks
and legacy notify; plugin/built-in/executor contributions; static MCP/apps;
shell/code/web/browser/delegation tools; remote-control/persisted state;
telemetry/feedback/update; native-provider startup/retry/auth/cloud side effects.
For the first six, use the exact loading/trigger table in the companion document.
A source-excluded entry requires independent immutable-path/input evidence and
an actual matched positive opportunity for the mechanism where observation is
needed. P3/P4/P5 count only for their already named paths. Remote-control policy
must be managed `allow_remote_control=false`, not a removed feature flag.
Executor discovery must account for the restricted-filesystem fallback despite
its feature flag. Telemetry requires a disabled exporter/analytics path, not an
outbound denial. The last family is the recommended next slice below because
the intended built-in provider differs decisively from the tested fixture.

The true ordering is G0/G1/G2 plus G4's durable setup ownership before any new
startup; initialize before G3's independently accepted bootstrap; account-bound
final G0/G1 inspection before G4's exclusive claim and generation gate; then G5; then
separately authorized G6. A prerequisite is allowed to finish with an exact
unavailable result, but downstream execution stays blocked. T1 task reading,
T2 task UI and C2 hosted prerequisites are independent work; none is a reason to
delay or enlarge this design. T3 task composition is not a live-agent policy gate.


## Plan of Work and Milestones


### Milestone 1: a reviewable exact proposal


Create only `docs/live-agent-admission.md` and this file. Read actual local
interfaces and pinned source. Explain sealed context, every loading path, auth
proposal, transport constraints, ordinary design choices and new authority.
The observable result is a reviewer able to point to the exact gate blocking a
proposed launch without asking which kind of agent or graph is meant. No source
or configuration changes are permitted by this milestone.


### Milestone 2: independent review and landing


Commit/push the two documents and open a draft PR early. Give the same text to
an independent native OpenAI reviewer and foreign Google/Anthropic reviewers
via council-review/ask-agent. Review security claims, source anchors, finite
exit conditions and whether a proposal is mislabeled as evidence. Resolve
Important findings, review fix deltas, and record unavailable foreign seats
without substitution. Validate actual links/symbols, only-two-file scope and
diff whitespace. Normal merge through the PR after the docs gate; do not
claim new build/GUI results for unchanged product code. Report actual hosted CI.


### Recommended successor: P7 native-provider pre-turn control closure


This is a recommendation for ROOT, **not dispatch authority**. Before building
auth/relay/UI, settle whether the exact built-in OpenAI provider can meet the
profile's startup and retry prohibition. The present source shows WebSocket
prewarm selected by provider capability and built-in provider overrides ignored.
Do not spend another slice rediscovering that fact or merely denying the socket.

Recommend a bounded **Codex harness control** increment: explicit disablement
of model prewarm before the adapter's first-turn gate, effective HTTP-only
transport for normal turns, and zero generation retries, all honored by the
built-in provider. Prewarm sends `generate=false` in pinned source and is not
inference, but it still sends framing/prompt bytes; do not call it effect-free.
Disabling startup prewarm alone leaves normal-turn WebSockets enabled.
Prefer an upstream-supported control
if its exact inspected release supplies it. Otherwise ROOT must designate a
separate pinned Codex-source worktree and authorize a minimal local patch/build;
this is not permission to edit the shared cached audit source, upgrade global
Codex or introduce a custom model provider. Such a patched package changes every
binary identity and must re-enter G0/G2 before any product use.

The narrow upstream areas are `codex-rs/core/src/session_startup_prewarm.rs`,
`codex-rs/core/src/client.rs`, `codex-rs/model-provider-info/src/lib.rs` and their
existing tests, plus only the
minimum explicit configuration/schema plumbing needed for those controls. ROOT
must lease exact files after checking the source revision. The Swarm-side owner
may add a new `tools/policy/native-provider-contract.mjs` and new focused tests
in a later authorized branch; no current production capability is changed.

Acceptance is finite: using synthetic credentials and an independently accepted
private endpoint, the builtin provider's thread creation produces **zero prewarm
requests**, a single explicitly allowed **unsteered** turn produces one HTTP request/response
and zero attempted WebSocket upgrades, and
transport disconnect/5xx/partial-response controls produce no second request or
turn. A matched prewarm-enabled control proves that the witness can observe the
forbidden opportunity. Controls must distinguish no attempt from denied attempt;
no auth/service is contacted. Review the new independent endpoint boundary
before actual installed turns. Keep the existing P5 provider separate. If a
supported/patched control cannot be supplied in the bounded slice, publish the
exact source-level unavailable stop and return to ROOT; do not investigate new
auxiliary families. Auth/cloud freeze and telemetry remain separate G1/G3 work,
not implicitly cleared by this transport proof. P7's unsteered one-request
control is not evidence for the complete steered journey. G4/G5 must separately
prove bounded one-use continuation permits tied to durable steering intents and
the same turn, including acknowledgement races and no-reuse after uncertainty.
One app-server turn is not necessarily one model HTTP request.

This successor depends only on ROOT's harness-worktree/patch authority and a
properly reviewed synthetic boundary for that exact package. It does not depend
on T1/T2/C2 or require credentials. Do not substitute a lower-level transport
firewall as proof of disabled native prewarm, and do not assume P5's no-WebSocket
fixture proves native behavior.


## Concrete Steps


All P6 repository work is in
`/home/tedks/Projects/swarm-ide/live-agent-admission`, branch
`docs/live-agent-admission`, based on reviewed
`207637c6c73a425a3cf442f93642eb690bca7c06`. Read-only source/gh inspection and
ordinary review-agent use are allowed; auth config/keyring reads, probes, model
turns, GUI and product implementation are not.

Run documentation checks from that worktree:

    git diff --check 207637c6c73a425a3cf442f93642eb690bca7c06...HEAD
    git diff --name-status 207637c6c73a425a3cf442f93642eb690bca7c06...HEAD
    git status --short

Expect exactly two added files and no tracked dirty work after commit. Verify
each relative Markdown link exists and each cited local/source symbol using
`rg`, not a compiled program. Source inspection must use the pinned commit,
not upstream HEAD. Record command results in ignored handoff evidence.

Use `nix develop --command ditz` for metadata commands. The deterministic issue
is `live-agent-admission-contract-p6`, blocking `agent-run-effective-policy` and
`first-real-agent-run-surface`; close only this design after actual review and
landing, then sync. `git pull --rebase` applies only to this own pushed feature
branch, never watched master. Push granular commits; normal-merge the PR after
review and local docs verification. Consume newer base heads only if ROOT has
cleared them in the authority ledger; remote master membership alone is not
clearance. Do not alter shared integration or anyone else's worktree.


## Validation and Acceptance


P6 is complete when the two docs are independently reviewed, source/link/scope
checks pass, the normal merge and pushed clean branch are verified, and Ditz and
sanitized handoff match the actual evidence. No new product test counts may be
attributed to this docs step. Preserve P5's exact baseline and failed hosted
status; a docs PR's actual CI status must be reported separately.

The design must let a reviewer reject concrete counterexamples: a hooks=false
profile with legacy notify; plugins on with only remote_plugin off; removed
remote-control flag treated as prohibition; a pre-auth capability used after
cloud reload; a readonly thread reply from another process; a copied OAuth
cache; a blind hostname tunnel called payload enforcement; a native prewarm
called effect-free because it is not inference; an ambiguous receipt retried
after restart. It must state
the loss of filesystem discovery explicitly and preserve model choice, source
focus, immutable disk context and separate terminal/cleanup evidence.


## Idempotence and Recovery


Documentation and Ditz commands are repeatable within the designated branch;
do not create duplicate issues or replay a completed department. Preserve all
worktrees, branches, sessions and evidence. Stop only owned review processes.
No product/core/app is started or stopped. If review requires a third tracked
file or implementation, stop for ROOT's scope decision. Unsupported live
mechanisms keep the product unavailable, not the documentation unfinished.


## Artifacts and Notes


Write a concise seam to `/tmp/swarm-ide-live-contract-p6.7klaR5/seam.md` and final
sanitized handoff to
`master/artifacts/overnight-wave/live-contract-p6/handoff.md`. Include exact PR,
topic/normal-merge identities, review outcomes, actual local documentation and
CI status, Ditz, cleanup and the one next slice. No credentials/raw transcripts
or user context in evidence. The final marker belongs at the start of the
entire last response; the external structured watcher wakes ROOT.


## Review Clarification: Steering Is Not Retry


Native fix-delta review found that a blanket one-request-per-run limit would
break the promised steering workflow. The corrected profile permits an initial
request and bounded explicitly authorized steering continuations, never retries
or a second app-server turn. Continuation permits are reserved against durable
steering intent before forwarding the RPC, because generation may race its ack.
Unknown/rejected delivery does not create a reusable permit. G4/G5 must prove
correlation and cleanup; missing evidence remains unavailable. This is a design
correction, not a new implementation in P6.


## Interfaces and Dependencies


This step creates no runtime interface. The proposed manifest and one-use
admission binding are core-only future concepts, not additions to
`protocol/agents.ts`. Future G4 must join `RegisteredAgentContextProvider`,
`AgentService`, `createCodexAppServerAdapter` and the independent owned boundary
without weakening receipt persistence or no replay. All source/schema/provider
changes require their own ROOT-designated owners and tests. Real credentials,
relay trust, patched harness adoption and G6 are separate authority gates.

Revision note, 2026-09-06: initial P6 design makes the intended native provider,
auth transition and pre-turn transport mismatch explicit, so the next step can
close a finite dependency rather than accumulate disconnected auxiliary cases.

Revision note after review, 2026-09-06: durable bootstrap/claim accounting,
initialize-before-auth, HTTP-only normal turns and bounded steering continuation
permits close all review findings. This final accounting records the actual
ROOT aggregate landing hold rather than claiming an unperformed normal merge.
