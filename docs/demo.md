# Five minutes: a feature, its context, and its logical history

Swarm is an engineering organization you can inspect from the inside. This
tour follows Swarm's own task-context feature: why it exists, how it was divided
into work, what an implementing agent would receive, and what changed.

Start with the [Linux quick start](../README.md#linux-quick-start), opening
Swarm's checkout and fetching its local `ditz-metadata` branch as described
there. No model account or external-session registry is needed for the core
tour. Use a disposable checkout for experimental edits. The
[installation guide](evaluator-install.md) covers prerequisites and recovery;
the [presenter guide](demo/presenter-guide.md) covers timing and evidence boundaries.

## 1. Intent → component → context

Choose **Plan → Plans & components → Load plan index**. Select **Turn repo tasks
into bounded agent context** in the graph or its keyboard outline. Its parent
is the product plan; the links are authored in `.swarm/plans.json`, not an LLM's
current guess about the repository.

Open **Read doc · docs/demo/task-context-briefing.md**, then choose **Why this
context?** to reach the supporting guidance. The briefing connects intent,
contract and implementation lessons.
The full design is **Read doc · docs/repo-task-draft.md**; its opening status
paragraph still describes the historical D3-only stage, not today's Prepare.
**contract · protocol/agent-task.ts** opens the shared contract. These are
ordinary working files and navigable guidance, not proof a provider loaded them
or permission to execute.

## 2. Component → actual work → source

Expand **Tasks** and **Refresh tasks** if needed. From the component, activate
**Inspect task · repo-task-context-core-d4**. This is the actual closed task
“Prepare authoritative pinned repository-task context.” Adjacent D2–D6 links
show design, common contract, core, UI and integration as separate records.
To find them in the rail, select **All** and search the full ID.

Clicking a task title or task-graph node opens its document in the main area;
**Show task document** also returns to it from Context. Context shows actual issue
metadata, recorded updates, **Blocked by** / **Blocking**, explicit source links
and only explicitly associated agent evidence. It does not include the separate
trusted-local conversation. See [task workspace](task-workspace.md).

**Plan → Task blockage →
Load dependency graph** shows recorded dependencies, separately from plan
containment. The initial overview shows 16 tasks; **Focus selected task** narrows
to direct neighbors and **Whole projection** shows the loaded projection.
Read its coverage counter: it loads at most 64 details, and
missing/unread edges are not inferred. The rail's search does not filter the
graph. This is recorded work, not a scheduler or readiness score.

Return to the component's **Open source · core/tasks/draft-context.ts**. The
historical D4–D6 records have no explicit file references, so this authored source
link is the connection—not a fabricated task Reveal. Records that do have file
references expose **Reveal working file**. **Ctrl-K → Open repository path** is
the exact-path fallback.

## 3. Source → build relationships → a fixed-source draft

Switch to **System** and open **Build graph**. It queries local Bazel declarations
on demand; **Refresh build graph** deliberately resamples. Directory **Build
links** connects observed source membership to targets. A fresh declaration
query is not a successful binary build. Missing or retained evidence stays
labelled; see [coverage and limits](dynamic-build-graph.md).

File Context also observes direct and indirect target membership on demand,
without forcing a fresh query every time. **Context · Global** separates working,
built and deployed observations. For the metrics demo, open
`examples/checkout-world/services/fraudcheck/fraudcheck.ts`: its declared target
can associate an **Illustrative** latency table. **Builds & resources → Example
profile** shows example CPU/memory distributions. These are authored values, not
production telemetry; no deployed-file mapping is invented. See
[associations and scope](context-metrics-demo.md).

Return to `core/tasks/draft-context.ts`. Choose **Ctrl-K → Ask an agent about
this focus** and enter:

> Explain this module's task revision checks and identify the tests that defend
> them. Do not change files.

The draft captures that source focus. Browsing another document or graph does
not retarget it. An unsaved edit in a disposable checkout can demonstrate buffer
retention, but preparation reads disk, not unsaved editor text.

## 4. Actual task → bounded prepared context

Inspect `repo-task-context-core-d4` again and choose **Attach this task to draft**.
Review the proposal and choose **Append — keep instructions**. There is one
read-only task slot; attaching does not paste task prose over your request.

Choose **Prepare disk context**. Open **Recorded repository task · immutable**,
**Disk attachments**, and **Exact submitted prompt**. These show real local
Git/YAML materialization and disk reads. Task metadata and working source remain
separate. A blank historical description remains blank; no agent report is
silently substituted for it.

Preparation does **not** run a model. **Launch read-only run** belongs to the
isolated profile and remains disabled under its unverified effective-policy gate.
Linked designs are not
automatically included: inspect the exact submitted prompt. If source or task
metadata changes, refresh, explicitly reattach when needed, and prepare again.

### Optional: actually run Codex

With your normally configured and authenticated Codex installed in the IDE's
launch PATH, use the separate **Codex · trusted local** section in the dock.
Choose **Prepare trusted-local context** for the same fixed-source draft and
attached task, inspect its exact prompt, check **Launch in this workspace with
normal Codex permissions**, then **Launch trusted-local Codex**. This deliberately
runs a model using normal configuration, tools and approvals—not extra autonomy
or a copied account. **Send next turn**, **Steer current turn** and **Stop
conversation** operate on that conversation.

One trusted conversation is active per core. Renderer refresh can observe it;
app/core shutdown stops it, and the IDE does not restore it across core restarts
or add it to task history. Save first to include editor changes. The
[trusted-local guide](trusted-local-execution.md) covers supported approvals and
unsupported interactions. Skip this segment to keep the tour model-free.

## 5. Work → logical outcome, not another wall of logs

Click **Recent Activity** to open **Activity log**, or select one of its entries. The
expanded entry lives in the main text area: intent, outcome, decision and
supporting evidence. Swarm includes supervised-agent-generated, **recorded**
summaries of this same task-context work. They combine Git observations with
attributed agent/check reports; opening a card does not rerun checks, and
reconstructed reasoning is labelled. Inspect **Evidence, not authority** and
deliberately open an affected file. Your draft remains independent.

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
A private registry is required and is not shipped. D4/D5/D6 labels in a report
are not verified session IDs and do not automatically select an agent; choose a
known registration manually or skip this segment. See
[external observations](demo-agents.md).

The result is one inspectable story across distinct views—not one universal
graph. Local browsing and preparation need no model account. Trusted-local
execution is an optional real operation with your installed account; external
session observation stays read-only. Automatic task-to-session linking and
autonomous summarization are not implemented.
