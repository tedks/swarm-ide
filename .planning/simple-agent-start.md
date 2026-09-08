# Start a Codex agent directly

This living ExecPlan follows `.planning/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

In an ordinary opened repository, click **New agent**, type an instruction and press Enter. Codex starts with the user's normal account, model and approval settings in the selected checked worktree. No source file, Ditz issue or prepare/review ceremony is required. Existing observed terminal conversations remain separate and steerable. Submitted text stays visible and copyable if startup fails.

## Progress

- [x] (2026-09-08) Read instructions and inspect existing service, router and composer.
- [ ] Add direct typed start and immutable per-run worktree ownership with tests.
- [ ] Add visible entrypoint, durable composer and selected-root integration.
- [ ] Run focused tests, native review, owned desktop journey and one disposable real Codex turn.
- [ ] Update living design, Ditz, pushed PR and concise handoff.

## Surprises & Discoveries

All trusted-agent requests currently reach one primary runtime, whose factory captures the launch directory. Removing the UI guard alone would silently use the wrong working directory. The existing service already persists each admitted conversation before constructing its provider; reuse that mechanism rather than a second execution engine.

## Decision Log

Use a typed `trusted.start` command with a client-generated permanent token and plain instruction, optional model override, and core-resolved selected worktree. No fabricated source attachment. Keep legacy preparation for explicit task workflows, not the primary entrypoint. Run identity continues to address Send and Stop independently of navigation. Persist initial submitted text in core history and save a renderer-side outgoing record before dispatch, so even pre-admission failures/reload retain text. Use one existing service owner and session implementation.

Assumptions: the selected root was registered/opened by the core; normal Codex configuration may deny tools or require approval; startup can fail before acknowledgement; users can navigate or double-submit during that interval. Validation must reject an unknown/replaced root, prevent duplicate token admission, preserve errors/text, and keep Stop owned by the admitted run.

## Outcomes & Retrospective

Implementation and proof are pending. No existing live session will be resumed or messaged by verification.

## Context and Orientation

`protocol/trusted-local.ts` validates commands and snapshots. `core/agents/trusted-local.ts` owns retained runs, storage and provider sessions; its session factory must receive each run's immutable root. `core/workspace-context.ts` routes opened worktree commands; `core/worker-runtime.ts` connects them to the primary owner. `app/renderer/agents/TrustedLocalPane.tsx` and `use-trusted-fleet.ts` currently require a prepared source draft. `AgentDock.tsx` and `App.tsx` control where these appear. Existing chat keyboard and outbox helpers provide reusable input behavior. `docs/design/agents.md` and `.swarm/plans.json` describe these components and their actual Bazel inputs.

## Plan of Work

First add direct start to the protocol and existing service, capturing root and durable initial instruction before opening Codex. Extend checked workspace routing for this operation only; legacy source preparation stays scoped. Next replace the empty native-agent pane with a prompt and New agent entry button while preserving existing selected conversations, task draft and terminal controls. Save outgoing intent before sending and prevent repeated clicks/recovery from replaying it. Finally prove a no-source start in a selected worktree, failed startup, reload retention, Enter/Shift-Enter, and correct token controls after navigation.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/simple-agent-start`, use `nix develop --command pnpm install --frozen-lockfile` if dependencies are missing. Run focused Bazel targets matching trusted-local, workspace-context and renderer tests, using at most three jobs; add a small dedicated target if existing targets would run unrelated suites. Build `//:desktop-bundle` for the owned GUI proof. Record exact target names/results as they are selected. Commit granularly and open a draft PR, then push final reviewed code. ROOT owns normal merge and shared app adoption.

## Validation and Acceptance

No-source New agent sends the exact instruction once with a generated token. The provider gets the selected registered worktree, not the IDE launch root. A repeated token cannot start twice; a stale/unknown worktree cannot start at all. Storage/process failure leaves exact user text copyable after renderer reload. Missing Codex produces a useful error. Enter submits, Shift-Enter inserts newline, and composer focus is retained without stealing focus back from a deliberate navigation. One owned virtual desktop journey must demonstrate the button and composer, and one small authorized real Codex response in a disposable Git repository verifies the existing transport. Other proof uses deterministic test transports and must be labelled as such.

## Idempotence and Recovery

Never resend an uncertain command automatically, never resume an observed terminal session, and never touch credentials or the managed app. Preserve existing branch/worktree/queued text. Dispose only owned test providers, virtual desktop and Bazel server. Keep failed proof output and file concrete remaining work rather than broadening this task.

## Artifacts and Notes

Current progress and final evidence belong in `/tmp/swarm-ide-startup-simple.Wz8BqH/new-agent/`. The final marker is `SIMPLE-START-NEW-AGENT-20260908-WZ81 COMPLETE — EXECUTIVE RECAP`.

## Interfaces and Dependencies

Reuse React, the schema-validated local bridge, TrustedLocalService and TrustedLocalSession, existing owned Codex transport, local profile storage and existing chat-submit keyboard helper. No new agent engine or provider chooser. Per-run root and initial instruction are additive retained metadata, with old stored runs remaining readable.

Plan created before implementation to capture the user-visible path and wrong-directory/replay failure modes.
