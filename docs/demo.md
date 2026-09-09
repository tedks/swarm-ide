# Five minutes: understand the project, follow the work

Open Swarm on its own checkout using the [quick start](../README.md#linux-quick-start).
The design/source part needs no model account. For live work, use **New agent**
with your normally installed and authenticated Codex, or associate an existing
Codex tmux session using the
[evaluator guide](evaluator-install.md#include-agents-already-running-in-tmux).

## 1. Read the design

The **Workspace** home keeps four graphs together: components, task dependencies,
repository entries and build/service views. In **Components**, select a component,
then **Read design**. Follow its child components, connections and source links.
Containment shows how the design is organized; selecting an architectural
connection explains the contract between components. **System plan** also opens
the design document.

These are repository-authored designs in `.swarm/plans.json` and `docs/design/`,
not a guessed architecture. On another repository without an index, directory
browsing works immediately. **Generate component plan** optionally starts a real
Codex design agent to create the index and documents. Its settings expose the
prompt, model and reasoning (default `gpt-5.6-sol`, `xhigh`). Follow it through
**View generation agent** and review the resulting files. It does not overwrite
an existing or malformed index; repair those files instead.

## 2. Follow a component into source and tasks

Open a source link from the selected component, or use **Ctrl-K → Open repository
path**, enter `core/tasks/draft-context.ts`, and press Enter. The graphs become a
smaller companion area beside the text. **Workspace** returns to the overview
without throwing away the source tab.

Click a task in the sidebar to see its document, updates and blocking
relationships in Context. Swarm's local Ditz branch is required for this portion;
choose **All** to include completed work. Authored component/task links are the
way to follow a specific feature. The graph no longer truncates tasks to a fixed
node count; the sidebar's search is useful in a large repository.

Return to the source tab. Context shows direct and indirect Bazel target
membership when available; target links navigate to the build view.
Supported Bazel declarations load automatically while the Linux window is active,
including after definition changes. **Build graph** shows those dependencies;
**Refresh dependencies** retries the query when setup changes. Queries may
download declared dependencies and evaluate repository-controlled rules, so use
projects whose tooling you trust.

To compile, select an observed rule and choose **Build selected target**.
**Builds & resources** shows the job's progress, elapsed time, output and **Stop**.
**Add target** expands graph scope; it does not start a build.

The service view reads supported `service.swarm.json` and Compose declarations.
**Refresh services** reloads them. Swarm's example remains ordinary repository
data under `examples/checkout-world/`, not a hardcoded build command. Compose
links describe startup dependencies, not observed calls or deployed health.

Deliberate navigation brings related graph nodes into view where relationships
exist. Background refresh and editor resizing preserve your camera. Use **Fit**
for the full graph and **Alt-Left / Alt-Right** to go back or forward through
navigation history.

## 3. Follow an actual agent

Click **New agent** beside the bottom conversation tabs. Check the displayed
workspace, type a concrete task and press **Enter** or the send arrow. No source
attachment, Observe or Prepare step is required. **Settings** optionally changes
the model; your normal Codex tools and approvals apply.

Alternatively, select a registered agent from the left rail. Its conversation opens in the
bottom dock. Named conversation tabs and **Ctrl-Tab / Ctrl-Shift-Tab** cycle
agents while focus is in that pane. The rail shows current lifecycle and the
latest available Work Log summary; a past completed turn is not today's status.

For a registered tmux agent, use the **terminal icon** to copy the checked
tmux attach command and inspect the same owner there. This does not launch a
second agent. If you choose to steer it, **Enter** sends and **Shift-Enter** adds
a line; your submitted text stays copyable while queued.

Conversation reads refresh automatically while visible. Hover a submitted
message's status icon for **Sending**, **Sent to queue**, **Not sent** or
**Unconfirmed**. Queue acceptance is not a read receipt or task completion; check
the same conversation in tmux before resending uncertain messages.

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

Use the selected agent's **worktree icon**, or choose a registered worktree from
the sidebar's **Worktree** selector. The main directory browser, source editor,
Context and builds now use that worktree. Explore files and inspect changes
against master or the reported base; choose **Launch workspace** to return.
Editor tabs and buffers stay with their worktree rather than following a
same-named file into another branch.

Switching supports checked, registered worktrees of the launch repository—not
arbitrary repositories or automatic worktree creation. For an unrelated project,
open another installed window with its own profile. The agent may be changing
files too: reconcile disk changes before saving. Activity's individual source
and patch inspector remains read-only.

Save edits before closing. External tmux agents keep running; IDE-owned runs stop
with the app/core and are not automatically resumed from saved history.

## Current limits

Build graphs still show a bounded projection (up to 2,000 targets and 8,000
edges), with partial coverage reported rather than silently claiming the whole
repository. Task graphs have no fixed node cutoff. Re-clicking the already-selected
task in the sidebar does not yet recenter after a manual pan; choose another task
and return, or use the graph/outline selection.

Plan generation is an agent task, not guaranteed one-click documentation:
interrupted runs may leave files, and the resulting index still needs to validate.
Agent markers on graphs require usable paths and graph membership; not every
agent operation supplies a location.

Live cloud/deployment metrics are not supplied just by opening a project.
Available local Node/Python servers, Docker containers and manifest links depend
on the project's real configuration and running processes. Example latency and
CPU/memory profiles remain illustrative.

The Mac Docker/noVNC route supports the design/source subset, not this live
host-agent/build workflow. See [setup and platform limits](evaluator-install.md).
