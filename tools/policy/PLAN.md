# Prove an offline boundary before probing configuration

This ExecPlan follows `.planning/PLANS.md`. The living sections below record the
bounded P2 implementation, not production authorization.

## Purpose / Big Picture

Developers can run `nix develop --command bazel run //tools/policy:probe` and get
bounded JSON identifying independently tested isolation and exactly which Codex
configuration observations remain unavailable. No provider thread or model turn
is created. This is a development acceptance harness, never a product adapter.

## Progress

- [x] (2026-09-06 04:21Z) Read P1 evidence/contracts and establish basic unprivileged user/network/mount/PID namespace support.
- [ ] Implement pinned isolated runtime, frozen synthetic inputs and independent boundary canaries.
- [ ] Gate actual complete installed 0.153.4 model-free inspection behind boundary acceptance.
- [ ] Add negative tests, run local gates and provider-diverse review; land and archive proof.

## Surprises & Discoveries

P1 found startup work occurs before inspection. Therefore even `config/read`
requires a separate operating-system boundary. Raw config is not complete
effective policy and no offline observation enables credentialed execution.

## Decision Log

Decision (2026-09-06, P2): use pinned Bubblewrap and Node through a new package
expression consuming the existing Nix lock; no shared flake dependency change.
Bubblewrap builds a private filesystem with explicit runtime mounts and private
network/PID/IPC namespaces, drops capabilities and supervises descendants.
Fixtures and their ancestors are readonly; logs/state have separate owned paths.
Trusted host/operator/kernel and Nix store are assumptions; hostile same-account
replacement of the harness itself is not a defended boundary.

## Outcomes & Retrospective

Pending implementation. Production remains ADAPTER_POLICY_UNAVAILABLE.

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
tests run under `flock /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock`; GUI ownership
belongs exclusively to the existing virtual-X11 harness.

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
`master/artifacts/overnight-wave/policy-p2/`. Branch and worktree remain recoverable.

## Interfaces and Dependencies

The CLI returns versioned JSON with `productionAvailable: false`, isolation
evidence, input digests and named unproved obligations. It never exports a
capability into the public protocol. Dependencies are the existing pinned Nix
source, Bubblewrap, Node and fixed synthetic scripts, all invoked through Bazel.

Revision (2026-09-06): initial implementation plan and assumptions before coding.
