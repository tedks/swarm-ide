# Observe registered external agents

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can register existing harness sessions, inspect their actual fork ancestry and bounded assistant conversation, and open an already-running conversation deliberately. This is observation, not managed-agent execution. It makes the engineering organization visible without granting an agent new powers.

## Progress

- [x] (2026-09-07) Verified designated clean worktree at e8ec0f9 and read shared rules.
- [ ] Add strict operator registry and bounded JSONL reader with negative tests.
- [ ] Add typed requests, external lineage rail and information/conversation view.
- [ ] Prove packaged UI with owned synthetic metadata, and separately record real parent metadata.
- [ ] Review, local gates, normal PR landing or exact hold, Ditz and cleanup.

## Surprises & Discoveries

The current bridge already provides validated request correlation and lifecycle notifications; the observer can be additive without changing managed-agent contracts.

## Decision Log

The registry is supplied through `SWARM_EXTERNAL_AGENTS_REGISTRY`, an absolute operator file outside the target repository. Repository-authored content cannot authorize transcript reads. Missing configuration is visibly unavailable. Assistant messages are displayed verbatim as bounded read-only conversation; input prompts, reasoning, tool arguments and raw outputs are omitted. Structured tool names indicate reported activity, not verified repository changes. No arbitrary transcript text becomes a clickable path.

## Outcomes & Retrospective

Implementation is in progress. No live provider capability is implied.

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
