# Living designs, Ditz tasks and agent context

A design states how the system fits together. A task records a bounded change and
its dependencies. An agent draft turns a deliberate task/source selection into
instructions. These link to one another, but they are not interchangeable records.

## Lower-level map

| Part | Source of truth | Implementation |
| --- | --- | --- |
| Design/component hierarchy | [.swarm/plans.json](../../.swarm/plans.json) and component documents | [protocol/plans.ts](../../protocol/plans.ts), [core/plans.ts](../../core/plans.ts), [PlanWorkspace](../../app/renderer/plans/PlanWorkspace.tsx) |
| Tasks and blockage | Ditz YAML on `ditz-metadata` | [git-reader.ts](../../core/tasks/git-reader.ts), [metadata.ts](../../core/tasks/metadata.ts), [TaskGraph](../../app/renderer/tasks/TaskGraph.tsx) |
| Current task list | Last complete local metadata revision; automatic adoption after a ref change | [task client](../../app/renderer/tasks/client.ts), [task provider](../../core/tasks/provider.ts) |
| Task detail and links | Revision-pinned task observation | [TaskDetail](../../app/renderer/tasks/TaskDetail.tsx), [TaskContext](../../app/renderer/tasks/TaskContext.tsx) |
| Prepared task context | Fixed attachment plus selected source | [draft-context.ts](../../core/tasks/draft-context.ts), [protocol/agent-task.ts](../../protocol/agent-task.ts) |

Plan relationships are authored in-repo. The core reads a bounded canonical
index and validates its structure; a reference remains a candidate until its
target can actually be opened. The accompanying component graph descends to the
actual source and Bazel boundaries instead of manufacturing a function inventory.
Component document and implementation lists are bounded by the overall 64 KiB
index, not an arbitrary per-component reference count. The UI collapses long
lists and lets the operator expand them. `//tools/living-design:checks`
reads the actual committed index through the core reader, preserving every source
link; design edits must pass that inexpensive check before landing.

The Plan workspace opens the top-level design, using one `usePlanNavigation`
observation and selected component for the outline, document and breadcrumbs.
Its overview places the document beside authored component/interface connections,
with implementation mappings and task dependencies below. Selecting a component
shows its incoming and outgoing connections; build rules stay in their separate
mapping graph. Short authored constraints are displayed beside the design prose.
Long reference lists are expandable; the index does not discard their contents.
`DesignWorkspace` can accept that shared controller through `navigation` and a
`taskPane` slot; `PlanWorkspace` provides the existing task graph once, preserving
its camera when switching between the overview and task-only view.

Build activation exposes `onOpenBuild(label)` for the parallel cockpit integration.
That caller must check the current repository/world; `resolveBazelTarget` resolves only the exact observed
target and declaration. Missing, ambiguous or generated targets do not produce
a guessed BUILD.bazel path. Missing plan files show authoring instructions, not
a fixture system. A core/workspace replacement revokes old link activation;
late plan and document responses cannot replace a newer selection.

Ditz reads are pinned to metadata revisions. The visible list checks the local ref
every five seconds and on focus/reopening, then automatically reads changed
metadata, keeping its old rows until the replacement is valid. One cheap check
can start at most one full read; a further change catches up on the next check.
An unchanged failed revision is not repeatedly scanned. Manual Refresh remains
recovery, including when the initial read never produced a usable list.

Missing relationships and partial coverage must not turn into fabricated “ready”
tasks. Updating the list does not silently retarget a revision-pinned detail or
draft: the operator deliberately selects, reattaches and prepares again to use
newer task text. The core materializes the selected task text rather than trusting
arbitrary renderer-supplied task bytes. Admitted run history keeps the task actually used.

## Build connections

`.swarm/**`, plan/task protocol, core and renderer files feed `//:quality_sources`
and then `//:desktop-bundle`. `//tools/demo-plans:regressions` consumes that
filegroup; `//tools/demo-plans:packaged-plans-test` consumes the desktop bundle,
plan test sources, task-integration sources and owned virtual-desktop support.
These edges are declared in [tools/demo-plans/BUILD.bazel](../../tools/demo-plans/BUILD.bazel).
The task client and its regressions are already included by `//:quality_sources`;
focused client tests and both TypeScript boundaries can run through
`//tools/demo-syntax:editor-tests --test_arg=tests/task-client.test.ts`.
Markdown documents are repository content read when opened, not compiled service
targets. The root source filegroup does not currently glob all `docs/**`.

When code changes, update the corresponding document, graph links and build-label
mapping together. Completion notes should record what was accomplished in Ditz;
the online Work Log writer now records those notes through the implementation
described in [Activity and Work Log](activity.md).
