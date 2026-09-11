# Activity and the Work Log

Activity answers “what is happening?” The Work Log answers “what was done?”
Both are persistent cockpit instruments, but they serve different reading speeds.

The component graph separates three outgoing contracts: **Open responsible
agent** navigates to a conversation; **Latest saved summary** supplies the rail's
historical one-line outcome; **Record outcome note** deliberately comments on a
known already-closed Ditz issue. None of them starts or completes an agent or
closes a task. Current lifecycle comes from agent evidence, not Work Log prose.

Activity is a timestamped stream: an agent edited a file, ran a command, received
a tool result or completed a turn. It should preserve agent/worktree identity so
opening an event reveals the right source. A command starting is not a build
finishing; a reported file edit and the current Git diff are distinct observations.

The Work Log groups evidence into understandable accomplishments: what changed,
why it matters, what was checked and what remains. Entries lead back to their
agents and appear newest first, without pretending old outcomes are live work.
A completed Ditz issue should
retain these outcome notes in-repo, not just disappear from the live roster.

## Current implementation

| Part | Actual source | Current behavior |
| --- | --- | --- |
| Observed agent activity | [ObservedActivity.tsx](../../app/renderer/external-agents/ObservedActivity.tsx), [activity-entries.ts](../../app/renderer/external-agents/activity-entries.ts), [external-agents.ts](../../core/external-agents.ts), [FleetActivityView.tsx](../../app/renderer/FleetActivityView.tsx) | Shared newest-first raw operation projection for dock and center; assistant prose stays in conversation/Work Log |
| Online Work Log | [WorkLogPanel.tsx](../../app/renderer/work-log/WorkLogPanel.tsx), [service.ts](../../core/work-log/service.ts) | Automatic watching, persistent Pause/Resume, configurable summary worker and durable outcomes |
| Recorded logical journal | [JournalPanel.tsx](../../app/renderer/changelog/JournalPanel.tsx), [changelog.ts](../../core/changelog.ts) | Reads validated `.swarm/changelog.json` |
| Journal authoring | [changelog-authoring.ts](../../core/changelog-authoring.ts) | Exports evidence and validates supervised summary output |
| GitHub PR view | [GithubPullRequests.tsx](../../app/renderer/changelog/GithubPullRequests.tsx), [github-prs.ts](../../core/github-prs.ts) | Deliberate bounded refresh through ordinary `gh` |
| Readable times | [ActivityTime.tsx](../../app/renderer/ActivityTime.tsx) | Short visible time with full timestamp on hover |

The saved journal is operational, but it is not the running in-app summarizer.
The separate Work Log watches registered work at concrete ongoing-operation and
terminal boundaries, batches new evidence and uses one in-flight configurable harness/model worker, default
Codex `gpt-5.6-luna`. Explicit Record outcome writes deduplicated Ditz accomplishment notes through
the CLI; startup never records or closes a task. F7 supplies the
separate granular whole-fleet Activity stream.

The central Activity overview uses the same current fleet snapshots as the dock;
it does not create another timer. Opening the overview clears only an inspected
raw event. Selecting a particular event deliberately keeps its recorded text and
patch open as newer operations arrive. Returning to Activity shows those newer
rows. Event navigation requires the current registered session/worktree, and a
repository, world or core change clears the inspected selection. Bounded tail
eviction alone does not revoke a still-registered worktree.
An agent without a registered worktree can still be opened as a conversation,
but its recorded file event cannot offer a working-file inspection.

The central header Refresh reads the selected tab's source: the existing external
observer for Activity, `changelog.read` for Saved summaries, and the explicit
GitHub reader for Pull requests. Busy state and notices stay with that source;
switching views neither starts a summarizer nor polls GitHub. Background data
does not choose a tab or move keyboard focus. A delayed saved-entry reveal opens
its details but leaves focus alone if the operator has resumed typing elsewhere.

The pipeline is: known registered transcript tails → completed concrete operations
or actual turn terminals → one batched summary → human outcome entries in
`.swarm/work-log.json`. Completed patch operations, checks/builds, Git/PR
publication actions and explicit Ditz lifecycle actions can make an ongoing
milestone eligible; intentions, unmatched tool calls, read-only inspection and
partial records cannot. Its modules are [protocol/work-log.ts](../../protocol/work-log.ts),
[core/external-agents-activity.ts](../../core/external-agents-activity.ts),
[core/work-log/transcripts.ts](../../core/work-log/transcripts.ts),
[core/work-log/service.ts](../../core/work-log/service.ts),
[core/work-log/commands.ts](../../core/work-log/commands.ts) and
[WorkLogPanel.tsx](../../app/renderer/work-log/WorkLogPanel.tsx). The primary core starts
watching after workspace readiness; secondary worktree views do not create producers.
The panel offers Pause/Resume and configuration; reading its state alone never
starts a model. The private Git `swarm-work-log/watcher.json` preference remembers
Pause across core/app restarts, independently of existing settings/attempt state.
Other windows observe it within three seconds and recheck before inference and
publication. A publication lock orders cross-window Pause against the final
document write: output either lands before Pause returns or is withheld. Disposal
cancels the owned summary without saving a user Pause. Idle inputs make no model
call. One private per-session checkpoint records the validated transcript identity,
absolute complete-line position and anchor in append order. It advances for paid
milestones, terminals and non-billable aborts, so milestone and terminal handling
cannot alternate over already paid bytes. A missing terminal turn ID is accepted
only inside an active owned span. If a closed checkpoint falls outside the bounded
tail, only an explicit different terminal turn bridges the gap; ambiguous milestones
remain excluded. Failed attempts are not replayed. A persisted first-seen window batches milestone evidence for the configured delay,
survives restart and does not reset when more evidence arrives. Errors back off
without shortening that delay, and malformed state is not overwritten.
Checkpoint kind and bounded turn provenance prevent an aborted, nested or prior
terminal span from being revived as a later completion. Lines and checkpoint
anchors are measured from the original bytes, and command admission accepts only
a concrete top-level command prefix rather than command-looking quoted text.
An explicit
Record outcome action appends an idempotent Ditz comment to a known completed
issue; it does not close worker issues. Private transcript bytes remain local.
This is a small producer over the registered roster, not another fleet platform.

Saved entries describe historical accomplishments, independently of the agent's
current lifecycle. Explicit `milestone` provenance keeps an ongoing accomplishment
`working` without claiming the task or turn is complete. An actual `task_complete`
produces a separate `terminal` outcome that is `completed`, or `failed` when the
event has an explicit error; final-looking assistant prose followed by
`turn_aborted` is not completion. Recording in Ditz changes only `recorded` and
the task linkage, never execution status. Starting a later turn leaves earlier
outcomes unchanged. The live agent label comes from its separate observed
session lifecycle, not from the latest saved outcome.

On reading a legacy Work Log, the service makes a bounded non-model pass over
registered completion evidence under its existing producer lock. Exact matching
session/boundary/time data repairs origin-less old `working` rows without changing their
outcome text, recorded flag or summarizer attempt history. A saved attempt alone
corroborates a turn boundary but not success, so its state becomes `unknown`.
Explicit milestone rows are never legacy-repaired. Unmatched user-authored rows
stay intact; missing transcripts are not guessed.
The repair works while summarization is stopped and never re-bills old history.

`App.tsx` owns the existing `useWorkLog` observation and mounts its panel once in
`AgentDock`, immediately left of Activity and independent of the agent sidebar's
scrolling/folding. The rail and pure `WorkLogEntryDetail`
reuse that same observation. App stores the selected outcome ID, not a frozen
entry object, so a repaired state or newly recorded flag appears in an already
open document. Temporary recovery keeps a closable placeholder for that ID; it
does not reopen source or steal focus. Opening an outcome does not start a model,
record a task or create another polling consumer.

The compact Activity body has no second Activity/Live heading. Its timestamped
rows use the same horizontal separators as Work Log, retain their original
session/worktree callbacks, and stay mounted during ordinary background reads.
Only paused or disconnected observation needs a status note; example sessions
remain labelled. Tool results are operations too, while assistant recaps are not.
Summary settings lives behind a keyboard-accessible gear next to explicit
Pause/Resume. A running empty Work Log says it is watching for concrete agent updates.
The shared `RunStatus.tsx` presents the core lifecycle with visible text and
different shapes: a yellow square for working, paused bars for waiting on input,
a red hollow slashed circle for failure, and a filled green circle for completion.
Missing evidence is neutral and never invents progress. The rail and agent
information use the current session lifecycle. Work Log rows and documents use
**Milestone**, past-tense **Completed turn**, **Failed turn**, or neutral **Saved update** labels,
not the current-agent badge. In particular, an unmatched legacy `working` entry
does not say its agent is still in progress. This changes only presentation;
historical text, stored states and recorded flags stay intact.

The neighboring `BuildResources.tsx` instrument counts actual provided build
jobs, puts running/queued work before failed/completed rows, and preserves full
failure messages. A running job with zero placeholder progress is indeterminate,
not a measured zero percent. Resource placeholders do not become CPU/memory
charts; the separate optional example profile stays explicitly illustrative.

## Build connections

The listed modules feed `//:quality_sources` and `//:desktop-bundle`.
[tools/demo-journal/BUILD.bazel](../../tools/demo-journal/BUILD.bazel) declares
`//tools/demo-journal:author` for supervised authoring and
`//tools/demo-journal:smoke` for its packaged evidence journey.
Real summaries and controlled transcript fixtures must remain distinguishable in
verification without covering the normal UI in diagnostic prose.

The Work Log modules use the same root source/bundle targets. Its dedicated
`//tools/work-log:check` target runs the focused service/panel checks.
`//tools/work-log:awareness-check` checks automatic startup, persistent Pause,
ongoing milestone batching/checkpoints, cross-window cancellation/deduplication,
terminal semantics and task/plan refresh without real models.
`//tools/demo-agents:unit` checks the shared reader and exact-session rail summaries;
`//tools/operator-cockpit:checks` verifies refreshed outcome documents in the
actual App with retained editor, cursor, focus and graph instances.
`//tools/live-observers:unit` checks raw operation ordering, originating-session
activation and refresh retention; `//tools/build-resources:regressions` checks
truthful counts, progress, examples and preserved source state.
`//tools/operator-cockpit:activity-refresh` checks central per-source refresh,
client-published rows, explicit overview/event selection, current registration
and workspace identity, and retained editor/composer/graph state.
`//tools/activity-usability:smoke` exercises the packaged application with two
explicitly labelled private JSONL proof fixtures on an owned virtual desktop.
It checks raw event timestamps, keyboard settings and retained source/draft/cameras;
those recorded operations are not executed commands or model responses.
The optional `//tools/activity-usability:central-refresh` journey extends that
same harness with controlled transcript appends, automatic central publication
and actual Refresh/overview navigation. It does not execute those operations.

See [logical changelog](../logical-changelog.md) for saved-report behavior and
[the operator plan](../swarm-operator-hour.md) for the new online Work Log.
