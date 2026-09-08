# Present the working cockpit

Use [the five-minute tour](../demo.md) as the click path. Focus on one story:
understand a component, open its source, follow the agent changing it, and inspect
the resulting work.

## Before sharing

Open a trusted checkout with the [installed Linux command](../linux-install.md).
Fetch its local Ditz metadata if you want tasks. Connect an existing Codex tmux
session if you want live agents; verify the expected agent appears before the
presentation. Do not distribute private registries, transcripts or account files.

The design/source part requires no model account. Reading registered agents or
existing outcomes does not request a turn. Leave Work Log stopped unless you
intend to run the summary worker, and do not send test messages to a busy agent.

## Five-minute narration

| Time | Show | Say |
| --- | --- | --- |
| 0:00–1:00 | Workspace components → Read design → source link | “The design lives beside the code; I can move from a responsibility to its implementation.” |
| 1:00–2:00 | Source, file Context, task document and blockers | “Different views explain the same work without losing my editor.” |
| 2:00–3:00 | Registered conversation, tabs, terminal command | “This is the existing agent, not a second copy. I can keep using its terminal.” |
| 3:00–4:00 | Activity event → source/patch; Work Log outcome | “Activity shows operations. The Work Log explains what was accomplished.” |
| 4:00–5:00 | Agent worktree → changed file/diff → original source | “I can inspect the agent's real branch while keeping my own work intact.” |

Without registered agents, spend the last two minutes on authored task/design
links and source/build dependencies. Say that live-agent observation requires
association; do not substitute a synthetic agent without labelling it.

## Keep the claims close to the screen

The current worktree action opens a central read-only inspector, not the main
directory browser. Native worktree switching and selected-target builds are
pending. Build graph observation reads Bazel definitions; it is not a successful
binary build. The service-topology action is specific to Swarm's example.

The live Work Log has explicit Start/Stop and model settings. Saved summaries are
a different, historical source. Opening a report does not rerun its checks.
A queued message may not have reached a usable receipt yet; copy its text or
open the same terminal before retrying. See [current limits](../demo.md#current-limits).

If task metadata is missing, fetch/reconcile the local Ditz branch. Tasks update
when that ref changes, but Swarm does not fetch the remote. Use the sidebar's
search and All filter for a particular completed issue instead of hunting through
a partial task graph. Missing plans or services do not make the project empty.

Save edits before closing. Prefer a disposable checkout for an editing demo;
do not resize-stress the app or alter a busy agent's files just to show an effect.

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
