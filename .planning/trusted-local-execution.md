# Launch an explicit trusted-local Codex conversation

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can prepare a fixed source/task draft, inspect the exact text and workspace, and deliberately launch their installed Codex in the IDE. This separate profile inherits normal authentication, configuration and approval settings. It does not claim the old isolated read-only policy is available. Conversation and explicit approval answers stay in the dock; Stop closes only the owned process.

## Progress

- [x] Inspected installed Codex 0.153.4 help, official app-server documentation and existing bridge/context/process seams.
- [ ] Implement the separate typed preparation/conversation namespace and UI.
- [ ] Verify local tests, native review and owned virtual journey; attempt at most one authorized benign live smoke.
- [ ] Push a ready PR, synchronize Ditz and provide ROOT's handoff.

## Surprises & Discoveries

The existing adapter hardcodes read-only permissions, rejects all approval requests and disposes after one turn. Enabling it would not implement trusted conversation. The installed TUI can use a shared daemon, so killing a terminal is not adequate turn ownership.

## Decision Log

Use a separate direct stdio app-server session and the existing private process-lifetime owner. The latter is process cleanup, not a filesystem or configuration isolation claim. Reuse bounded disk/task materialization without changing legacy persisted contexts. A trusted preparation stores its own exact prompt in core memory and verifies the same materialized inputs before launch. One conversation per core lifetime is active at a time; reconnect observes and never replays a mutation.

## Outcomes & Retrospective

Implementation underway. Durable cross-core conversation recovery is outside this bounded first increment; shutdown stops the owned conversation and the UI must not silently relaunch it.

## Context and Orientation

`protocol/trusted-local.ts` defines the validated request and snapshot shapes. `core/agents/trusted-local.ts` owns fixed preparations and launches; `trusted-local-session.ts` handles the Codex newline-delimited request protocol. `core/worker-runtime.ts` dispatches this separate namespace. `app/renderer/agents/TrustedLocalPane.tsx` exposes deliberate preparation, review, launch, approval and Stop. Existing isolated agent records remain unchanged.

## Plan of Work

First add core-owned prepared tokens, bounded exact prompt review and single-use launch authority. Then connect the installed app-server with normal settings, expose its conversation and approval requests, and add a separately labelled panel alongside the existing draft. Test wrong workspace, replacement/stale preparations, missing executable, duplicate commands, cancellation, output bounds and renderer reconnection. Use an actual packaged UI with a clearly labelled controlled provider before the one authorized empty-workspace live smoke.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/trusted-local-execution`. Materialize with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //:quality --jobs=3` and `nix develop --command bazel build //:desktop-bundle --jobs=3`. Run the new owned virtual proof target on a free display/port, never physical DISPLAY 0.

## Validation and Acceptance

An explicit prepared prompt must show the fixed workspace/source/task. Navigation and draft edits cannot retarget a prepared token. Launch is one-shot and never happens on refresh. App-server permissions/configuration overrides are absent. Approval choices require a deliberate operator action. Stop and app close terminate the owned process. Controlled test output is labelled separately from any actual live-provider result.

## Idempotence and Recovery

Read-only snapshots may repeat; launch/send/approval command IDs may not. Expired or replaced preparations must be prepared again, never retried automatically. Preserve all unrelated source buffers and graph cameras. Keep branch/worktree and evidence; ROOT owns merge and app adoption.

## Artifacts and Notes

Operational evidence is under `/tmp/swarm-ide-demo-controls.q2i33c/trusted-execution`. The final recap records actual gates and limitations rather than inferred success.

## Interfaces and Dependencies

Use existing Zod, React, Node and the existing process owner; no dependency additions. Installed Codex is selected by privileged `SWARM_CODEX_BIN` or the normal PATH, never renderer-provided shell commands. The renderer receives bounded text and typed state only.

Initial plan recorded for the user-approved trusted-local route, replacing isolation research as the execution prerequisite.
