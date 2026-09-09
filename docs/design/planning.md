# Living designs, Ditz tasks and agent context

A design states how the system fits together. A task records a bounded change and
its dependencies. An agent draft turns a deliberate task/source selection into
instructions. These link to one another, but they are not interchangeable records.

## Lower-level map

| Part | Source of truth | Implementation |
| --- | --- | --- |
| Design/component hierarchy | [.swarm/plans.json](../../.swarm/plans.json) and component documents | [protocol/plans.ts](../../protocol/plans.ts), [core/plans.ts](../../core/plans.ts), [PlanWorkspace](../../app/renderer/plans/PlanWorkspace.tsx) |
| Component build and test actions | Authored component target labels, classified by current Bazel rule observations | [ComponentTargets](../../app/renderer/plans/ComponentTargets.tsx), [target jobs](../../core/build-jobs.ts), [owned executor](../../core/target-build-process.ts) |
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

Selecting a component also makes it the right-hand Context subject. Its authored
targets are grouped into Tests and Build targets using the current Bazel query:
`*_test` rules and `test_suite` get Test; other observed rules get Build. Names
such as `checks` do not make a target a test. Missing mappings remain visible but
unavailable. These are explicitly mapped targets, not a claim to discover every
test that might exercise the referenced source. Refreshing plans, switching
worktrees or replacing the core disables old actions until their inputs are current.
Returning from a task through Back or Read design restores the selected component's
Context, not the previous task. Document and graph selection remain independent
of a job's output.

An explicit action uses the existing target-job owner with `build.start.operation`
set to `build` or `test` (older callers still default to build). Test executes
`bazel test`, overriding no-build/manual-filter defaults for the selected label;
it is not satisfied by compiling a test. Nonzero and no-tests exits fail. Builds &
resources retains the operation, result, output and Stop controls. Selecting a
component starts neither jobs nor agents, and there is no run-all action for the
mixed test, source-bundle and manual-demo mappings.
`//tools/design-tests:checks` covers classification, Context ownership/navigation,
job semantics and both TypeScript boundaries. Its manual `:smoke` uses an owned
virtual desktop and disposable real Bazel repository to click Test, observe the
actual result and verify retained document/camera state without a model request.

Long reference lists are expandable; the index does not discard their contents.
Component containment is dashed and muted; authored contracts retain their
directions, with reciprocal links in separate lanes. Labels appear on focused
interfaces or hovered/keyboard-focused edges, with exact incoming/outgoing
connections also available in the inspector. A selected component shows its
incident relationships, not unrelated links among its neighbours. Selecting
another component keeps the canvas mounted and remembers visited cameras;
unchanged index reads retain projection identity rather than remeasuring labels.
The Component canvas uses wider columns and rows so contracts have room. Drag a
node to arrange it; drag empty canvas to pan. Control/Meta and Shift do not turn
component dragging into a multi-node selection. A drag neither selects a component
nor reframes the camera. **Reset layout** restores only the displayed view's
default positions; **Fit** still frames the full displayed graph. Position
overrides live only in renderer-session memory, scoped to world, canonical
repository/worktree identity, component and the selected-contract or overview
view. Navigation and unchanged refresh retain them; removed nodes lose overrides.
No drag writes the plan index. Other shared projection canvases remain
non-draggable. `DesignWorkspace` opts into `ProjectionCanvas.layoutScope`;
`//tools/living-design:checks` covers these scopes and relationship preservation.
The existing `//tools/living-design:smoke` supports `SWARM_DESIGN_LAYOUT_ONLY=1`
for an owned packaged node/background drag, reset and design-reading journey.
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
An unchanged failed revision is not repeatedly scanned. A newly available metadata
ref also recovers an initially missing or failed list, once per discovered ref.
Manual Refresh remains available to retry an unchanged failure deliberately.

Component plans refresh automatically on the working-source fingerprint and on
return to the application. Held reads coalesce changes into one catch-up read;
identical indices keep their object identity and selected component. Failed reads
retain the prior plan for display but revoke its links until recovery.

The complete task list has no arbitrary issue-count cap. Reader and response
capacity is bounded by bytes, deadlines and validated data shape instead;
closed issues are not discarded to fit. Git batch framing scales with the
entries in the byte-bounded metadata tree. Oversized or malformed updates still
retain the last good revision. Task graphs include every available task and
recorded edge without graph count truncation. Detail loading keeps four requests
in flight, coalesces progress, and cancels on hide, disposal or identity/revision
change. The underlying projection retains isolated tasks and missing endpoints.
The Task blockage view defaults to active statuses (not started, in progress and
paused), with a compact Filters disclosure, Active/All presets and individual
status choices. Completed tasks remain in canonical Ditz history. The small
validated UI preference is scoped by repository and world in the local profile;
it changes no metadata and starts no new reads. Canvas, keyboard outline and
recorded-edge list share the filtered, optionally focused view. Counts separate
filter-hidden tasks, tasks outside focused scope, missing references and unread
details. Direct missing endpoints of visible tasks keep their warnings; filtering
never invents edges across hidden tasks or declares work ready. The selected task
and its document/Context remain unchanged if its node is hidden, with Show selected
and an empty-view Show all recovery. Explicit filters/scope gestures may frame the
view, while ordinary metadata refresh does not reset manual camera movement.
Backlink projections retain their separate reported bounds.

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
`//tools/demo-plans:graph-checks` also consumes `//:quality_sources` and runs the
complete-graph, client, scope and mounted graph tests plus both TypeScript checks.
With `SWARM_PLANS_CASE=filters`, the existing `//tools/demo-plans:smoke` uses
`tools/demo-plans/filters.cjs` from its `:sources` input for a small real CLI-Ditz
Active/All journey, retaining dirty source, cursor and the component camera.
It uses the same owned virtual desktop and packaged core, without a model turn.
The task client and its regressions are already included by `//:quality_sources`;
focused client tests and both TypeScript boundaries can run through
`//tools/demo-syntax:editor-tests --test_arg=tests/task-client.test.ts`.
Markdown documents are repository content read when opened, not compiled service
targets. The root source filegroup does not currently glob all `docs/**`.

When code changes, update the corresponding document, graph links and build-label
mapping together. Completion notes should record what was accomplished in Ditz;
the online Work Log writer now records those notes through the implementation
described in [Activity and Work Log](activity.md).
