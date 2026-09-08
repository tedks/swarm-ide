# Five minutes: a feature, its context, and its logical history

Swarm is an engineering organization you can inspect from the inside. This
tour follows Swarm's own task-context feature: why it exists, how it was divided
into work, what an implementing agent would receive, and what changed.

Start with the [Linux quick start](../README.md#linux-quick-start), opening
Swarm's checkout and fetching its local `ditz-metadata` branch as described
there. No model account or external-session registry is needed for the core
tour. Use a disposable checkout for experimental edits. The
[installation guide](evaluator-install.md) covers prerequisites and recovery;
the [presenter guide](demo/presenter-guide.md) covers timing and what each part demonstrates.

## 1. Intent → component → context

Choose **Plan → Plans & components → Load plan index**. Select **Turn repo tasks
into bounded agent context** in the graph or its keyboard outline. Its parent
is the product plan; the links are maintained in `.swarm/plans.json`.

Open **Read doc · docs/demo/task-context-briefing.md**, then choose **Why this
context?** to reach the supporting guidance. The briefing connects intent,
contract and implementation lessons.
The full design is **Read doc · docs/repo-task-draft.md**; its opening status
paragraph still describes the historical D3-only stage, not today's Prepare.
**contract · protocol/agent-task.ts** opens the shared contract. These are
ordinary working files. Opening a link lets you read the guidance; it does not
attach that document to an agent's prompt.

## 2. Component → actual work → source

Expand **Tasks** and **Refresh tasks** if needed. From the component, activate
**Inspect task · repo-task-context-core-d4**. This is the actual closed task
“Prepare authoritative pinned repository-task context.” Adjacent D2–D6 links
show design, common contract, core, UI and integration as separate records.
To find them in the rail, select **All** and search the full ID.

Clicking a task title or task-graph node opens its document in the main area;
**Show task document** also returns to it from Context. Context shows actual issue
metadata, recorded updates, **Blocked by** / **Blocking**, explicit source links
and linked agent activity. **Trusted conversations** lists
runs launched with this task attached; **Open conversation** or **Open
saved conversation** selects that run in the dock. Completing a turn does not
close the issue. See [task workspace](task-workspace.md).

**Plan → Task blockage →
Load dependency graph** shows recorded dependencies, separately from plan
containment. The initial overview shows 16 tasks; **Focus selected task** narrows
to direct neighbors and **Whole projection** shows the loaded projection.
The counter shows how much is loaded, up to 64 task details. Dependencies outside
that set may be missing. The rail's search does not filter the graph. This view
shows Ditz records; it does not schedule work.

Return to the component's **Open source · core/tasks/draft-context.ts**. The
historical D4–D6 records have no explicit file references, so this authored source
link connects the task to its code. Records that do have file
references expose **Reveal working file**. **Ctrl-K → Open repository path** is
the exact-path fallback.

## 3. Source → build relationships → a fixed-source draft

Switch to **System** and open **Build graph**. It queries local Bazel declarations
on demand; **Refresh build graph** deliberately resamples. Directory **Build
links** connects observed source membership to targets. A fresh declaration
query reads declarations without building binaries. Missing or older results stay
labelled; see [coverage and limits](dynamic-build-graph.md).

File Context also observes direct and indirect target membership on demand,
without forcing a fresh query every time. **Context · Global** separates working,
built and deployed observations. For the metrics demo, open
`examples/checkout-world/services/fraudcheck/fraudcheck.ts`: its declared target
can associate an **Illustrative** latency table. **Builds & resources → Example
profile** shows example CPU/memory distributions. These are authored values, not
production telemetry. Deployment mappings are shown only when available. See
[associations and scope](context-metrics-demo.md).

If the task document is still in the center, choose its **Return to source**
button. Select the `core/tasks/draft-context.ts` source tab again, or use
**Ctrl-K → Open repository path** to open that exact file after the metrics detour.
Choose **Ctrl-K → Ask an agent about
this focus** and enter:

> Explain this module's task revision checks and identify the tests that defend
> them. Do not change files.

The draft captures that source focus. Browsing another document or graph does
not retarget it. An unsaved edit in a disposable checkout can demonstrate buffer
retention, but preparation reads disk, not unsaved editor text.

## 4. Task → prepared agent context

Inspect `repo-task-context-core-d4` again and choose **Attach this task to draft**.
Review the proposal and choose **Append — keep instructions**. There is one
read-only task slot; attaching does not paste task prose over your request.

Choose **Prepare disk context**. Open **Recorded repository task · immutable**,
**Disk attachments**, and **Exact submitted prompt**. These show real local
task content from Git and source from disk. The preview preserves the task's
saved description, including an empty description on older records.

Preparation does **not** run a model. **Launch read-only run** belongs to the
isolated profile and remains disabled because its restrictions have not been verified.
Linked designs are not
automatically included: inspect the exact submitted prompt. If source or task
metadata changes, refresh, explicitly reattach when needed, and prepare again.

### Optional: actually run Codex

With your normally configured and authenticated Codex installed in the IDE's
launch PATH, use the separate **Codex · trusted local** section in the dock.
Choose **Prepare trusted-local context** for the same fixed-source draft and
attached task, inspect its exact prompt, check **Launch in this workspace with
normal Codex permissions**, then **Launch trusted-local Codex**. This deliberately
runs a model using normal configuration, tools and approvals. **Send next turn**,
**Steer current turn** and **Stop
conversation** operate on that conversation.

Use **New conversation** to prepare another run, then the run list to switch
between up to eight live conversations with independent message composers.
Controls affect the selected conversation, not every agent. Renderer refresh
can re-observe live runs while the core stays alive; app/core shutdown stops
them. Up to twenty saved conversations keep recent output, activity and attached
task links. Restart archives history without automatically resuming conversations;
unsent composers are not a durable backup. Save first to include editor changes. The
[trusted-local guide](trusted-local-execution.md) covers supported approvals and
unsupported interactions. Skip this segment to keep the tour model-free.

## 5. Work → logical outcome, not another wall of logs

Click **Recent Activity** to open **Activity log**, or select one of its entries. The
expanded entry lives in the main text area: intent, outcome, decision and
supporting sources. Swarm includes **saved summaries** of this same task-context
work, written by a supervised agent from Git changes and agent/test reports.
Open a card's source details to inspect the reports or an affected file. Your
draft stays attached to its original source. Reported checks are not rerun when
you open the card.

The update loop is currently **export evidence → supervised summarizer →
validate → Refresh**, not an in-app scheduler.
[Logical changelog](logical-changelog.md) documents the authoring path.

For actual GitHub state, choose **Pull requests → Refresh PRs** in Activity log.
This requires installed `gh` with normal authentication and the opened checkout's
validated github.com origin. It explicitly reads up to 20 PRs across all states;
file links open current working files, not PR revisions. Failures retain prior
results as stale. No CI polling, GitHub mutation or guessed task/agent links is
performed. Skip it if GitHub access is unavailable; recorded Changes still work.

Optional, on an operator-configured installation: **Agent runs → External
sessions → Refresh external sessions** shows fork ancestry, **Conversation ·
read-only** and **Worklog**. **Open conversation in tmux** requires a checked live target.
A private registry is required and is not shipped; the optional
[known-worker registration helper](session-registration.md) creates explicit
entries, not global discovery. D4/D5/D6 labels in a report
are not verified session IDs and do not automatically select an agent; choose a
known registration manually or skip this segment. Observation does not send a
message. To steer a checked live target, review its identity, enter an instruction
and choose **Send message**. The message may wait in the agent's queue before
being read. If delivery cannot be confirmed, check the conversation before
sending again; the IDE will not retry it automatically. The
external process is not IDE-owned and is not stopped when the IDE closes. See
[external observations](demo-agents.md).

The result is one story you can follow across the views. Local browsing and
preparation need no model account. Running Codex uses your installed account;
watching an external session only reads it until you choose Send message.
Task links come from the attached task or the external session's registration.
The saved-summary workflow does not yet run a summarizer inside the app.
