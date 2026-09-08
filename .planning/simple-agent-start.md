# Start a Codex agent directly

This living ExecPlan follows `.planning/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

In an ordinary opened repository, click **New agent**, type an instruction and press Enter. Codex starts with the user's normal account, model and approval settings in the selected checked worktree. No source file, Ditz issue or prepare/review ceremony is required. Existing observed terminal conversations remain separate and steerable. Submitted text stays visible and copyable if startup fails.

## Progress

- [x] (2026-09-08) Read instructions and inspect existing service, router and composer.
- [x] (2026-09-08 19:47Z) Add direct typed start and immutable per-run worktree ownership with tests; c06e2d6 pushed.
- [x] (2026-09-08 19:55Z) Add visible entrypoint, durable composer and selected-root integration; c192151 pushed.
- [x] (2026-09-08 19:55Z) Owned desktop journey and one disposable real Codex turn passed.
- [x] (2026-09-08 20:01Z) Final 203 focused tests/types and native fix-delta convergence CLEAN after early-observation correction; final package build passed.
- [x] (2026-09-08 20:02Z) Living design updated, PR132 pushed; primary issue accomplished. Optional legacy source/task preparation in selected worktrees remains on its existing open follow-up. ROOT owns landing and app adoption.

## Surprises & Discoveries

All trusted-agent requests currently reach one primary runtime, whose factory captures the launch directory. Removing the UI guard alone would silently use the wrong working directory. The existing service already persists each admitted conversation before constructing its provider; reuse that mechanism rather than a second execution engine.

Native review found two composer timing cases: typing during admission must transfer to the admitted run, and an early catalogue read must not switch to a second independently editable composer before the start reply. The final implementation keeps the new composer active until acknowledgement and transfers its latest revision only for the unchanged explicit selection. A separate launchWorkspace field prevents historical worktrees from relabelling a new launch. Exact mounted tests cover these orderings.

The first desktop driver omitted Electron's character event for Shift-Enter, producing no newline; the unchanged product handler was correct. Adding the same `char` event used by the existing keyboard acceptance tools fixed that proof. The first failure and corrected evidence are retained separately.

## Decision Log

Use a typed `trusted.start` command with a client-generated permanent token and plain instruction, optional model override, and core-resolved selected worktree. No fabricated source attachment. Keep legacy preparation for explicit task workflows, not the primary entrypoint. Run identity continues to address Send and Stop independently of navigation. Persist initial submitted text in core history and save a renderer-side outgoing record before dispatch, so even pre-admission failures/reload retain text. Use one existing service owner and session implementation.

Assumptions: the selected root was registered/opened by the core; normal Codex configuration may deny tools or require approval; startup can fail before acknowledgement; users can navigate or double-submit during that interval. Validation must reject an unknown/replaced root, prevent duplicate token admission, preserve errors/text, and keep Stop owned by the admitted run.

## Outcomes & Retrospective

The direct path is implemented in PR132. Packaged selected-worktree proof passed in 2417ms (2702ms harness scenario), with normal approval handling, source-free start, retained submitted text across reload, controls after navigation, unchanged source bytes/cameras and confirmed cleanup. It used a deterministic protocol peer, not a model. A separately authorized real response passed in 4406ms: exactly one provider and turn, configured model (no override), selected directory, saved initial text, and confirmed owned shutdown. No existing live session was resumed or messaged. Remaining final work is review convergence and the reviewed/pushed handoff; ROOT owns merge/adoption.

## Context and Orientation

`protocol/trusted-local.ts` validates commands and snapshots. `core/agents/trusted-local.ts` owns retained runs, storage and provider sessions; its session factory must receive each run's immutable root. `core/workspace-context.ts` routes opened worktree commands; `core/worker-runtime.ts` connects them to the primary owner. `app/renderer/agents/TrustedLocalPane.tsx` and `use-trusted-fleet.ts` currently require a prepared source draft. `AgentDock.tsx` and `App.tsx` control where these appear. Existing chat keyboard and outbox helpers provide reusable input behavior. `docs/design/agents.md` and `.swarm/plans.json` describe these components and their actual Bazel inputs.

## Plan of Work

First add direct start to the protocol and existing service, capturing root and durable initial instruction before opening Codex. Extend checked workspace routing for this operation only; legacy source preparation stays scoped. Next replace the empty native-agent pane with a prompt and New agent entry button while preserving existing selected conversations, task draft and terminal controls. Save outgoing intent before sending and prevent repeated clicks/recovery from replaying it. Finally prove a no-source start in a selected worktree, failed startup, reload retention, Enter/Shift-Enter, and correct token controls after navigation.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/simple-agent-start`, use `nix develop --command pnpm install --frozen-lockfile` if dependencies are missing. Run focused Bazel targets matching trusted-local, workspace-context and renderer tests, using at most three jobs; add a small dedicated target if existing targets would run unrelated suites. Build `//:desktop-bundle` for the owned GUI proof. Record exact target names/results as they are selected. Commit granularly and open a draft PR, then push final reviewed code. ROOT owns normal merge and shared app adoption.

The final focused command is `nix develop --command bazel --output_base=/tmp/swarm-new-agent-bazel test --jobs=3 //tools/trusted-local:start-unit //tools/trusted-forks:unit //tools/workspace-navigation:core-checks --test_output=errors`. Registered-tab compatibility separately passed `//tools/operator-cockpit:conversation-tabs`. `//tools/trusted-local:start-smoke` owns :181/55441 by default and validates the actual packaged bridge; `//tools/trusted-local:start-live` is manual only and requires explicit `SWARM_NEW_AGENT_LIVE=1` plus a fresh `SWARM_NEW_AGENT_EVIDENCE` directory. Do not repeat the real turn without renewed authority.

## Validation and Acceptance

No-source New agent sends the exact instruction once with a generated token. The provider gets the selected registered worktree, not the IDE launch root. A repeated token cannot start twice; a stale/unknown worktree cannot start at all. Storage/process failure leaves exact user text copyable after renderer reload. Missing Codex produces a useful error. Enter submits, Shift-Enter inserts newline, and composer focus is retained without stealing focus back from a deliberate navigation. One owned virtual desktop journey must demonstrate the button and composer, and one small authorized real Codex response in a disposable Git repository verifies the existing transport. Other proof uses deterministic test transports and must be labelled as such.

## Idempotence and Recovery

Never resend an uncertain command automatically, never resume an observed terminal session, and never touch credentials or the managed app. Preserve existing branch/worktree/queued text. Dispose only owned test providers, virtual desktop and Bazel server. Keep failed proof output and file concrete remaining work rather than broadening this task.

## Artifacts and Notes

Current progress and final evidence belong in `/tmp/swarm-ide-startup-simple.Wz8BqH/new-agent/`. The final marker is `SIMPLE-START-NEW-AGENT-20260908-WZ81 COMPLETE — EXECUTIVE RECAP`.

Authoritative existing evidence: `owned-gui/run.024tAA/proof.json` and screenshots, `real-turn/proof.json`, `corrected-ui.log`, and `final-checks.log`. The initial failed desktop attempt is `artifacts/trusted-local-proof/run.2wbx2L`; its failure concerns only a missing input event in the proof driver.

## Interfaces and Dependencies

Reuse React, the schema-validated local bridge, TrustedLocalService and TrustedLocalSession, existing owned Codex transport, local profile storage and existing chat-submit keyboard helper. No new agent engine or provider chooser. Per-run root and initial instruction are additive retained metadata, with old stored runs remaining readable.

Plan created before implementation to capture the user-visible path and wrong-directory/replay failure modes.

Updated after direct implementation and actual proof to record the native review corrections and precise controlled-versus-real evidence.
