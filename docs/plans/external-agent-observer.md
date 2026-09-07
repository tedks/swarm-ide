# Observe registered external agents

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can register existing harness sessions, inspect their actual fork ancestry and bounded assistant conversation, and open an already-running conversation deliberately. This is observation, not managed-agent execution. It makes the engineering organization visible without granting an agent new powers.

## Progress

- [x] (2026-09-07) Verified designated clean worktree at e8ec0f9 and read shared rules.
- [x] (2026-09-07 19:36Z) Strict registry, bounded reader and exact target checks; first19 tests passed.
- [x] (2026-09-07 19:44Z) Typed requests and mounted UI/lifetime coverage;25 tests passed.
- [x] (2026-09-07 19:56Z) Packaged eight-level synthetic UI/hand-off/retention/ordinary-save/clean-close proof passed on owned X11. Actual authorized local parent metadata recorded separately, ignored.
- [x] (2026-09-07 19:56Z) Reviewed code6d8ae88: native and Google fix-delta CLEAN; Sonnet unavailable after240s. All36 build targets, full quality1484tests105files and31 focused tests passed.
- [x] (2026-09-07 19:58Z) ROOT-cleared PR51c3128715 composed without conflicts or production delta as b6bd346.
- [ ] Final exact reviewed-base landing or held pushed increment, Ditz status and cleanup receipt.

## Surprises & Discoveries

The current bridge already provides validated request correlation and lifecycle notifications; the observer can be additive without changing managed-agent contracts.

Native review found that an in-place same-size rewrite could change a transcript after metadata validation. A controlled test actually exposed another session's assistant message under the registered ID (1failed/28passed); re-reading the exact descriptor header after the tail fixes that class while preserving append-only growth. A first attempt to instrument this failed because Node ESM exports cannot be spied on directly; that setup failure is not the mechanism proof.

The first packaged attempt captured the preceding source-open camera reframe before it settled; the corrected driver records stable animation frames before taking the retention baseline. The next attempt proved retention but ordinary app.quit correctly hit the existing dirty-buffer veto; the driver now deliberately saves the owned source via the ordinary UI before closing. Neither is a claimed historical product fix. Native review also caught missing desktop-exit validation; the verifier now rejects nonzero or absent exit codes even if UI evidence had already passed.

## Decision Log

The registry is supplied through `SWARM_EXTERNAL_AGENTS_REGISTRY`, an absolute operator file outside the target repository. Repository-authored content cannot authorize transcript reads. Missing configuration is visibly unavailable. Assistant messages are displayed verbatim as bounded read-only conversation; input prompts, reasoning, tool arguments and raw outputs are omitted. Structured tool names indicate reported activity, not verified repository changes. No arbitrary transcript text becomes a clickable path.

Context paths require an exact operator-declared contextRoot equal to the registered repository root; other repositories cannot accidentally inherit those links. tmux handoff is optional and revalidated, not resumed or retried as a command. It has a documented visual-only non-atomic identity/selection interval; no agent input is ever sent. Cosmetic improvements do not expand this bounded vertical into terminal emulation or provider activation.

## Outcomes & Retrospective

The bounded vertical works and is pushed as PR55. It exposes real registered metadata through an additive, separately typed observer and exercises the production archive with explicitly synthetic session files. Full local quality and the dedicated packaged proof are green on reviewed code6d8ae88. Final normal landing is conditioned on the current ROOT-cleared aggregate base; shared app adoption belongs to ROOT. No live provider capability, complete conversation history, verified repository edit attribution or full effective context is implied.

## Context and Orientation

`protocol/schema.ts` validates the Electron renderer/local-core bridge. `core/worker-runtime.ts` dispatches requests. `app/renderer/App.tsx` composes the Agents sidebar and information panel while keeping source and graph instances mounted. New code lives under `core/external-agents*`, `protocol/external-agents.ts`, and `app/renderer/external-agents/`.

## Plan of Work

First add a strict registry and reader: at most 64 sessions, bounded regular no-symlink files, first JSONL metadata record plus bounded complete tail records, explicit partial/unavailable status. A session ID in metadata must equal registration. Fork edges derive only from metadata. Detect duplicates and cycles without recursive rendering assumptions. Keep ingested text bounded and escape control characters.

Add read-only snapshot/read requests and an explicit handoff request accepting only a registered session ID. Revalidate tmux socket, exact window/pane identity, process identity and rollout association before fixed-argument selection. Never send keys or start/resume agents. Dispose only observer resources, never observed agents.

Build a compact lineage tree and selectable information pane showing worklog, conversation, coverage and provenance. Refresh is deliberate; no periodic polling. Core lifetime changes revoke outstanding responses. Returning to ordinary source information does not close the source buffer or reset graph cameras.

## Concrete Steps

From this worktree run `nix develop --command pnpm install --frozen-lockfile`, then `nix develop --command bazel test --jobs=3 //tools:quality`. Build through `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Add the dedicated `//tools/demo-agents:smoke` target for packaged owned-virtual proof; acquire `/tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` for heavy/GUI work. Record outcomes here.

## Validation and Acceptance

Tests must reject hostile paths, symlink/FIFO inputs, wrong metadata IDs, duplicates/cycles, missing/rotated/truncated/oversized records and stale process targets. Deferred reads after disposal must not publish. The packaged test opens an actual source file, selects an arbitrary-depth synthetic session tree, inspects actual bounded messages and worklog, performs a handoff only to an owned disposable tmux pane, and checks retained source/camera state and renderer errors. Real local metadata evidence stays ignored and is separately labelled; public fixtures are explicitly synthetic.

## Idempotence and Recovery

No registration is written by the renderer. Refresh can be repeated safely; failed reads show unavailable and never retain handoff authority. Closing the IDE only closes observer resources. Test files and process cleanup are restricted to owned temporary directories and exact owned PIDs.

## Artifacts and Notes

Operational evidence goes in the assigned ignored step directory, never checked-in private transcript data. `docs/demo-agents.md` documents registration, read limits and human walkthrough.

## Interfaces and Dependencies

Use existing Node filesystem/process APIs, Zod schemas, React and the existing local-core bridge. `ExternalAgentService` supplies snapshot, read and handoff; the renderer receives no registry paths or executable arguments. No new dependency or wire version.

Initial plan recorded before implementation to state trust and lifetime assumptions.

2026-09-07 update: recorded implemented behavior, exact review/test evidence and the two concrete hardening corrections; retained initial test-setup failures without overstating causality. Final integration follows ROOT's exact reviewed-base ledger rather than blindly consuming current master.
