# Operate the real Swarm from its cockpit

This ExecPlan is maintained under .planning/PLANS.md. ROOT owns this executable coordination plan; each worker records its local implementation decisions in its own short document and Ditz issue.

## Purpose / Big Picture

The operator should follow and steer the engineering organization building this IDE: ROOT and children working in separate Git worktrees, guided by versioned designs and Ditz tasks. The immediate milestone is reading real work in one cockpit, followed by messaging through the session's existing owner. Success is a useful operator journey, not another platform or compliance exercise.

The existing product already browses real repositories, edits source, queries Bazel graphs, presents Ditz tasks and authored plan hierarchies, observes registered Codex sessions, queues messages to running terminal sessions, and owns native Codex app-server runs and forks. This increment joins those capabilities. The first hour favors direct checks and small native review over full-suite repetitions.

## Progress

- [x] 2026-09-08 03:36 UTC: verified baseline origin/master 0d0a50d, merged timestamp/steady-refresh UI, and managed local :0 preview.
- [x] ROOT inspected existing external registration/queue ownership, plan hierarchy and application mounts.
- [ ] Persist this plan and Ditz dependency chain before dispatch.
- [ ] Read-first live fleet and correct cross-worktree activity are visible.
- [ ] Work Log records concrete completed outcomes and writes idempotent Ditz completion notes.
- [ ] System/component design documents and graphs reach real Bazel connections.
- [ ] Existing owner-routed messaging and terminal handoff work from the cockpit.
- [ ] Joined real ROOT/two-child demonstration, merged preview and concise launch handoff.

## Context and Orientation

The repo is private AGPLv3. Linux Electron hosts an unprivileged React renderer in app/renderer; privileged file, Git, process and agent access goes through runtime-validated protocol contracts into core. Graph projections remain separate and coordinate focus. Git worktrees are complete distinct source worlds; the same relative filename in two worktrees is not interchangeable.

protocol/external-agents.ts, core/external-agents.ts and app/renderer/external-agents/client.ts currently expose a registered roster and selected-session bounded transcript tail. They do not yet aggregate the whole active swarm. core/external-agents-send.ts already queues to the live owner with codex queue; it does not resume another execution process. core/external-agents-handoff.ts currently selects a pane but does not open a terminal client. Existing native sessions in core/agents/trusted-local-session.ts use a persistent Codex app-server and thread/fork.

app/renderer/App.tsx composes the cockpit. app/renderer/changelog/JournalPanel.tsx reads a saved report, not a running summarizer. app/renderer/external-agents/ObservedActivity.tsx shows selected-session activity. app/renderer/plans and .swarm/plans.json already implement an authored hierarchical plan graph with docs, source and task links; extend this, not a new document platform.

## Product design

There are three complementary representations. The design tree states what the system is and how its components connect. The Activity stream records timestamped tool calls, file edits and execution events with agent and worktree identity. The Work Log describes what was actually accomplished, with active entries linking running agents and completed sessions retained below. Neither a plan nor a shell command alone proves a task was completed.

Every active session has an identity, parent, label, task reference, harness/control mode and worktree. Reading is always separate from the ability to send. A tmux-owned Codex with a supported queue can accept an IDE message while its normal TUI remains open. Unsupported control stays read-only with a useful terminal command. IDE-native children remain IDE-owned; terminal children remain steerable tmux children. Never open a second execution owner merely to show a terminal.

The center pane can show source, a task, an expanded log item, or a design document with its component graph. Event activation opens that session's worktree version and, when available, its recorded patch. Cross-worktree views initially remain read-only, explicitly labelled by worktree, and do not replace or destroy a dirty local editor buffer. A changed file without an attributed patch can show a current worktree Git diff, labelled as such rather than attributed to one agent.

The Work Log summarizer is a bounded running worker with configurable harness/model, default Codex gpt-5.6-luna. It reads only registered sessions and new evidence at meaningful turn/completion boundaries, batches bursts, and has one in-flight summary. Do not spawn a model per tool call or rescan whole inherited transcripts. Completed notes contain outcome, changed areas, verification and remaining work; write through ditz comment/close APIs with stable deduplication, not YAML edits. Do not close issues merely because a process exits.

Design documentation has a top-level system graph, component documents with lower-level graphs, and leaves that identify actual Bazel targets and dependency connections. Use as much depth as needed, not a mandatory seven-level taxonomy. Authored design relationships and observed build edges are distinct but linked. Component changes update their design, graph and target references in the same change; scoped reviewers check this invariant. Checks can verify links/labels, while semantic consistency is a review responsibility.

## Plan of Work

ROOT creates the plan and seven bounded Ditz items, then launches four true session forks with step-specific compaction and quiet marker-qualified completion watchers. Each worker has a distinct worktree from the reviewed baseline, drafts a PR early and pushes coherent increments.

F7 owns the live fleet read path: external-agent protocols/service/client and agent list/activity components. It adds actual command/path/patch events, stable deduplication and per-session worktree identity; watches all relevant active sessions, not just the selected one. It also owns safe terminal handoff metadata and existing queue-route presentation. It must publish a tiny committed interface early for C7, rather than waiting for a finished department.

C7 owns the cockpit join and cross-worktree inspection, including App.tsx, WorkbenchSidebar.tsx, JournalPanel layout, source activation and shared graph/theme cleanup. It keeps source/draft/cameras intact, provides a persistent Work Log slot below the agent list, makes raw activity readable and removes routine forensic caveats. It integrates F7, K7 and P7 exported UI seams using reviewed commits, without taking over their implementation.

K7 owns the small-model Work Log producer, separate renderer WorkLogPanel, its own protocol/core module if necessary, and idempotent Ditz accomplishment notes. It reuses current summary tooling where appropriate and delivers one real bounded summary of current registered work, without messaging observed workers. An explicit start/stop/configuration surface controls model use. ROOT authorizes that bounded summarizer run; no arbitrary provider research or credential edits.

P7 owns the whole-system/component documentation, .swarm/plans.json, plan-specific renderer/modules and design maintenance instructions. The main-pane graph/document component is exported for C7 to mount. It documents actual current components and actual Bazel boundaries, and differentiates this wave's proposed additions until they land. It does not rewrite the general graph ontology.

## Interfaces and Dependencies

All peers start from the same reviewed baseline. F7 owns protocol/external-agents.ts, core/external-agents*.ts and app/renderer/external-agents/*; its additive activity detail should carry stable event ID, timestamp, session ID, display text, optional command/path/patch and canonical registered worktree identity. No synthetic production fill-in. C7 owns App.tsx and global styles. K7 owns new work-log modules and exports a WorkLogPanel with callbacks for agent/task activation; it supplies C7 only the mount contract. P7 owns plan modules and exports a design-document/graph surface or extends PlanWorkspace; it supplies C7 its mount contract.

core/worker-runtime.ts and protocol/schema.ts are shared composition points: F7 may make additive external-observer plumbing; K7 may make only its separately named work-log route/import/result additions. Tell the other affected owner once with the exact addition. ROOT resolves actual overlaps immediately; no paperwork gate for trivial imports, dedicated test targets or additive source dependencies. No worker edits another's functional module without targeted coordination.

Ditz graph: swarm-hour-plan enables swarm-live-fleet, swarm-operator-cockpit, swarm-work-log and swarm-living-design. swarm-live-fleet and swarm-operator-cockpit enable swarm-owner-steering. Those four feature items plus swarm-owner-steering enable swarm-operator-demo. F7 owns swarm-live-fleet and swarm-owner-steering; C7 owns swarm-operator-cockpit; K7 owns swarm-work-log; P7 owns swarm-living-design; ROOT owns final demonstration.

## Concrete Steps

Use Nix for project commands and Bazel for build/test/run. Start from the designated worktree and materialize dependencies with nix develop --command pnpm install --frozen-lockfile if needed. Use existing targeted Bazel tests or a small owned test target; typecheck the impacted node/renderer boundary and build the desktop bundle when runtime/UI integration changes. Do not run bazel test //... or historical GUI sweeps by default.

Within roughly ten minutes of productive work publish a seam and coherent draft PR. Aim for a directly checked usable increment in 25–35 minutes; final remaining time is integration. Time is a scope constraint, not a reason to claim unverified completion. ROOT handles normal merges and keeps the managed :0 port55176 window on reviewed merged progress. Tests use independent owned virtual X11 desktops and ports; no automated physical desktop interaction.

## Validation and Acceptance

The decisive demonstration uses this real ROOT and at least two workers from this wave. Their actual fork relationships appear, an append becomes a timestamped command/edit entry without manual selection, and clicking a changed file shows the correct worktree while keeping another dirty source buffer intact. A user can select ROOT or a child and deliver one deliberate message through its supported owner route or open/copy an exact tmux attach command. Do not send dummy instructions to working peers simply to create activity.

A real bounded small-model run turns recent work into understandable accomplishments. A completed task's note can be reloaded through Ditz and is not duplicated on restart. The operator traverses the system graph into a component document and its actual Bazel targets. Bright/light graph controls remain readable; timestamps and steady refresh from PR81 remain intact.

Use direct checks plus focused regressions for changed behavior and one scoped native review to CLEAN, fixing critical findings rather than restarting full historical review cycles. Existing noncritical resize or unrelated timing issues remain tracked. Wrong-session writes, lost work, leaked credentials or nonfunctional core journey are blocking; cosmetic nits are not.

## Idempotence and Recovery

Preserve branches, worktrees, transcripts and user buffers. Never overwrite the watched checkout with uncommitted peer code. Observations can pause or retain stale data without granting stale send authority. Summarizer restart must deduplicate completed notes and avoid model-run replay. Dispose owned processes only; monitoring another agent does not transfer lifecycle ownership.

## Decision Log

ROOT/user 2026-09-08: compress execution to one hour with parallel bounded streams, direct evidence and local-only checks. No remote CI dependency, checksum ceremony or repeated all-suite sweep. Codex-only scoped native review is the current quota policy.
ROOT/user: trusted-local authority, reading before writing, terminal/IDE coexistence through existing owners, and completion notes in Ditz are product requirements.
ROOT/user: comments to CTO are not broadcasts. Forward only if they change an affected assignment or shared decision, and only to those owners.
ROOT: maintain architecture as code alongside implementation; the living documentation stream is product content, not another pre-build design department.

## Surprises & Discoveries

The installed Codex queue and Swarm's existing send adapter already support a message to a running terminal-owned session; discord-agents instead serializes exec/resume invocations. We should not replace the persistent native backend.
The current tmux handoff only selects a pane; opening an actual terminal is a concrete usability gap.
The existing plan hierarchy and saved journal are substantial foundations, but a saved report is not an online Work Log.

## Outcomes & Retrospective

Pending implementation and the joined demonstration. Do not mark the MVP done because four PRs are ready. The outcome is the operator's demonstrated ability to understand and direct actual work.

Revision note: authored by ROOT before dispatch to translate the recentering conversation into one bounded, real operator journey.

