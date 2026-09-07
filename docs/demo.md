# A five-minute tour

Start with the [Linux quick start](../README.md#linux-quick-start), targeting
Swarm's own checkout. Fetch its local Ditz metadata branch as described there
if you want the task portion of the tour. You do not need a model account to
browse source or prepare disk context.

The idea is simple: move from a system to its implementation and the task that
changes it, then inspect the exact context you would give an agent. Keep the
source visible while the surrounding instruments explain it.

## 1. Move through the real repository

Expand **Directory** and enter `core`, then `tasks`. Open `draft-context.ts` in
the source editor. These are actual working-tree entries and file bytes, not a
demo-only directory tree.

Press **Ctrl-K**, type `fraudcheck.proto`, and deliberately select the matching
file result. Search reports when its Git filename inventory was captured and
whether coverage is complete. It is filename/path search, not full-text search.
Use **Open repository path** from the same palette as an exact-path fallback;
for example, enter:

```text
examples/checkout-world/services/fraudcheck/fraudcheck.proto
```

Notice that selecting another surface does not silently replace your open
source tabs. The **Context** pane follows what you inspect, not an inferred
global selection. You can edit and save actual files with **Ctrl-S**; make
experimental edits in a disposable checkout rather than someone else's work.

## 2. Read evidence across views

Swarm includes a small, real Bazel-owned Payments/FraudCheck service example.
After its topology build succeeds, inspect the service graph, interface, and
source declaration links. **Build repository service topology** in Ctrl-K
requests that fixed example build. Its result is not a general service detector
for arbitrary languages or repositories.

Use the Context pane's **Evidence** disclosures to distinguish a working file
from a build-derived observation. A retained result can remain visible while
new work is in progress or an observation has failed; it must not imply fresh
evidence. Unconfigured deployments and metrics are unavailable, not zero.

The separate **Build graph** now queries the registered repository's local Bazel
declarations on demand. Open it, or enable directory **Build links**, then use
**Refresh build graph** to retry or deliberately resample. Observed local BUILD,
`.bzl`, module and filename-membership changes trigger refresh while a consumer
is visible; the previous graph remains labelled while new work runs or fails.
These are declaration observations, not successful binary builds. Unsupported
roots/runtimes are unavailable, never replaced with a historical Swarm capture.
See [Build graph coverage and limits](dynamic-build-graph.md) for pinned Bazel 7,
partial/external/ignored-input limits. In compact layouts, scroll the Build pane
to expose its graph or controls; source and draft remain independent.

## 3. Go from task to source without losing your place

Expand **Tasks**, choose **Refresh tasks**, and inspect an issue. Its description,
status, **Blocks** / **Blocked by** relationships, and metadata revision are read
from the local Ditz branch. A dependency entry records planning information; it
does not authorize dispatch or prove that a task is ready.

Use **Show task document** to read the task beside source. If it records an
explicit file reference, **Reveal working file** opens that path only when you
activate it. **Return to source** returns to your source surface. A file's
Context can also show explicit task backlinks when that metadata is available.
No link means “none recorded in this evidence,” not “nothing is related.”

## 4. Inspect what an agent would receive

With a source file selected, choose **Ask an agent about this focus** in Ctrl-K.
The launch draft captures that source focus; subsequent navigation does not
retarget it. Write a small instruction such as “Explain this module's task
revision checks and identify the tests that defend them.”

To include a repository task, inspect a current task and select **Attach this
task to draft**. Review the proposed source and metadata pin, then explicitly
keep or clear your existing instructions. There is one read-only task slot;
the task description is not silently pasted over your instructions.

Choose **Prepare disk context**. Inspect the source attachment, exact prompt,
context hash, and, when attached, the task's metadata commit, issue-blob hash,
and core-materialized content. Preparation reads disk, not unsaved editor text.
If inputs change, refresh and explicitly reattach/reprepare rather than treating
an old preview as new authority.

Preparation does not execute a model turn. **Managed agent launch remains
unavailable** until the provider's effective policy is verified. Instruction
source observations are not proof of every instruction a provider might load,
and a selected context manifest is not a filesystem-security boundary.

## 5. Close the explanation with a real change

Return to `core/tasks/draft-context.ts` and the corresponding tests under
`tests/`. The running prototype's pinned task-context implementation is itself
an example of the work being explained. To inspect its actual commit history,
use your normal terminal in the checkout:

```bash
git log --oneline -- core/tasks/draft-context.ts
```

Select a commit there and inspect it with `git show <commit>`; do not call a
mock activity row evidence of that change. Implementation can currently be
performed through a separately supervised Codex/Claude session in the same
workflow, then observed in the repository. That external harness is not a
managed agent launched by this prototype.

The orgs-inspired principle is **selected, traceable context**: give a bounded
task its relevant design, interface contract, operating instructions, and prior
lessons; connect the resulting change and verification back to that task.
Repo-authored instructions and task references make that reasoning inspectable.
This is a workflow intention supported by the visible evidence, not a claim
that every document is automatically loaded or that a particular productivity
improvement has been measured.

## Keep the demonstration honest

The **Demo:** palette commands are optional UI mocks and say so. Deterministic
agent rehearsals exercise product transport and recovery with synthetic runs;
they are not live-provider demonstrations. The current tour does not promise a
browsable plan hierarchy, a task-dependency graph canvas, or imported external
agent ancestry/conversations. Those should appear in a release tour only when
their integrations are actually available and verified.

Use the labels on screen: working versus built, captured versus current,
retained versus refreshed, observed versus unavailable. They are part of the
product, not incidental troubleshooting text.
