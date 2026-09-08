# Living designs, Ditz tasks and agent context

A design states how the system fits together. A task records a bounded change and
its dependencies. An agent draft turns a deliberate task/source selection into
instructions. These link to one another, but they are not interchangeable records.

## Lower-level map

| Part | Source of truth | Implementation |
| --- | --- | --- |
| Design/component hierarchy | [.swarm/plans.json](../../.swarm/plans.json) and component documents | [protocol/plans.ts](../../protocol/plans.ts), [core/plans.ts](../../core/plans.ts), [PlanWorkspace](../../app/renderer/plans/PlanWorkspace.tsx) |
| Generate a first design | Explicit operator request; editable local-profile prompt and Codex model/reasoning | [generation contract](../../protocol/plan-generation.ts), [absence guard](../../core/plan-generation.ts), [Generate component plan](../../app/renderer/plans/PlanGeneration.tsx) |
| Tasks and blockage | Ditz YAML on `ditz-metadata` | [git-reader.ts](../../core/tasks/git-reader.ts), [metadata.ts](../../core/tasks/metadata.ts), [TaskGraph](../../app/renderer/tasks/TaskGraph.tsx) |
| Current task list | Last complete local metadata revision; automatic adoption after a ref change | [task client](../../app/renderer/tasks/client.ts), [task provider](../../core/tasks/provider.ts) |
| Task detail and links | Revision-pinned task observation | [TaskDetail](../../app/renderer/tasks/TaskDetail.tsx), [TaskContext](../../app/renderer/tasks/TaskContext.tsx) |
| Prepared task context | Fixed attachment plus selected source | [draft-context.ts](../../core/tasks/draft-context.ts), [protocol/agent-task.ts](../../protocol/agent-task.ts) |

Plan relationships are authored in-repo. The core reads a bounded canonical
index and validates its structure; a reference remains a candidate until its
target can actually be opened. The accompanying component graph descends to the
actual source and Bazel boundaries instead of manufacturing a function inventory.
Component document, source and build-target lists are bounded by the overall
64 KiB index, not an arbitrary per-component reference count. Build mappings still
require strict canonical local labels and unique targets per component. The UI
collapses long lists and lets the operator expand them. `//tools/living-design:checks`
reads the actual committed index through the core reader, preserving every source
and build mapping. For an isolated index edit, run
`//tools/demo-syntax:editor-tests --test_arg=tests/plans-reader.test.ts` through
Bazel; both targets track the index through `//:quality_sources`. Design edits
must pass the actual-index reader regression before landing.

When the core verifies that the index is absent, Components offers **Generate
component plan**. A missing index is distinct from unreadable, malformed,
symlinked or nested-repository content. The default editable prompt asks Codex
`gpt-5.6-sol` with `xhigh` reasoning to explain real responsibilities and
interfaces, write ordinary design documents, and create the version-1 index last.
Settings are saved in the local IDE profile; opening or editing them never runs
an agent. The requested harness is currently Codex; the UI does not pretend that
other harnesses are connected. A deliberate click uses the same normal live
conversation owner, selected worktree, approvals and Stop as New agent.
Admission rechecks absence and the prompt requires exclusive index creation and
preserving existing documents. The agent can leave partial files after failure
or Stop: they remain inspectable. A final message is not validation; completion
refreshes the existing plan reader, and malformed output remains an error.
No background generation, fabricated runtime relationships or silent model
substitution is permitted. Run identity survives worktree switching and renderer
reload; an uncertain send is observed instead of replayed. Explicit Check or
retry launch uses the same permanently admitted identity, so recovering a
rejected request cannot duplicate a run whose acknowledgement was lost. Failed
writers keep their generation slot until owned process cleanup is confirmed.

`//tools/component-plan:checks` checks settings, absence, admission, lifecycle
and the normal selected-worktree bridge. `//tools/component-plan:smoke` consumes
the desktop bundle and owned virtual-X11 harness, using a labelled controlled
provider to exercise the button, visible conversation, generated-file observation,
dirty source retention and closing the completed conversation. It makes no model
request. The separate opt-in `//tools/component-plan:live` runs one real generation
in a disposable source repository, checks the resulting normal plan reader,
contained docs/source links, actual fixture build inputs and unchanged originals,
and retains cleanup evidence. Its `live-bundle` target compiles that proof with
the ordinary owner through the shared quality sources; it is not another harness.

The unified workspace starts with a component responsibility hierarchy, task
dependencies, repository navigation and the existing build/services chooser.
One `usePlanNavigation` observation and selection serve the component graph,
document and breadcrumbs. `PlanWorkspace` exposes these as layout slots rather
than duplicating readers. Read design opens full prose beside the same graph
instances; implementation, task and guidance links remain in that reading area.
The root selector keeps all authored design/plan forests reachable, including
older plans with task, contract and lesson links.
Selecting a component shows its own incoming/outgoing contracts and constraints,
not the combined relationships of all its children. Optional connection `kind`
and `detail` fields distinguish requests, results, data and navigation while
older version 1 indices continue to work as generic contracts. A contract picker
or explicit edge click/keyboard activation isolates that directed pair and shows
its explanation. Selecting a contract never opens source, sends a request to an
agent or changes the component selection; Explore deliberately navigates to its
other endpoint. Core/workspace changes revoke the inspected contract.
Build rules stay in their separate graph projection; component source and target
lists link into it without guessing declarations.
Long reference lists are expandable; the index does not discard their contents.
Component containment is dashed and muted; authored contracts retain their
directions, with reciprocal links in separate lanes. Labels appear on focused
interfaces or hovered/keyboard-focused edges, with exact incoming/outgoing
connections also available in the inspector. A selected component shows its
incident relationships, not unrelated links among its neighbours. Selecting
another component keeps the canvas mounted and remembers visited cameras;
unchanged index reads retain projection identity rather than remeasuring labels.
This fixes the selection-remount mechanism, not a claim that an independent
periodic idle-flashing cause has been reproduced.
`DesignWorkspace` can accept that shared controller through `navigation` and a
`taskPane` slot. Its `renderWorkspace` slots expose the existing component,
document and task views; `PlanWorkspace` provides the task graph once, preserving
its camera through overview/document resizing. `workspace.css` owns their compact
arrangement, not another graph model or reader.

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

The complete task list has no arbitrary issue-count cap. Reader and response
capacity is bounded by bytes, deadlines and validated data shape instead;
closed issues are not discarded to fit. Git batch framing scales with the
entries in the byte-bounded metadata tree. Oversized or malformed updates still
retain the last good revision. Task graphs and backlink projections keep their
separate, explicitly reported display/projection bounds.

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
