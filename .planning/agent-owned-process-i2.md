# Prove the joined external process lifetime

This ExecPlan follows `.planning/PLANS.md` and is maintained as a living record.

## Purpose / Big Picture

The cockpit already rehearses an in-process agent. This step proves that the
actual JSONL adapter, durable service and Linux namespace owner work together
around a fixed external test program. A Stop reply, a completed turn and process
cleanup must remain separate facts. No Codex binary, credential or model is used,
and production remains policy-unavailable.

## Progress

- [x] (2026-09-06) Read the frozen contract, owner, adapter and durable service; create the designated worktree from verified PR20.
- [x] (2026-09-06 05:54Z) Fixed external fixture and all three joined scenarios pass at code1fd0689; no production changes required.
- [x] (2026-09-06 05:58Z) Durable turn/cleanup ordering, resistant descendants, outside canary and hard-core recovery/no replay proven; full25-target build/all9 uncached tests pass,478 tests/44files.
- [x] (2026-09-06 05:57Z) OpenAI native and Google council CLEAN; Anthropic actual session-limit unavailable, explicitly missing.
- [x] (2026-09-06) ROOT-verified A1 c68aa4c integrated without conflicts. Final executable8619da1 and actual integrationb8a4149 share treeaf14e236ec5d559874017c3b035660f062c04e90. Full25 build/all9 uncached targets pass,493tests45files; native+Google final delta CLEAN.
- [ ] Normal PR merge; P3 has advanced origin/master and its ROOT-verified handoff is awaited before consuming that peer.

## Surprises & Discoveries

The existing owner already admits fixed test arguments. No production selector
or policy exception is needed. Its private PID namespace, whose init process
owns all descendants, supplies cleanup evidence; a witness file only observes
fixture activity and never authorizes a signal or declares cleanup.

## Decision Log

Decision (2026-09-06, I2): observe the real store's successful updates to retain
the whole state sequence. Assertions must not depend on sampling a fleeting
pending-cleanup state. Use the real owner unchanged unless composition exposes
a demonstrable bug. Keep the public six-command contract frozen.

Decision (2026-09-06, I2): use synthetic context and capability fields only in a
test composition. They satisfy the existing adapter seam but attest no installed
provider. A separate harmless canary outside the namespace checks targeting.

## Outcomes & Retrospective

Code1fd0689 passes all three actual external-process scenarios, the full
25-target build and all nine uncached local targets (478 tests across44files).
Normal Stop/completion and unexpected exit confirm namespace cleanup; hard-core
death independently removes live descendants but recovered product cleanup stays
unknown and blocks another launch. Native OpenAI and Google reviews are CLEAN;
Anthropic returned its session limit, not a review. Merge/integration remain
pending. Live provider policy and the credentialed first-run parent stay open.

The later ROOT-verified A1 merge and final emitted-snapshot assertion delta are
proven together at integrationb8a4149, identical to executable8619da1. All nine
uncached targets pass with493tests45files, full25 build, actual external proof
3.2s, owned topology65.2s and agent journey5.4s. Both available reviewers remain
CLEAN. Hosted1fd0689 fails inherited policySEED_PIPE_FAILED and the explicit
unshare prerequisite before fixture startup; no weaker fallback or green-CI
claim. `agent-run-owned-process-hosted-proof` tracks actual supported-host
acceptance without duplicating P3's isolation diagnosis.

## Context and Orientation

`core/agents/codex-app-server.ts` parses provider JSONL and correlates replies.
`core/agents/service.ts` persists admission and instruction intent in
`core/agents/file-store.ts` before dispatch. `core/agents/owner.ts` and
`owner-process.mjs` establish a guardian and private PID namespace so detached
descendants cannot survive normal namespace teardown. None is replaced by a
fake cleanup implementation. `fixtures/agent-owned-process/` contains only the
fixed test provider, composition and disposable test core.

## Plan of Work

First implement fixed initialize/thread/turn/steer/interrupt responses with a
detached SIGTERM-resistant descendant. Then join actual service/store/adapter
and owner in focused tests. Prove Stop racing completion, unexpected provider
exit, and SIGKILL of the exact test-core handle followed by conservative store
reopen. Preserve emitted/durable state sequences and sanitized method counts.
Finally review and merge the isolated PR, consume only ROOT-verified peer heads
in the designated integration branch and retest the actual aggregate.

## Concrete Steps

From `agent-owned-process-proof`, materialize dependencies with
`nix develop --command pnpm install --frozen-lockfile`. Run:

    nix develop --command bazel test //tools/agent-process:proof-test --jobs=3 --nocache_test_results --test_output=errors
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock env SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel test //... --jobs=3 --nocache_test_results --test_output=errors

The focused target requires actual namespace support and took3.2s; full local
tests took98.9s, including owned topology65.9s and agent journey5.4s. Never use
the physical desktop or restart the watched application.

## Validation and Acceptance

The fixed external program reaches normalized running/output after durable
admission. Accepted steering and Stop do not prove process death. A completed
turn is persisted while cleanup is pending; only actual owner teardown confirms
cleanup, with the outside canary unaffected. Unexpected exit yields unknown
outcome, not success. Hard-core death kills namespace descendants independently,
but the reopened service retains unknown cleanup and pending delivery-unknown
receipts, blocks new launch and performs zero automatic transport calls.

## Idempotence and Recovery

Each test owns a private temporary directory and live process handles. Failure
cleanup closes transports or kills only its own test-core/canary handles. Never
signal saved PIDs. Unsupported namespaces remain unavailable, not a process-group
fallback. Evidence directories and reviewed worktrees remain recoverable.

## Artifacts and Notes

Sanitized evidence will be archived under
`master/artifacts/overnight-wave/agent-process-i2/`. Ditz
`agent-run-owned-process-i2` blocks but does not close `agent-run-vertical-proof`.

## Interfaces and Dependencies

Use `createCodexAppServerAdapter`, `createOwnedCodexTransport`,
`createAgentService` and `createFileRunStore` unchanged. Node and util-linux
executables resolve to pinned Nix paths. Builds/tests remain Bazel-owned; no new
renderer, provider profile or application capability is introduced.

Revision (2026-09-06): initial bounded external-process composition plan.
Revision (2026-09-06 05:58Z): record proven composition and review/local gates;
landing remains explicit and does not imply a live-provider capability.
Revision (2026-09-06): record actual ROOT-approved A1 aggregate and final emitted
state assertions, plus the required hosted-namespace prerequisite failure.
