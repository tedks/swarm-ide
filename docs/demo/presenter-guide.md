# Present the working cockpit

Use [the five-minute tour](../demo.md) as the click path. Focus on one story:
understand a component, open its source, follow the agent changing it, and inspect
the resulting work.

## Before sharing

Open a trusted checkout with the [installed Linux command](../linux-install.md).
Fetch its local Ditz metadata if you want tasks. For live agents, authenticate
Codex normally and use **New agent**, or connect an existing Codex tmux session.
Verify the conversation you intend to show before the presentation. Do not
distribute private registries, transcripts or account files.

The design/source part requires no model account. Reading registered agents or
existing outcomes does not request a turn. Leave Work Log stopped unless you
intend to run the summary worker, and do not send test messages to a busy agent.

## Five-minute narration

| Time | Show | Say |
| --- | --- | --- |
| 0:00–1:00 | Workspace components → Read design → source link | “The design lives beside the code; I can move from a responsibility to its implementation.” |
| 1:00–2:00 | Source, file Context, task document and blockers | “Different views explain the same work without losing my editor.” |
| 2:00–3:00 | New agent, or registered conversation and terminal command | “I can start Codex here or follow the same agent I already use in tmux.” |
| 3:00–4:00 | Activity event → source/patch; Work Log outcome | “Activity shows operations. The Work Log explains what was accomplished.” |
| 4:00–5:00 | Agent worktree → file/diff → Launch workspace | “The whole workspace follows the agent's branch; my original editor is still there when I return.” |

For a no-model presentation, spend the last two minutes on authored task/design
links and source/build dependencies, or observe an already-running agent without
sending. **Generate component plan**, **New agent**, steering and Work Log
**Start** are deliberate model actions, not prerequisites for browsing.

## Keep the claims close to the screen

The Worktree icon/selector switches the main workspace among registered worktrees
of the same repository. Activity's per-event source/patch inspector is read-only.
Build graph observation loads Bazel definitions automatically; it is not a binary
build. **Build selected target** compiles an observed rule, with actual output in
**Builds & resources**. The service graph reads supported repository declarations;
the included example is data, not a special application command.

The live Work Log has explicit Start/Stop and model settings. Saved summaries are
a different, historical source. Opening a report does not rerun its checks.
A queued message may not have reached a usable receipt yet; copy its text or
open the same terminal before retrying. See [current limits](../demo.md#current-limits).

If task metadata is missing, fetch/reconcile the local Ditz branch. Tasks update
when that ref changes, but Swarm does not fetch the remote. Use the sidebar's
search and All filter for a particular completed issue instead of hunting through
a large task graph. Missing plans or services do not make the project empty.

Save edits before closing. Prefer a disposable checkout for an editing demo;
do not alter a busy agent's files just to show an effect.

## Existing verification, not a new recording

PR111 exercised the installed Linux app against another real repository and
registered Codex agents; the checked terminal agent survived IDE close.
PR112 exercised Linux/amd64 Docker/noVNC input and real source opening.
Their detailed scope is in the [evaluator guide](../evaluator-install.md#what-has-actually-been-exercised).

The older `//tools/demo-tour:smoke` proof followed the September 7 task-context
journey (Plan → D4 → source → Attach/Prepare → saved Activity) on an owned virtual
desktop. That historical run does not validate this newer click path or the
latest source tree. It is not a first-user setup requirement. Development proof
tooling belongs in the [development loop](../development-loop.md).
