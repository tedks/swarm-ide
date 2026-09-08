# Five minutes: understand the project, follow the work

Open Swarm on its own checkout using the [quick start](../README.md#linux-quick-start).
For the live-agent part, associate an existing Codex tmux session using the
[evaluator guide](evaluator-install.md#include-agents-already-running-in-tmux).
Without one, do the design/source/task portion and skip the agent steps—there
are no pretend workers to discover.

## 1. Read the design

The **Workspace** home keeps four graphs together: components, task dependencies,
repository entries and build/service views. In **Components**, select a component,
then **Read design**. Follow its child components, connections and source links.
**System plan** also opens the design document.

These are repository-authored designs in `.swarm/plans.json` and `docs/design/`,
not an automatically inferred architecture. On another repository without this
index, use directory/source browsing rather than expecting Swarm's own design.

## 2. Follow a component into source and tasks

Open a source link from the selected component, or use **Ctrl-K → Open repository
path**, enter `core/tasks/draft-context.ts`, and press Enter. The graphs become a
smaller companion area beside the text. **Workspace** returns to the overview
without throwing away the source tab.

Click a task in the sidebar to see its document, updates and blocking
relationships in Context. Swarm's local Ditz branch is required for this portion;
choose **All** to include completed work. Authored component/task links are the
way to follow a specific feature; the task graph's coverage counter tells you
when the full issue set is not drawn.

Return to the source tab. Context shows direct and indirect Bazel target
membership when available; target links navigate to the build view.
**Build graph** queries dependencies, not binaries. Refresh is also available in
the central toolbar's **⋯ → Refresh build graph** menu. Don't use the old
**Build service topology** action as a generic project build; it still targets
Swarm's service example.

## 3. Follow an actual agent

Select a registered agent from the left rail. Its conversation opens in the
bottom dock. Named conversation tabs and **Ctrl-Tab / Ctrl-Shift-Tab** cycle
agents while focus is in that pane. The rail shows current lifecycle and the
latest available Work Log summary; a past completed turn is not today's status.

Read a message in the IDE, then use the **terminal icon** to copy the checked
tmux attach command and inspect the same owner there. This does not launch a
second agent. If you choose to steer it, **Enter** sends and **Shift-Enter** adds
a line; your submitted text stays copyable while queued.

Allow the current turn to finish before expecting a response. Some queued labels
and transcript refreshes can lag; check the same conversation in tmux before
resending. The current demo does not promise an immediate receipt.

## 4. See actions and outcomes separately

Click the **Activity** heading to open the live operation list in the center.
It shows timestamped commands, file edits and tool results from registered
transcripts. New operations refresh in the overview. Selecting one event keeps
its details open; return to the Activity overview to follow new rows.

Click a file event to inspect its registered worktree's source, recorded patch
when available, and current diff. A recorded patch is the agent's earlier edit;
the current diff is what is on disk now.

The neighboring **Work Log** answers “what was accomplished?” Open an outcome
for its explanation and links. Existing outcomes need no model call. **Start**
enables the online summarizer; its gear configures the worker, default Codex
`gpt-5.6-luna`. Leave it stopped for a no-model tour.
**Record outcome** can append a note to an already-completed Ditz issue; it does
not close the task for you.

The Activity document also has **Saved summaries** and **Pull requests** views.
Saved summaries are historical reports. **Refresh PRs** reads current GitHub
state using normal `gh` authentication; it is an explicit action.

## 5. Explore the agent's actual worktree

Use the selected agent's **worktree icon**. Today this opens a read-only worktree
browser in the central area, with directories, source and changes against master
(or the reported base). Open a changed file to inspect its diff. Return to the
workspace and your original editor remains where you left it.

This is real registered-worktree inspection, but it does **not yet switch the
main directory browser into that worktree**. For normal editing there, launch a
separate installed window on that root:

```bash
swarm --workspace /absolute/path/to/agent-worktree \
  --user-data-dir "$HOME/.config/swarm-ide-agent-worktree"
```

Only do that with a project you intend to edit; the agent may be changing files
there too. Closing Swarm leaves externally owned tmux agents running. Save source
edits before closing any window.

## Current limits

The next working-loop increment is improving native worktree switching,
back/forward navigation, selected-target builds, component relationship clarity,
conversation refresh and receipt status. Until those changes land, use the
current worktree inspector/terminal path and treat dependency queries separately
from builds.

Live cloud/deployment metrics are not supplied just by opening a project.
Available local Node/Python servers, Docker containers and manifest links depend
on the project's real configuration and running processes. Example latency and
CPU/memory profiles remain illustrative.

The Mac Docker/noVNC route supports the design/source subset, not this live
host-agent/build workflow. See [setup and platform limits](evaluator-install.md).
This tour describes the current controls; its documentation update is not a new
end-to-end GUI test.
