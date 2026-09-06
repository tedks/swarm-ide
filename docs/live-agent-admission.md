# First live read-only agent: sealed context profile

Status: **proposed, blocked; production remains `ADAPTER_POLICY_UNAVAILABLE`**.
This document defines one release profile, not a runnable command or an
authorization to authenticate. It refines the
[first-run contract](first-agent-run-contract.md), retaining its cockpit,
receipts, Stop, history and no-replay semantics. The
[bounded execution plan](../.planning/live-agent-admission-p6.md) contains the
finite admission gates and one recommended next slice.

## What the user gets

With a file open and both graphs undisturbed, prepare “Explain this interface's
inputs, outputs and failure cases,” inspect the exact disk attachment and
instructions, choose model/reasoning, and explicitly launch. Output appears in
the existing run dock. Steering addresses that same turn; Stop is a request,
not an assertion that work stopped. The run retains the submitted context and
observed result even when the working world advances.

The first release is **analysis of the confirmed context only**. It does not
give the model shell, filesystem-discovery, web, MCP, plugin or delegated-agent
tools. Source references are navigable by the human; following one does not
implicitly disclose it. To analyze another file, prepare and confirm a new run.
This is a deliberate narrower first increment, not the final intelligence
system: a later typed, bounded read-only repository-discovery tool can expose
canonical references with per-read provenance. That extension needs its own
tool and disclosure gates; it does not justify mounting the current live repo.

Repository configuration remains canonical for IDE behavior and explicitly
selected instructions. Harness configuration is a **compiled, inspectable
projection** of accepted settings, not arbitrary repo TOML fed to Codex.
Additive repo defaults and user model preferences must show their provenance;
none may grant a capability excluded by this profile. Docs are linked artifacts,
not forced into a universal graph. Run selection never steals source focus.

## Threat model and terms

Assume a trusted operator, host kernel, local core, installed runtime and Nix
store. Defend against hostile source/prompt content, ambient settings and
credentials, unexpected default capabilities, malformed provider messages,
changing inputs, lost acknowledgements and surviving descendants. This is not
protection against a hostile same-account process replacing the trusted core,
kernel compromise, guaranteed secret erasure from swap, or a complete CPU/memory
resource sandbox. Those limits must remain visible, not become implicit claims.

**Disablement** means a forbidden capability cannot be selected or activated
under the admitted profile. **Containment** independently limits effects even
if activation is attempted. **Identity binding** ties evidence to the actual
owned process, immutable inputs and lifetime. **Credentialed acceptance** proves
that this same admitted arrangement works with the intended account and service.
None substitutes for another. A denied catalog request is not a disabled catalog.

## Evidence baseline and its boundary

The reviewed base is normal merge
`207637c6c73a425a3cf442f93642eb690bca7c06` (PR30). P2–P5 describe their observations
in [agent-launch-profile.md](agent-launch-profile.md). P5's archived handoff is
`master/artifacts/overnight-wave/policy-p5/handoff.md` outside the tracked tree.
Its actual merged evidence is 29 build targets, all 10 uncached suites, 790 tests
in 60 files, and manual P3/P4/P5 controls passing. P6 did not rerun those tests.

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| P2 original 26 checks | Independent private filesystem/network/PID boundary, immutable fixture ancestry, explicit environment and lifetime checks; one private writable `installation_id` inode | Product composition, credential access, telemetry disablement, comprehensive resource limits |
| P3 | One static MCP definition's enabled/disabled/failure startup controls | Every tool source or complete syscall/attempt observation |
| P4 | One legacy cached plugin's MCP startup controls | Other plugin/executor paths; `remote_plugin=false` alone does not stop featured-catalog activity |
| P5 | One ordinary SessionStart hook: enabled 1/1 plus witness versus disabled 0/0; each completes a fixed synthetic turn | Other hook families, real provider transport or credentials |
| I2 / I3 | External deterministic process ownership through R1/R2; separately, the actual cockpit/context/store with a paced in-process responder | Installed Codex policy or real model readiness |

P5 ran two matched comparisons: **four synthetic protocol turns and four local
responses**, no external inference. Original 26 plus ten endpoint/trust/lifetime
checks passed. Its `gpt-5.2` value names a fixture, not an observed model.
Native OpenAI and Google reviews were CLEAN; Anthropic was unavailable. Hosted
topic and merge CI failed required namespace/pre-Codex seed-pipe prerequisites;
local waiver is not hosted green. One earlier failed synthetic scan retained
scratch because historical cleanup was uncertified; later absence does not
retroactively certify it.

## Exact proposed process envelope

Call this profile `sealed-context-v1`; the name is a specification identifier,
not a new provider type or a shipped schema. A core-only immutable manifest must
contain every value below. Missing values reject admission, not use defaults.

| Surface | Required value / boundary |
| --- | --- |
| Harness | Complete Codex 0.153.4 package with matching generated wire schemas, executable, companion and package-tree identities below; no npm launcher resolving a changing installation during a run |
| Runtime | Exact declared Nix closure and owner/launcher bytes; no entire host Nix store, host libraries or PATH search |
| Invocation | Core-owned absolute executable, `app-server --listen stdio:// --strict-config`; no renderer-supplied argv, executable, environment or raw RPC; no analytics-default opt-in |
| World | One core-registered working world; canonical absolute root and repo identity from `RegisteredAgentContextProvider`, never a user-entered cwd |
| Filesystem | Private mount namespace with an empty, readonly directory at that same canonical root, its empty readonly ancestors, runtime/package mounts and declared private state only; **no live workspace mount**, Git objects, host home, auth cache, `/run`, desktop or bus |
| Context | Existing bounded `submittedPrompt`, disk attachment/path/range/digest, task text and selected instruction bytes; copied and hashed before admission. The namespace cwd is an identity anchor, not a claim to expose the original repository |
| Configuration | One generated readonly user config, embedded package defaults identified by executable, one readonly generated system requirements file, explicit immutable instruction/model metadata files if used; all loading paths below enumerated |
| State | Fresh private tmpfs for logs/database/temp, separately mounted below fixed paths without writable config ancestors; private writable `installation_id` inode only. No imported sessions, plugins, trust, memories, remote enrollment, shell rc or `.env` |
| Tools | No model-callable tools, dynamic tools, shell/code mode, file discovery, web, browser/computer use, MCP, apps/connectors, delegation, automatic review or follow-up turns. A nonempty effective tool set or tool call rejects/stops; hiding tool messages is not enforcement |
| Network | Private network namespace; no direct outbound routes, DNS, inherited sockets, proxy variables or host listener. Only a separately accepted owned provider-transport relay may connect it to a fixed phase-specific service route |
| Auth | Proposed Codex-managed device-code login for the existing account, process-local ephemeral credential storage, no copied user credentials and no token through renderer. This is a **new explicit operator/auth gate**, not currently supported product behavior |
| Lifetime | One R2-owned server, one fresh ephemeral thread and one turn per admitted run; relay, auth operation and descendants belong to the same verified lifetime. No shared provider daemon, reconnect/resume or automatic replay |

Observed P5 identity values are initial comparison inputs, not a portable signed
allowlist or source-to-binary attestation:

    codex sha256: 56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da
    companion sha256: 3e85d67471825f73d02ff5f7e047ca1f6ca8caa3f59e4c6e8d9ca6ca7302cb45
    package tree: 19ff5b60eba372872203224c2ec26ea0097f2a4d4a26e8a92b6ff5208ce1bf1d
    runtime closure: 9173797fed2dd6716bbb154e1e0ebbd29e0615ae7c76a1532d8a0969b005f77a

The observed runtime was
`/nix/store/pq40cf0dyfjg6wpmwx0n83wydfxzywpq-swarm-offline-policy-runtime`.
Any package, companion, runtime, schema, launcher, manifest, instruction,
requirements, network policy or model-metadata change invalidates acceptance.
An update requires new evidence; a matching version string is insufficient.

The current adapter's direct stdio fallback inherits the environment and cannot
prove descendant cleanup. `createOwnedCodexTransport` establishes PID ownership
but still copies `process.env` and does not install P2's mount/network boundary.
Neither is this envelope. Production integration must join the independent
boundary with R2 ownership, not mark either existing helper sufficient.

## Loading-path closure: construction is a proposal, not evidence

The manifest generator must reject undeclared settings instead of silently
stripping them. Enumerate the pinned schema's effective capability values,
including aliases (`connectors`, `collab`, `codex_hooks`) and structured
`multi_agent_v2`; no empty-table override or “all flags false” string is a proof.
Require all relevant effective feature pages, matching cwd and requirements.

| Loading family | Proposed closure and required verification |
| --- | --- |
| Package/system/user/profile/project/runtime config | Pin embedded defaults; construct `/etc/codex/config.toml`, `requirements.toml` and legacy `managed_config.toml` as exact manifest inputs or proven absence. Pin `$CODEX_HOME/config.toml`; no selected user profile. Empty canonical cwd/ancestors exclude project config and Git-root discovery. Only allowlisted core flags. Prove every path and ancestor immutable and verify actual loaded layers, including omissions from `config/read` |
| Cloud/managed configuration | Do not bypass legitimate account requirements by hiding them. Before thread creation, acquire and approve the account's exact requirements through a separately accepted auth route, then bind/freeze them. A cloud reload or extra instructions not in the manifest rejects. Stock CLI's loader does not presently supply our required atomic freeze; this is a blocking seam, not an implemented flag |
| Instructions/skills/rules | Only confirmed bounded instruction text, identified embedded base instructions and pinned model metadata. No automatic user/project AGENTS, skills, execpolicy rules, memories or `.env` imports. A response listing no instruction paths is not proof of complete prompt expansion; validate outbound structural inputs and loading paths |
| Static MCP/apps/delegation/tools | Empty source definitions by construction plus effective disabling, aliases resolved. Inspect complete initial and thread-scoped sets. Disable shell/code/prewarm, browser, search, apps, multi-agent/guardian and dynamic-tool routes. Reject extra tools or requests before external delivery |
| Plugins and catalogs | Effective `plugins=false` **and** `remote_plugin=false`; no caches/install metadata/overlays. Pinned `PluginsConfigInput` passes these gates into startup. P4's positive `plugins=true` can still fetch featured plugins with only remote_plugin off; do not misstate it as proof that plugins=false still fetches |
| Hooks/notify/executor sources | Ordinary `hooks=false` plus no hook/trust/state files; explicit `notify=[]`, not merely hooks off. Disable plugin/built-in sources independently. No managed hook definitions, trust bypass RPC or executor-supplied sources. For pinned local executor, capability discovery must be false and logical read policy must not cause the restricted-filesystem discovery fallback; OS mount containment is independent of that logical policy. Never expose more host files to satisfy a logical-policy check |
| Remote control and persisted state | Fresh private state plus managed `allow_remote_control=false`, no enable/enroll/config-write RPC. `features.remote_control` is a removed feature, not prohibition; the daemon-internal disable environment variable is not a public production recipe |
| Telemetry/feedback/update | `analytics.enabled=false`, each of `otel.exporter`, `otel.trace_exporter`, `otel.metrics_exporter` set to `"none"`, `features.runtime_metrics=false`, `feedback.enabled=false`, `check_for_update_on_startup=false`; retain effective values through auth reload. Source disables queues/export providers/upload, not all local instrumentation or feedback ring buffers. Require actual runtime evidence. Independent egress denial remains separate; no telemetry endpoint is permitted merely because it shares a provider hostname |

For each family, closure means either a proved disabled reachable path or proved
absence of **every input/entry path** that could activate it under this exact
manifest. An empty directory, failed canary or absent notification alone closes
nothing. Source is a map to required installed controls, not their substitute.
Do not test every plugin ever written: test the finite loading mechanisms that
this profile either excludes or permits. A newly discovered loading mechanism
reopens the relevant gate, rather than silently expanding the allowlist.

## Credential and transport proposal: deliberately not ready

Choose the existing **OpenAI built-in provider**, not P5's synthetic provider or
a newly billed API account. Model and effort remain explicit user requests;
record provider-observed model separately, report unsupported effort and reroutes,
and never infer entitlement from ROOT's `gpt-6-astra` orchestration preference.

The preferred auth candidate is an explicit device-code login inside the same
owned server, with `cli_auth_credentials_store="ephemeral"`. The pinned source
implements a process-local in-memory store, but current public configuration
docs list only file/keyring/auto. Thus this combination needs exact-version
installed acceptance; it is **not yet a supported-public-interface claim**.
The human would approve login using their normal browser; the IDE may show the
validated verification URL and short-lived code, not bearer/refresh tokens.
No browser automation is part of this profile. No automatic fresh login on
recovery; a new run is a new explicit operation. Authentication must precede
prepare/confirmation of any account-derived instructions; otherwise expire the
draft and require fresh confirmation before generation.

This avoids reading/copying the existing account-wide auth cache or keyring, but
costs a login per fresh process unless a later separately approved persistence
design exists. The source-only experimental `chatgptAuthTokens` RPC is marked
internal-use-only at this pinned version; Swarm IDE does not already own that
auth lifecycle. It is **not the recommended token extraction shortcut**.
If ephemeral managed login cannot meet the gate, stop and offer ROOT a dedicated
Codex-managed credential-store design or a future supported host-auth interface.
Both require explicit authority and new evidence. A new API key/billing account
is an operator alternative, never an assumed fallback.

The proposed relay is a small trusted local-core component, not a generic proxy
or new model provider. It would terminate and validate bounded protocol traffic
inside the owned namespace and forward only exact reviewed routes over verified
TLS. This means it may handle credentials **inside the privileged boundary**;
that trust expansion and its secret-disclosure tests need ROOT approval before
implementation. No relay exists today. A blind CONNECT tunnel or hostname-only
allowlist cannot claim path, payload, retry or auxiliary-request enforcement.

Its route manifest must distinguish login/device polling/token exchange,
account requirements/model metadata, and generation. Pinned source names
`auth.openai.com` device-auth/token routes and `chatgpt.com/backend-api/codex`
for model service; those are source candidates, **not an approved live allowlist**.
Exactly required methods, paths, headers, TLS identity, response limits, DNS/IP
handling, redirects, retries and refresh behavior must be accepted with synthetic
credentials/endpoints before real use. No open redirects, fallback upstream,
WebSocket upgrade, arbitrary query/CONNECT, credential forwarding to a second
origin, unbounded polling or ambient proxy. Admission supplies a one-use route
capability bound to the run; authentication and generation have separate phases.
Extra traffic rejects and shuts down, not silently succeeds behind a denied route.

Three material blockers cannot be hand-waved away:

1. **Built-in transport differs from P5.** `create_openai_provider` enables
   WebSockets. `merge_configured_model_providers` does not override this built-in
   with custom retry/WebSocket fields. `Session::schedule_startup_prewarm` uses
   that capability and builds a prewarm prompt before a regular turn. Removed
   websocket flags and `code_mode_prewarm=false` do not disable it. The proposed
   profile requires no generation/prompt disclosure before the final gate and
   bounded, non-replayed generation. A rejected prewarm is containment, not
   proof that prewarm/retry behavior is disabled. A supported harness control or
   separately reviewed pinned Codex change is needed if the exact binary offers
   no effective mechanism; do not create a custom provider as a workaround.
2. **Authentication changes policy inputs.** Login installs/replaces cloud
   configuration and triggers post-login work. Pre-auth inspection cannot bless
   post-auth startup, nor can rejecting a managed requirement after its effects
   occur count as prevention. Freeze/reinspection needs an actual enforcement
   seam before these effects, not repeated `config/read` snapshots.
3. **Credentials create new exposure.** In-memory auth is not a proof against
   token logging, raw error propagation, dumps, relay leaks or account-change
   races. Those paths, lifetime and log redaction require actual negative tests.

## Admission, validity and recovery

The generation admission sequence is ordered; auth bootstrap is a distinct
pre-generation phase with its own independently accepted boundary. During this
phase no prepared source is sent, no provider thread/turn exists, no arbitrary
RPC or automatic browser is allowed. It cannot reuse a generic capability flag.

1. ROOT accepts the exact offline boundary, profile and any auth/relay extension
   before process startup. The core checks identities, immutable mounts, no
   ambient FDs/environment and verified lifetime readiness for this instance.
   Unsupported host controls or previous unknown cleanup reject before spawning.
2. Perform only the separately authorized auth bootstrap if needed; capture
   effective account requirements and close/freeze loading paths before allowing
   thread creation. Prepare/reconfirm disk context after any changed inputs.
3. Persist the R2 admission intent/receipt before generation setup/dispatch.
   Bind run ID, root/world, context hash, process/namespace identity, profile and
   dependency digests, account-policy epoch and lifetime token in core memory.
4. Initialize, inspect exact config/requirements and every effective feature/MCP
   page, then create one fresh thread only after startup is already safe. Check
   correlated thread policy, exact cwd, readOnly/networkAccess:false/never,
   effective tools and instruction expansion. Thread creation is not inert.
5. Immediately before `turn/start`, verify the same binding and unchanged
   prepared inputs; enable only the run's one generation route. Persist exact
   prompt bytes before dispatch. Later steering is bounded text to the correlated
   active turn, not a new turn/config change or broader data access.
6. Close relay/auth and owned namespace on terminal/cancel/deadline/core loss.
   Only independently confirmed cleanup permits another run. Terminal outcome,
   transport exit and cleanup remain separate evidence.

This requires a future core-only admission object, not a schema edit in P6.
`AgentCapabilities` is preview information; `validateCodexThreadPolicy` is
necessary-only. Neither authorizes another process or survives a generation
change. The current adapter goes directly from thread reply to turn/start and
has no such setup gate; production must remain unavailable until it does.

An instance binding is valid only while that exact process and immutable inputs
exist, within the existing ten-minute run limit. The prepared draft expires in
five minutes; time moving backwards rejects. Auth/bootstrap needs a separate
bounded timeout and must not extend draft validity. A change in auth account,
requirements, config, model metadata, package, runtime, process, bridge generation
or cleanup certainty invalidates unconsumed admission. An active run never
silently adopts those changes: stop it, retain confirmed terminal evidence or
unknown outcome, require explicit new preparation. Ordinary source edits after
dispatch mark “world advanced”; the retained submitted bytes stay historical.

Keep current limits: one active run, task/steer 16 KiB, attachment 64 KiB, total
explicit context 128 KiB; JSONL line 1 MiB, normalized record 64 KiB, transcript
8 MiB/run, store 64 MiB/20 runs. Bounds are UTF-8 bytes. No implicit history
deletion. Authentication and relay buffers need separate finite limits before
their implementation is accepted, not an exemption from these resource norms.
Intentional core replacement retains at most 1000 ms pending-ack grace; crash
recovery is immediate unknown. Stop waits at most five seconds before owned
termination. Neither ambiguous delivery nor exit zero means success or replay.

## Separate final real-credential acceptance

ROOT must explicitly authorize the exact reviewed identity/profile, chosen
existing account, allowed disclosure and one bounded live run. P6 authorizes
none of that. Reviewer/orchestration model requests are unrelated to product
authorization. Automated UI acceptance uses only the owned virtual desktop.

The final positive journey is one file's interface analysis in the real cockpit,
one correlated steering message when still active, terminal answer and retained
history with source/cameras unchanged. A separate explicitly authorized Stop
case is needed if the first run finishes too quickly; do not secretly replay to
obtain a screenshot. Independently confirm namespace/relay closure. Do not label
the answer correct merely because the turn completed.

Only confirmed task, disk attachment, selected instructions, validated necessary
provider framing/model metadata and explicitly sent steering text may leave as
model input. The authentication phase necessarily exchanges identity/credentials
with the exact auth service; these must not enter model prompts, run history,
renderer logs or evidence. No unsaved buffer, arbitrary filesystem discovery,
repo-wide upload or telemetry is implicitly allowed. Show the disclosure manifest
before launch; encrypted upstream traffic alone does not prove its contents.

Negative acceptance must include stale context, changed config/requirements,
wrong process/root, hidden tool/auxiliary activation, extra/redirected upstream
request, expired/wrong-account auth, output/storage exhaustion, core death and
unknown cleanup. Use synthetic credentials for adversarial transport cases;
real acceptance checks the reviewed profile's actual service compatibility.
Failure before possible dispatch is a setup rejection; ambiguous admission or
post-dispatch failure is `AGENT_OUTCOME_UNKNOWN`, with no automatic retry. A
policy gate failure never opens a broader permission or auth fallback.

## Source map and evidence discipline

Local source inspected is OpenAI Codex `rust-v0.153.4`, commit
`3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`; paths below are relative to its
`codex-rs/`. Source matching a version is not proof these binary bytes implement
it. Current official [app-server documentation](https://learn.chatgpt.com/docs/app-server)
maps managed/device and experimental external auth; the
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
maps public settings. Both were fetched 2026-09-06; pinned-source differences
above take precedence for this proposed installed profile.

Relevant anchors: `config/src/loader/mod.rs::load_config_layers_state` (all
layers/cloud requirements), `core-plugins/src/manager.rs::maybe_start_plugin_startup_tasks_for_config`
and `core/src/config/mod.rs::plugins_config_input` (plugin gates),
`hooks/src/registry.rs` and `core/src/hook_runtime.rs` (notify/executor),
`app-server-transport/src/transport/remote_control/mod.rs` (managed remote policy),
`config/src/types.rs::AuthCredentialsStoreMode`,
`login/src/auth/storage.rs::EphemeralAuthStorage`,
`app-server/src/request_processors/account_processor.rs::login_chatgpt_device_code_response`
and `login_chatgpt_auth_tokens_response` (auth/policy transition),
`model-provider-info/src/lib.rs::create_openai_provider` and
`merge_configured_model_providers`, `core/src/client.rs::responses_websocket_enabled`,
`core/src/session_startup_prewarm.rs::schedule_startup_prewarm` (transport),
`analytics/src/client.rs`, `core/src/otel_init.rs::build_provider`,
`otel/src/provider.rs::try_new`, and `app-server/src/otel_reloader.rs`
(disabled telemetry construction and post-auth rebuilding).
The companion plan records gate owners and exact stopping conditions.
