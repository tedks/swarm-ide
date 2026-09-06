# Prove one ordinary SessionStart hook with a synthetic response

This living ExecPlan follows `.planning/PLANS.md`. Update Progress, Surprises &
Discoveries, Decision Log, and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture

Swarm IDE must not launch a real agent while auxiliary execution policy remains
unknown. P5 tests exactly one ordinary hook: a fixed command triggered when a
new session's first turn begins. The manually selected proof uses installed
Codex 0.153.4 but serves fixed text inside its private network namespace. This
is an actual protocol turn and synthetic sampling request, not model inference.
No credential, real provider, user source, product availability or desktop
adoption is part of the proof. If a prerequisite cannot be defended, deliver
the exact stopping boundary instead of a passing placeholder.

## Progress

- [x] (2026-09-06 07:24Z) Inspect pinned source/provider/trust paths and complete installed package manifests; identify a source-feasible no-auth single-response route and immutable trust seed.
- [ ] Independently verify fixed listener, hook/trust ancestry and owned lifetime, then obtain boundary review before any installed Codex turn.
- [ ] Execute exactly matched enabled/disabled controls or document the exact source-only stopping boundary.
- [ ] Complete relevant local acceptance, council convergence, Ditz and normal PR landing; archive exact tested identities.

## Surprises & Discoveries

Zero HTTP and stream retry limits do not disable connection retries: pinned
`features.unbounded_connection_retries` defaults true and must be false.
SessionStart is queued during thread creation but executed at
`codex-rs/core/src/session/turn.rs:264`, before shell speculation. A startup-only
absence is therefore meaningless. Hooks trust hashes normalized command
configuration, not executable contents; both need independent immutable inputs.
`include_environment_context=false` prevents a separate environment user-message
item, allowing strict validation of the sole fixed synthetic user prompt.

## Decision Log

Decision (2026-09-06, P5): trusted host/operator/kernel and immutable Nix store
are explicit assumptions. Defend inherited credentials/configuration, mutations,
unknown cleanup, missed opportunity, duplicate or malformed requests and output.
No same-account-hostile-harness or reproducible-build attestation is claimed.

Decision (2026-09-06, P5): retain every original 26-check meaning and old P3/P4
request allowlist. A new manual profile adds a fixed private loopback responder,
new input checks and lifetime evidence. Existing empty-route/port9 checks do not
certify this listener. A missing/untrusted/broken hook is not exclusion proof.
Before an installed turn, independent tests and review must establish the new
boundary. Failure is a stopping point, not permission to change capabilities,
host networking, trust bypass or writable policy ancestry.

## Outcomes & Retrospective

Feasibility is source-based only so far. No installed turn or response delivered;
production remains `ADAPTER_POLICY_UNAVAILABLE`. The owned implementation and
acceptance below are not yet delivered.

## Context and Orientation

`tools/policy/probe.mjs` materializes synthetic files and owns Bubblewrap, the
Linux tool that gives a process private filesystem/network/PID namespaces.
`boundary.mjs` supplies its fixed mounts/environment/output/deadline limits;
`inner.mjs` tests the inside view. Existing manual static/plugin MCP controls
must remain unchanged. P5 work is confined to this package, new focused tests,
this plan and `docs/agent-launch-profile.md`. I3 owns integration and the shared
agent plan; T0 owns task contracts; W4 owns graph camera changes.

Pinned source is `rust-v0.153.4`, commit
`3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`, cached at
`master/artifacts/overnight-wave/policy/source-audit/codex`. Source paths below
are relative to its `codex-rs/`. Installed package manifests report 0.153.4,
layout1 and the complete x86_64-unknown-linux-musl Codex/companion layout.
Hashes identify observed bytes, not a signature or source-build attestation.

## Plan of Work

Milestone one fixes the profile and tests its independently enforced boundary.
The provider is uniquely named `policy_p5_text_once`, HTTP Responses only,
`requires_openai_auth=false`, `supports_websockets=false`, no auth/env/bearer
fields, `request_max_retries=0`, `stream_max_retries=0`,
`stream_idle_timeout_ms=2000`, `unbounded_connection_retries=false`.
Code-mode/shell snapshot prewarming and agent identity are disabled. Empty
credentials make source auth-prewarm local unauthenticated setup, not inference;
do not claim that no prewarm function is entered. Memories/notify/plugins/MCP
and other hooks remain absent/disabled. Synthetic work root is `/work`.

One ordinary hook is declared in `/home/probe/.codex/hooks.json`, matching
`startup`, command `/runtime/bin/node /fixture/sessionstart-canary.mjs`, timeout2,
async=false. Its exact key in user config is
`/home/probe/.codex/hooks.json:session_start:0:0`. Its trusted_hash is sha256 of
compact UTF-8 canonical JSON, recursively sorted object keys and no newline:

    {"event_name":"session_start","hooks":[{"async":false,"command":"/runtime/bin/node /fixture/sessionstart-canary.mjs","timeout":2,"type":"command"}],"matcher":"startup"}

Preseed only that synthetic hash in the immutable user config. No host trust
record or trust RPC/bypass is used. `hooks/src/config_rules.rs:15-65` admits this
state from User/SessionFlags only; `engine/discovery.rs:713-820` compares exact
normalized hashes before adding handlers. `config/src/fingerprint.rs:50-79`
defines serialization. Trust does not hash the canary program: pin it separately.
Read-only config loading/discovery does not write trust before execution.

Milestone two runs the actual comparison only after boundary review. Permit
fixed initialize, initialized, thread/start and one turn/start per case. Fixed
user prompt is `Synthetic policy SessionStart probe.`; final text is
`POLICY_P5_TEXT_ONLY`. The responder accepts only bounded POST /v1/responses
inside the same private namespace, at fixed port43129, no auth/proxy/redirect/
WebSocket/configurable endpoint. One finite text-only SSE response then EOF;
extra/malformed/incomplete requests fail without retries or another response.
The provider name/model echoed are fixture configuration, not a model run.
Only `features.hooks` differs between the paired controls. Both must complete
the matching turn, deliver exactly one response and close cleanly. Positive
hook witness must actually appear; disabled witness must be absent. No tool
response/call, extra turn, Stop continuation or implied attempt observer.

Milestone three records exact behavior or the stopping point, then applies
local gates/review and normal PR landing. No successor is self-dispatched.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/agent-policy-sessionstart`, branch
`feature/agent-policy-sessionstart` from reviewed `3c50d7f`. Materialize with
`nix develop --command pnpm install --frozen-lockfile`. Use Bazel with --jobs=3
for every build/test. Manual actual-package targets must remain outside default
`//...`; no normal test starts Codex. Full suites and any GUI use
`flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` with owned X11/55174
only. Never touch physical DISPLAY=:0, watched55173, unrelated5173 or peers.
Exact new commands will be recorded with delivered targets, not invented here.

## Validation and Acceptance

Before Codex: preserve 26 checks, add immutable hook/helper/trust ancestry,
internal listener positive, host/outbound negative, no credential/fd/capability
leak, and independent responder/canary/descendant owner-death/deadline/output
cleanup. Confirm actual observed package bytes unchanged. Then matched controls
require syntheticTurnExecuted and localResponseDelivered, precise request counts,
externalModelInference=false and productionAvailable=false. Negative tests must
reject malformed/late/incomplete/extra/tool output and absent positive evidence.
Never infer zero attempted catalog/telemetry effects from network denial.

Run all relevant local gates and available provider-diverse council to clean
convergence before normal merge. A source-only stop changes no runtime target and
uses proportionate documentation validation/review; it cannot claim new boundary
or hook activation tests. Hosted status is reported literally; the conditional
local-CI waiver is not CI green. Broad policy/activation parents stay open.

## Idempotence and Recovery

Use unique owned temporary fixtures; remove only after confirmed cleanup and
retain on uncertainty. Keep immutable inputs and the exact installation_id inode
exception; no global configuration or key acquisition. Retain clean pushed
worktree/branch, sanitized evidence and step state for ROOT retirement.

## Artifacts and Notes

Record concise coordination in `/tmp/swarm-ide-policy-p5.D4hXLh/seam.md` and
sanitized evidence under `master/artifacts/overnight-wave/policy-p5/`.
Ditz slice `agent-run-sessionstart-policy-p5` blocks the offline activation
parent. Scope can finish as a reviewed precise stopping boundary, but not as a
fictional activation certificate. I3 alone decides reviewed integration.

## Interfaces and Dependencies

No product interface changes. Reuse pinned Nix Node/Bubblewrap and existing
namespace/fixture functions. Fixed synthetic Responses bytes need no SDK/API key.
The official app-server/configuration/hooks pages map interfaces; source and
actual isolated observations, where permitted, supply evidence.

Revision (2026-09-06): state source-feasible new scope, immutable trust identity,
connection retry pitfall and mandatory independent boundary gate before coding.
