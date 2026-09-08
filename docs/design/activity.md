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
| Online Work Log | [WorkLogPanel.tsx](../../app/renderer/work-log/WorkLogPanel.tsx), [service.ts](../../core/work-log/service.ts) | Explicit Start/Stop, configurable summary worker and durable outcomes |
| Recorded logical journal | [JournalPanel.tsx](../../app/renderer/changelog/JournalPanel.tsx), [changelog.ts](../../core/changelog.ts) | Reads validated `.swarm/changelog.json` |
| Journal authoring | [changelog-authoring.ts](../../core/changelog-authoring.ts) | Exports evidence and validates supervised summary output |
| GitHub PR view | [GithubPullRequests.tsx](../../app/renderer/changelog/GithubPullRequests.tsx), [github-prs.ts](../../core/github-prs.ts) | Deliberate bounded refresh through ordinary `gh` |
| Readable times | [ActivityTime.tsx](../../app/renderer/ActivityTime.tsx) | Short visible time with full timestamp on hover |

The saved journal is operational, but it is not the running in-app summarizer.
The separate Work Log watches registered work at meaningful boundaries, batches
new evidence and uses one in-flight configurable harness/model worker, default
Codex `gpt-5.6-luna`. It writes deduplicated Ditz accomplishment notes through
the CLI. F7 supplies the
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

The pipeline is: known registered transcript tails → meaningful
turn boundaries → one summary → human outcome entries in `.swarm/work-log.json`.
Its modules are [protocol/work-log.ts](../../protocol/work-log.ts), [core/work-log/service.ts](../../core/work-log/service.ts) and
[WorkLogPanel.tsx](../../app/renderer/work-log/WorkLogPanel.tsx). The panel offers explicit Start/Stop and
configuration; reading its state alone must not launch a model. An explicit
Record outcome action appends an idempotent Ditz comment to a known completed
issue; it does not close worker issues. Private transcript bytes remain local.
This is a small producer over the registered roster, not another fleet platform.

Saved entries describe historical completed turns, independently of the agent's
current lifecycle. New outcomes are `completed`, or `failed` when their terminal
event has an explicit error. Recording in Ditz changes only `recorded` and the
task linkage, never execution status. Starting a later turn leaves earlier
outcomes unchanged. The live agent label comes from its separate observed
session lifecycle, not from the latest saved outcome.

On reading a legacy Work Log, the service makes a bounded non-model pass over
registered completion evidence under its existing producer lock. Exact matching
session/boundary/time data repairs old `working` rows without changing their
outcome text, recorded flag or summarizer attempt history. A saved attempt alone
corroborates a turn boundary but not success, so its state becomes `unknown`.
Unmatched user-authored rows stay intact; missing transcripts are not guessed.
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
Start/Stop. A running empty Work Log says it is watching for completed turns.
The shared `RunStatus.tsx` presents the core lifecycle with visible text and
different shapes: a yellow square for working, paused bars for waiting on input,
a red hollow slashed circle for failure, and a filled green circle for completion.
Missing evidence is neutral and never invents progress. The rail and agent
information use the current session lifecycle. Work Log rows and documents use
past-tense **Completed turn**, **Failed turn**, or neutral **Saved update** labels,
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
