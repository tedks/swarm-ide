# Prove an offline boundary before probing configuration

This ExecPlan follows `.planning/PLANS.md`. The living sections below record the
bounded P2 boundary, P3 static MCP and P4 local-plugin MCP implementation, not production authorization.

P5's separately authorized, manually selected synthetic-turn profile is tracked
in `tools/policy/SESSIONSTART-PLAN.md`. References below to no allowed turn apply
to the existing P2/P3/P4 modes, whose RPC allowlists remain unchanged. P5 uses one
fixed local text response per control, no model inference or production capability.

## Purpose / Big Picture

Developers can run `nix develop --command bazel run //tools/policy:probe` and get
bounded JSON identifying independently tested isolation and exactly which Codex
configuration observations remain unavailable. No provider thread or model turn
is created by that metadata mode. P3 adds an explicit `--activation` mode for
synthetic, ephemeral thread initialization only. No model turn is allowed in any
mode. P4 adds `--plugin-activation`, a separate three-case local legacy plugin
comparison through that same no-turn opportunity and process boundary. This is
a development acceptance harness, never a product adapter.

## Progress

- [x] (2026-09-06 06:33Z) P4 source gate: immutable legacy local-cache plugin feeds initial MCP projection without a model turn or installation. Local-only marketplace requirements exclude curated Git sync; featured HTTP warmup still needs the existing independent network denial.
- [x] (2026-09-06 06:46Z) P4 code1a9b332/docscef3228: three actual controls plus three full repeated runs pass all28 checks per case; static six-case acceptance separately passes. Quality592tests/48files, full24 build and all8 uncached local targets pass; owned virtual67.2s and fixture-agent5.7s each cleanup1. Native+Google code and doc-delta CLEAN, Anthropic actual session-limit MISSING. Hosted34016892153 and34017026634 FAILURE; no CI-green claim.
- [ ] P4 normal PR26 landing and actual aggregate verification if GitHub's merge tree differs; final identities and cleanup go in the ignored executive handoff, without editing the watched master.
- [x] (2026-09-06 05:20Z) P3: read inherited gates, official app-server documentation and pinned source; designated feature worktree starts from verified normal merge c52f959.
- [x] (2026-09-06 05:30Z) P3: actual installed required-stdio-MCP positive/negative controls pass across five fixtures; explicit fixed RPC allowlist rejects generation paths. Initial quality passes. Commit153b12b/PR22 enters council and complete local gates.
- [x] (2026-09-06 05:53Z) P3: bounded seed-pipe diagnostics and deterministic regressions; full first local7 targets passed476tests. Native Important found incomplete trace observation; actual teardown gap confirmed and unsupported observer removed. Six provider-reported/canary controls now pass, no independent syscall claim. Strengthened regression/full rerun and council convergence pending.
- [x] (2026-09-06 05:59Z) P3 code0f0a3b1: full22-target build, all7 uncached local targets and511 tests/42 files pass; owned virtual26.0s/cleanup1. Actual manual activation passes all6 cases and three repeated complete runs. Native and Google convergence CLEAN; Anthropic session limit explicitly MISSING. Duplicate-case test nit corrected and rerun next; PR22 records normal merge/actual aggregate handoff.

- [x] (2026-09-06 04:21Z) Read P1 evidence/contracts and establish basic unprivileged user/network/mount/PID namespace support.
- [x] (2026-09-06 04:38Z) Implement pinned isolated runtime, frozen synthetic inputs and independent boundary canaries; owner-SIGKILL/deadline/output checks pass.
- [x] (2026-09-06 04:49Z) Actual complete installed 0.153.4 metadata inspection succeeds after boundary acceptance; seven fixture cases and all eight expected counterexamples/coverage checks pass.
- [x] (2026-09-06 04:49Z) Native council identified four Important findings; fixed explicit Nix config/overlay isolation, actual complete layout admission, unknown-cleanup-before-hashing and trace-mode unavailable status, with regressions. Foreign/convergence review pending.
- [x] (2026-09-06 04:53Z) Added negative tests; full build22 targets and all7 uncached Bazel tests passed at83da50f (272 unit tests). OpenAI native and Google fix-delta CLEAN; Anthropic full-seat timed out600s with no review, explicitly missing. Remaining nits filed. PR17 records the eventual normal-merge transaction; final aggregate evidence is archived in the handoff.

## Surprises & Discoveries

P4's direct local-cache loader needs neither installation metadata nor writable
policy directories. However, enabling plugins also schedules an unauthenticated
featured-catalog HTTP request even when remote_plugin=false. Local-only managed
marketplace requirements exclude curated Git synchronization, but do not suppress
that HTTP path. The existing independent private network contains attempts; no
claim of zero auxiliary activity is made. Actual three-case controls passed in
17.5 seconds with all28 boundary checks before every actual process. A test-file
brace error was caught by initial typecheck and corrected before council review.

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

Decision (2026-09-06, P4): one legacy plugin-supplied stdio MCP path only, seeded
under the synthetic readonly Codex home. Assume trusted host/operator and exact
complete package; reuse all26 independent checks before each launch and add exact
plugin-file/ancestor mutation checks. Invalid loader state, handshake/status
ambiguity, changed input, output/deadline or unknown cleanup fails closed. A local
marketplace allowlist blocks curated Git sync without hiding the installed fixture.
Featured-catalog warmup may still attempt HTTP; egress denial contains it and is
not runtime disablement. No install/auth/turn or writable config directory is
authorized. No personal marketplace/plugin scaffolding is appropriate for this
fixed disposable fixture. Production stays unavailable.

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

P4 supplies one additional observed no-turn legacy plugin MCP gate, not a generic
policy certificate. The installed positive, matched feature-disabled and reached
failure cases pass with all28 independent checks, including three additional full
repetitions. Static six-case controls also pass. Final topic verification passes
592 tests/48 files, full24-target build and all8 uncached targets; owned virtual
67.2s (first green59.850s, incremental244ms) and fixture-agent5.7s clean up fully.
Native/Google reviews are CLEAN, Anthropic session-limited without verdict.
Hosted code and docs runs fail the existing pre-Codex boundary; conditional local
waiver applies, not a security/test skip. A first whole-suite run was invalidated
by this agent committing documentation during topology build: an owned virtual
capture showed the working-source-change state, so only that scenario was stopped
and the full suite repeated on an unchanged tree. The rerun is the acceptance
evidence, not the interrupted run. Keep the tree fixed during graph verification.
No product availability or watched app adoption changed. Broad policy and
independent-observer issues remain open; PR26/handoff records actual merge state.

P3's final proof is deliberately narrower than independent syscall exclusion:
six actual static-MCP fixtures now distinguish reported startup plus full canary
handshake, successful disabled-thread creation, reached initialization failure,
and an absent executable. All26 independent boundary checks run before each
case. Final code quality passed511 tests/42 files, all7 uncached local tests,
full22-target build and owned virtual26.0s. The actual activation target passed
all6 controls and three complete repeated runs. Native and Google convergence
are CLEAN; Anthropic session-limited without verdict. PR22 records actual normal
merge state and the final merged-tree handoff; no future commit ID is invented.
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

P4 uses the explicitly designated `agent-policy-plugin-mcp` worktree on branch
`feature/agent-policy-plugin-mcp`, based on reviewed normal491a6d6. Its
`tools/policy/plugin-activation-contract.mjs` declares exactly three case names,
immutable cache/manifest paths, local-only marketplace configuration and final
acceptance. `probe.mjs` materializes these fixed synthetic inputs before mounting
them readonly and hashing the tree. `inner.mjs` attempts writes/unlinks and
ancestor creates/renames before the existing actual-process observer. The observer
and fixed RPC allowlist remain those of P3; this is not a generic plugin runner.

`tools/policy/` owns all implementation. `docs/agent-launch-profile.md` records
P1's pinned-source findings. Existing `core/agents/policy.ts` deliberately returns
unavailable and is not changed. The test runtime is not bundled into Electron.

## Plan of Work

P4 milestone one is the pinned-source feasibility gate: inspect the legacy plugin
cache loader, plugin feature early-return and initial MCP projection, without
executing the package. If this requires a turn, auth, remote installation or
writable policy ancestor, record a source-only finding instead. Milestone two
adds only the fixed manual probe and exact immutable-input checks described
above; demonstrate actual enabled full handshake, matched feature-disabled
successful thread and reached required-initialize failure. Milestone three is
repeated controls, deterministic failure tests, full local verification, available
provider-diverse review to convergence and normal PR landing. Leave general
policy and independent-observer issues open and hand reviewed heads to I2; never
change the watched master or adopt the app.

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

For P4, from `/home/tedks/Projects/swarm-ide/agent-policy-plugin-mcp`, materialize
dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run
`nix develop --command bazel test //tools/policy:plugin-activation-test --jobs=3
--test_tag_filters= --nocache_test_results --test_output=all`. Expect
OFFLINE_PLUGIN_ACTIVATION_CHECKPOINT, no failure, productionAvailable=false,
three ACTIVATION_OBSERVED cases, all28
checks true per case, unchanged inputs, exact fixed requests and clean process
closure. Repeat the three cases and run the six-case static target separately.
Run `//tools:quality`, full `bazel build //... --jobs=3` and all uncached local
`bazel test //... --jobs=3 --nocache_test_results --test_output=errors` under
`flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock`; all GUI uses owned
Xvfb/55174. If the normal merge differs, repeat full gates on that actual tree.

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

P4's PR26 and ignored handoff/evidence live at
`master/artifacts/overnight-wave/policy-p4/`; its concise peer seam is
`/tmp/swarm-ide-policy-p4.pGwR93/seam.md`. Ditz slice is
`agent-run-plugin-mcp-policy-p4`, blocking the existing offline-activation parent.
I2 alone owns integration and the shared first-agent execution plan. No new
authority crosses into the core or renderer.

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

Revision (2026-09-06, P4): document source-confirmed no-turn local-plugin trigger,
fixed controls, extra immutable-input acceptance and the still-attempted featured
catalog path; keep broader policy, process and runtime adoption gates separate.
