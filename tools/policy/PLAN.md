# Prove an offline boundary before probing configuration

This ExecPlan follows `.planning/PLANS.md`. The living sections below record the
bounded P2 boundary and P3 auxiliary activation implementation, not production authorization.

## Purpose / Big Picture

Developers can run `nix develop --command bazel run //tools/policy:probe` and get
bounded JSON identifying independently tested isolation and exactly which Codex
configuration observations remain unavailable. No provider thread or model turn
is created by that metadata mode. P3 adds an explicit `--activation` mode for
synthetic, ephemeral thread initialization only. No model turn is allowed in any
mode. This is a development acceptance harness, never a product adapter.

## Progress

- [x] (2026-09-06 05:20Z) P3: read inherited gates, official app-server documentation and pinned source; designated feature worktree starts from verified normal merge c52f959.
- [x] (2026-09-06 05:30Z) P3: actual installed required-stdio-MCP positive/negative controls pass across five fixtures; explicit fixed RPC allowlist rejects generation paths. Initial quality passes. Commit153b12b/PR22 enters council and complete local gates.
- [x] (2026-09-06 05:53Z) P3: bounded seed-pipe diagnostics and deterministic regressions; full first local7 targets passed476tests. Native Important found incomplete trace observation; actual teardown gap confirmed and unsupported observer removed. Six provider-reported/canary controls now pass, no independent syscall claim. Strengthened regression/full rerun and council convergence pending.
- [ ] P3: final local gates, council convergence, normal PR merge and handoff.

- [x] (2026-09-06 04:21Z) Read P1 evidence/contracts and establish basic unprivileged user/network/mount/PID namespace support.
- [x] (2026-09-06 04:38Z) Implement pinned isolated runtime, frozen synthetic inputs and independent boundary canaries; owner-SIGKILL/deadline/output checks pass.
- [x] (2026-09-06 04:49Z) Actual complete installed 0.153.4 metadata inspection succeeds after boundary acceptance; seven fixture cases and all eight expected counterexamples/coverage checks pass.
- [x] (2026-09-06 04:49Z) Native council identified four Important findings; fixed explicit Nix config/overlay isolation, actual complete layout admission, unknown-cleanup-before-hashing and trace-mode unavailable status, with regressions. Foreign/convergence review pending.
- [x] (2026-09-06 04:53Z) Added negative tests; full build22 targets and all7 uncached Bazel tests passed at83da50f (272 unit tests). OpenAI native and Google fix-delta CLEAN; Anthropic full-seat timed out600s with no review, explicitly missing. Remaining nits filed. PR17 records the eventual normal-merge transaction; final aggregate evidence is archived in the handoff.

## Surprises & Discoveries

Pinned 0.153.4 queues SessionStart hooks at thread creation but executes them
inside the turn path. It is not a no-model positive control. Thread startup can
also schedule websocket prewarm; both matched fixtures must source-verify and
disable that path before invoking thread/start. Source is a research lead;
installed process observations remain separately required.

Native review correctly rejected a live trace snapshot as complete evidence.
Requiring actual tracer close exposed nondeterministic unknown/detached records
at Codex teardown. Pinned process hardening disables dumpability, but no exact
causal proof is claimed. We removed the unsupported independent observer rather
than accepting incomplete traces or changing process hardening. Static MCP proof
now uses exact provider-reported startup/required-error witnesses plus actual
canary handshake and a bounded clean process/stdio completion barrier.

P1 found startup work occurs before inspection. Therefore even `config/read`
requires a separate operating-system boundary. Raw config is not complete
effective policy and no offline observation enables credentialed execution.

Actual startup first failed with EROFS. File-only strace localized nonfatal
CODEX_HOME/tmp alias setup and fatal CODEX_HOME/installation_id open-for-write.
The pinned source requires read/write/create even with a populated identity.
A private copied runtime-identity inode resolves this without writable policy
directories. Apps alias collisions, project/managed overrides and inherited MCP
table merging are now observed from the installed package, not inferred source.

## Decision Log

Decision (2026-09-06, P3): prove the smallest actual startup-triggered path,
required stdio MCP, with an executable fixed canary, provider-reported attempted activation,
successful initialization and matched disabled-server configuration. An absent
marker alone is never suppression proof. A required-server failure control must
reject thread creation. Broader hooks, executor plugins and persisted remote
control remain explicitly unproved; do not make policy ancestors writable or
invent a trigger to expand this slice. The trusted host/kernel/operator and
immutable package assumptions are unchanged. All 26 independent boundary and
lifetime checks must pass before each actual activation launch; immediate inner
checks also run before Codex. Deadline/output/unknown-cleanup or missing evidence
fail closed. Only initialize, initialized and fixed thread/start are permitted;
no externally supplied params, shell commands, inference, auth or real history.

Decision (2026-09-06, P2): use pinned Bubblewrap and Node through a new package
expression consuming the existing Nix lock; no shared flake dependency change.
Bubblewrap builds a private filesystem with explicit runtime mounts and private
network/PID/IPC namespaces, drops capabilities and supervises descendants.
Fixtures and their ancestors are readonly; logs/state have separate owned paths.
Trusted host/operator/kernel and Nix store are assumptions; hostile same-account
replacement of the harness itself is not a defended boundary.

Decision (2026-09-06, P2): allow one explicitly named installation-identity inode
as Bubblewrap-private writable runtime state. Its finite seed is synthetic, the
input pipe is closed/consumed before the program, and all ancestors stay readonly.
Tests require in-place writing but reject removal, replacement or config edits.
Runtime source imports explicit empty Nixpkgs config/overlays, independent of
ambient user customization; a rejecting synthetic NIXPKGS_CONFIG test proves it.
ROOT approved only the root quality_sources dependency and flake.lock export.

Decision (2026-09-06, P3 convergence): positive controls wait for named starting
and ready notifications and exact full canary handshake before stdin EOF. Every
case requires clean bounded process close/drain. Required-thread rejections may
lack notifications, so reached-init failure and absent-executable cases use a
named policy_canary error plus the actual canary record or ENOENT class. The
absent-executable fixture changes the executable itself, not a script argument.
Provider-reported attempts are not independent syscall counts. Unproved
independent observer support is a separate issue, and production remains closed.

## Outcomes & Retrospective

P3's final proof is deliberately narrower than independent syscall exclusion:
six actual static-MCP fixtures now distinguish reported startup plus full canary
handshake, successful disabled-thread creation, reached initialization failure,
and an absent executable. All26 independent boundary checks run before each
case. Focused final quality passed511 tests/42 files and actual activation target
passed after observer correction; complete final gates/council are pending.
The broad policy parent, credentialed process binding, persisted-state and
independent observer proof remain open. No product adoption or model turn.

Independent Linux boundary and real offline metadata/counterexample evidence now
exist. No hook/plugin/MCP activation exclusion or credentialed equivalence is
claimed. Ditz agent-run-offline-activation-proof tracks the next bounded proof;
agent-run-policy-harness-diagnostics tracks nonblocking diagnostics/resource and
protocol-drift limits. Reviewed R2/W2/E2 origin/master e443b38 was normally merged
without conflict into the topic for combined verification; no peer source was
independently edited and no integration checkout/app was adopted. Production
remains ADAPTER_POLICY_UNAVAILABLE.

## Context and Orientation

`tools/policy/` owns all implementation. `docs/agent-launch-profile.md` records
P1's pinned-source findings. Existing `core/agents/policy.ts` deliberately returns
unavailable and is not changed. The test runtime is not bundled into Electron.

## Plan of Work

First construct a fresh filesystem and explicit nonsecret environment. Independent
Node canaries verify network denial, absence of host/config/bus paths, immutable
fixture ancestry, writable isolated state, dropped capabilities and cleanup after
owner death. Positive controls execute the same synthetic canary successfully
inside isolation. Failures stop before any Codex invocation. Then inspect only
initialize/config/feature metadata from the actual complete package, with strict
config and no thread/turn/auth request. Hash inputs before and after, keep raw
observations private and emit only sanitized evidence. Missing coverage stays
explicitly unproved. Hostile configuration fixtures expose aliases and inheritance
without confusing absent activation opportunities with disabled capabilities.

## Concrete Steps

In the designated `agent-launch-profile-p2` worktree, materialize frozen pnpm
dependencies, then run `nix develop --command bazel test //tools/policy:boundary-test
//tools:quality --jobs=3`. Run the manual probe through its Bazel target. All full
tests run under `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock`; GUI ownership
belongs exclusively to the existing virtual-X11 harness.

For P3, use the designated `agent-policy-activation` worktree. Run the explicit
manual acceptance target, `nix develop --command bazel test
//tools/policy:activation-test --jobs=3 --test_tag_filters= --nocache_test_results --test_output=all`.
It uses the installed complete package only after independent acceptance, never
reads host credentials and emits OFFLINE_ACTIVATION_CHECKPOINT only for all six
matched controls. Run `//tools:quality` for deterministic contract/diagnostic
regressions, then the full build and uncached `//...` tests under the shared lock.
The actual-package target is manual so ordinary CI does not require this local
installation; the independent synthetic boundary target remains mandatory.

`activation-contract.mjs` owns fixed RPC envelopes and evidence acceptance;
`mcp-canary.mjs` implements only a finite handshake and empty tools list;
`activation.mjs` observes actual Codex creation, provider-reported startup/failure
and canary records. No independent process-count evidence is inferred.
`probe.mjs` constructs immutable paired fixtures and repeats the full boundary.
No new runtime dependency or configuration mount is necessary. Document exact
pinned trigger/source and remaining UNPROVED paths in the profile coverage ledger.

## Validation and Acceptance

Boundary failures return a typed unavailable result with Codex not started.
Positive/negative controls, immutable paths, bounded output/deadline and namespace
owner-death cleanup must pass before the actual executable can run. Installed
version/companion, config, canonical root and relevant observations are recorded
as digests/booleans, never raw private data. No real token, auth file or connector
is read, copied or invoked. Offline config evidence is not authentication proof.

## Idempotence and Recovery

Each invocation owns a unique private temporary directory and processes. It may
remove only its owned files after confirmed cleanup; uncertain cleanup retains
artifacts and returns unavailable. There is no host fallback or automatic replay.
No watched master/app, physical display or global configuration is changed.

## Artifacts and Notes

Sanitized results and final handoff live at the ROOT-authorized ignored
`master/artifacts/overnight-wave/policy-p2/`. Draft/ready PR17 is the review/merge
unit; branch and worktree remain recoverable. No integration or app adoption.

## Interfaces and Dependencies

The CLI returns versioned JSON with `productionAvailable: false`, isolation
evidence, input digests and named unproved obligations. It never exports a
capability into the public protocol. Dependencies are the existing pinned Nix
source, Bubblewrap, Node and fixed synthetic scripts, all invoked through Bazel.

Revision (2026-09-06): initial implementation plan and assumptions before coding.
Revision (2026-09-06 04:49Z): record observed runtime-state exception, actual offline
counterexamples, exact ownership approval and first review corrections.
Revision (2026-09-06 04:53Z): record converged available council seats, actual local
gates and clean normal integration of reviewed peer work before final landing.
Revision (2026-09-06 05:20Z): begin P3's bounded executable activation increment,
state assumptions and missing-trigger failure mode before implementation.
Revision (2026-09-06 05:53Z): narrow the proof after actual observer gaps, retain
clean-close/notification barriers, add absent-executable failure control, and
document no production or independent-syscall attestation.
