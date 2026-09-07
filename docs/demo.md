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

**Show task document** reads the task in the main area. **Plan → Task blockage →
Load dependency graph** shows recorded dependencies, separately from plan
containment. Read its coverage counter: it loads at most 64 details, and
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

Preparation does **not** run a model. **Launch read-only run** remains disabled
under the current unverified effective-policy gate. Linked designs are not
automatically included: inspect the exact submitted prompt. If source or task
metadata changes, refresh, explicitly reattach when needed, and prepare again.

## 5. Work → logical outcome, not another wall of logs

In **Recent activity**, open **Logical changes** or one of its entries. The
expanded entry lives in the main text area: intent, outcome, decision and
supporting evidence. Swarm includes supervised-agent-generated, **recorded**
summaries of this same task-context work. They combine Git observations with
attributed agent/check reports; opening a card does not rerun checks, and
reconstructed reasoning is labelled. Inspect **Evidence, not authority** and
deliberately open an affected file. Your draft remains independent.

The update loop is currently **export evidence → supervised summarizer →
validate → Refresh**, not an in-app scheduler.
[Logical changelog](logical-changelog.md) documents the authoring path.

Optional, on an operator-configured installation: **Agent runs → External
sessions → Refresh external sessions** shows fork ancestry, **Conversation ·
read-only** and **Worklog**. **Open conversation in tmux** requires a checked live target.
A private registry is required and is not shipped. D4/D5/D6 labels in a report
are not verified session IDs and do not automatically select an agent; choose a
known registration manually or skip this segment. See
[external observations](demo-agents.md).

The result is one inspectable story across distinct views—not one universal
graph. Useful local browsing and preparation work without credentials. Live
managed execution, automatic task-to-session linking and autonomous
summarization are not part of this demo.
