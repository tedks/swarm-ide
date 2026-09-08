# Task workspace

Click a task title in the sidebar or a task node in the Plan graph to open its
read-only document in the central text area. The selected source remains open
under its own tab; task navigation does not save or replace its buffer.

Context follows the task. It shows its actual Ditz status, type, component,
disposition, creation time and recorded update log. Blocking and Blocked by
links use human task titles when those titles belong to the same metadata
revision. Missing endpoints remain identified as missing. Source references
still require an explicit **Reveal working file** gesture; text in descriptions
or comments is not automatically interpreted as a file command.

History is a separate, read-only `taskActivity.read` observation. The existing
owned Git/YAML reader extracts it while observing one complete metadata commit,
then serves it from that cache. The result carries the repository, world, task,
commit and issue-blob identity; the renderer rejects mismatched or obsolete
responses. It does not change the immutable task description or canonical bytes
used by agent preparation. Missing or unsupported history fields do not reject
an otherwise supported task. Up to 32 recent valid recorded events are shown,
with an independent byte budget and explicit omission count. Timestamps are
recorded task times, not the IDE's observation time.

The agent section only uses explicit task-ID associations already present in
the repository Activity evidence and the currently loaded managed run's task
attachment. A matching loaded run can show its last eight available output
excerpts. This is not a search through private agent sessions or complete run
history. Recorded, synthetic and retained evidence stays labelled; absent
associations say “No agent activity in this scope.”
These loaded-run excerpts belong to the existing isolated/rehearsal run model;
the separate trusted-local conversation is not yet linked into task history.

The task graph overview shows every task in the available metadata snapshot,
including isolated tasks and missing dependency endpoints. Loading attempts all
task details, with four concurrent reads. There is no graph count cutoff for
tasks, edges, extra endpoints or selected-task neighbors. **Focus selected task**
shows that task and all its direct recorded neighbors; **Overview · all tasks**
or **Whole projection** restores the complete available projection. Counts
distinguish loaded detail, unavailable reads and work not yet attempted. An
unread relationship is not an absent relationship. Progress updates are
coalesced every 100 ms and on completion, so rapid cache reads do not force a
layout for each detail. Hiding, disposal, or repository/revision changes cancel
the read batch and prevent late updates. Core metadata byte/time/path validation
is unchanged. Independent components are packed compactly, and dependencies flow
top-to-bottom. Plan/component layout remains unchanged.
Only an explicit graph-scope gesture requests a new fit; opening task documents
does not reset an already displayed graph camera.

The proposed central split with task detail above and its graph below is a
future layout option, tracked as `task-workspace-central-split-followon`. This
increment retains the current side-by-side graph and document arrangement.

## Local verification

From a Nix-enabled checkout, materialize dependencies with
`nix develop --command pnpm install --frozen-lockfile`, then run
`nix develop --command bazel test //tools/demo-plans:graph-checks --jobs=2`
for graph completeness, graph/client cancellation, scope/layout and mounted
camera/selection checks plus both TypeScript boundaries. The broader task-document
checks remain available at `//tools/task-workspace:regressions`.

The actual packaged journey is
`nix develop --command bazel run //tools/task-workspace:smoke --jobs=3`.
Set `SWARM_VIRTUAL_DISPLAY=:143` and `SWARM_VIRTUAL_DESKTOP_PORT=55223` to reserve
independent owned test resources. The harness checks ownership and collisions,
creates a disposable CLI-authored Ditz repository and private profile, and
verifies native clicks through the production package. It checks source,
cursor, draft and camera retention, and cleans only its owned desktop/processes.
The test repository is not a production task stream or a live model run.
