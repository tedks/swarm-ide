# A calm directory explorer and startup topology

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Replace the noisy duplicated directory list and node diagram with a familiar expandable folder tree as the initial repository view. Keep a quieter optional map, independent service graph, source editor and unsaved work. Build service topology automatically once when the initial repository evidence is usable. Changes should appear in the user's existing UI sprint canvas, not a new native window.

## Progress

- [x] (2026-09-06) Verified clean feature/ui-sprint at 7bd0ace and the owned preview on port 55175. The agent process launch cwd is master, but every editing/tool command and the preview use ui-sprint.
- [x] Inspected existing single-directory protocol, navigation/camera guards and renderer.
- [x] Implemented lazy folder tree and focused tests; hot-loaded in the human canvas.
- [x] Integrated bounded startup reconciliation and 20 focused tests (passed in first quality run).
- [x] User steering: single-line task rows, double-click/Enter task document in central workspace, source kept mounted beneath it.
- [x] User steering: Directory / Agent runs / Tasks now occupy independently collapsible, resizable thirds of the left sidebar.
- [x] Refined map into an enclosing directory frame and sibling grid. Folder zoom/double-click descends; zoom-out, Up and root controls ascend. User positively verified the visual and zoom navigation.
- [x] Bottom dock now shows builds/resources, agent messages, and recent activity simultaneously. User corrected the intermediate mutually exclusive Agents/Jobs design; only conversations are tabbed inside the central message panel. Drafts/output stay mounted; unconfirmed admission remains inspectable. This does not activate real agents.
- [x] Source/task documents have their own tab strip; closing the last document returns the space to graphs and Context. Context defaults wider and both horizontal boundaries resize by drag or keyboard. Opening text explicitly reframes the graphs once.
- [x] Task titles now use two small wrapped lines, ellipsis and click expansion (supersedes single-line rows); double-click/Enter still opens the task document.
- [x] Explicit Demo commands populate mock runs, scripted conversations, graph sprites and deployment/build/test/resource Context cards. Aster, Lumen and Quill have individual conversation tabs linked to sidebar selection and retain per-agent drafts.
- [x] Real captured Bazel query links can overlay the directory map; a separate Build graph lens supports bounded target selection, direct/transitive dependencies and optional mock agents.
- [x] Local quality and owned virtual command/source-open/source-close rehearsal passed; human HMR canvas retained.
- [x] Pushed initial checkpoints 844d47b and 3787e4c and opened draft PR #38.
- [x] Pushed map/dock checkpoint 1fe8f23.
- [x] User concluded the personal sprint and requested CTO handoff. All UI checkpoints pushed to PR38; OpenAI native + foreign Google council reached CLEAN fixpoint through code head 8b31a0f. Anthropic unavailable due to credits. ROOT owns final intake/normal merge and adoption; this child has no integration lease.
- [ ] Pending user request: service click opens its definition; call-edge click opens the implementation and highlights evidence-backed call locations. Current demo has a declared Payments.Authorize dependency but no corresponding call expression. Do not manufacture a call-site highlight.

## Surprises & Discoveries

The directory browser currently duplicates a maximum-80px list with a much larger graph. The core retains only one capture, and directory reads are ordered navigation events; parallel background reads would cancel one another. Retaining visited display observations in the renderer supports an explorer without changing filesystem authority or scanning the whole repo.

## Decision Log

2026-09-06: Make Explorer the default and retain Map as an explicit alternative. Both use observed directory data, not invented service hierarchy. Expanded visited folders retain bounded dated observations, while a newly expanded folder uses existing canonical directory navigation. Only the broker authorizes opening files. Preserve ReactFlow instances while changing visibility so service and map cameras are not discarded.

2026-09-06: Startup reconciliation is one attempt per initial world/document, waits for usable working evidence, and does not continuously rebuild after edits or retry failures. Manual Build remains available. This is the existing Bazel topology, not a new generic build system.

2026-09-06: Superseding the optional map/orthogonal-edge presentation below, the directory tree lives permanently in the sidebar and the central repo projection is a spatial grid. Containment uses an enclosing frame, not connecting lines that appear to link siblings. Genuine service edges are unchanged. One semantic zoom gesture changes at most one directory level and uses the existing bounded canonical navigation request. The bottom surface is primarily agent interaction; jobs remain accessible without destroying unsent instructions or changing selection on background observations.

2026-09-06 personal correction: preserve simultaneous instrument visibility. Restore the old activity/jobs presentation around a central agent-message panel: builds/resources left, tabbed agent conversations middle, recent activity right. Jobs and messages must not be mutually exclusive tabs. Keep source, graph cameras, draft/output identity and existing client permissions unchanged.

## Outcomes & Retrospective

Live work-in-progress, not reviewed landing. Latest `bazel test --jobs=3 //tools:quality` passed: typechecks, 1124 tests across 80 files, node build and renderer build. New coverage includes the folder tree, 20 startup cases, spatial containment/zoom and agent tab selection/draft retention/unconfirmed admissions. Early local runs exposed a pre-existing owned-process cleanup race (later passed unchanged), a missing repository label (restored), and presentation-sensitive assertions (updated without weakening protected-state or unavailable-policy checks). The namespace-attestation risk remains tracked. This is the quality target, not all Bazel targets; owned-virtual acceptance and council are still pending. User positively verified the live directory map and zoom. Normal roadmap progression remains paused. No filename search, project selection, real agents or generalized service inference added.

## Context and Orientation

`app/renderer/repository/RepositoryNavigation.tsx` owns directory controls; `navigation.ts` sequences canonical `repo.list` requests through the local core. `GraphPane.tsx` renders repository and service projections; its frame publisher prevents rapid graph-measurement feedback loops. `App.tsx` owns source buffers, focus, build requests and shared workspace snapshots. `protocol/repository.ts` defines one bounded directory page (200 entries from a maximum 4096-entry capture), coverage and unavailability. No protocol or filesystem-broker changes are required.

## Plan of Work

First add a bounded display-only tree model and replace the list with indented folder/file rows. Support expand/collapse, arrow navigation, file activation, existing exact Open path, breadcrumbs, Refresh, filtering and paging, keeping coverage in contextual controls rather than repeating metadata on every row. Preserve cached siblings and derive ancestor navigation paths when an explicit Reveal jumps into an uncached directory. Cache is not fresh evidence.

Then give the repository pane an Explorer/Map selector, preserving both graph instances, and use compact folder/file nodes and unlabelled orthogonal containment edges for the map. Integrate a standalone startup-topology hook after the existing reconciliation callback, with strict one-attempt and unavailable-evidence behavior. A bounded native helper owns only that hook and new tests; the UI owner integrates shared App changes.

## Concrete Steps

Operate in `/home/tedks/Projects/swarm-ide/ui-sprint`. The existing canvas uses `nix develop --command bazel run --jobs=3 //:dev` with SWARM_DEV_PORT=55175; renderer changes arrive through Vite hot replacement. Run `nix develop --command bazel test --jobs=3 //tools:quality --test_output=errors`. For GUI verification serialize through `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` and use the existing Bazel-owned virtual-X11 scenarios, adapting acceptance gestures only where the deliberately changed presentation requires it. Never automate the human desktop.

## Validation and Acceptance

On first render the root and its immediate children are readable tree rows. Expanding core keeps root siblings visible and reveals actual files; collapsing hides descendants without closing source. Keyboard Right expands, Left folds or moves to parent, Up/Down moves rows and Enter activates; editor keys stay scoped. Refresh and external Reveal retain source/draft/cameras; partial captures and unreadable paths remain explicit. Map mode does not recreate either graph. Startup initiates one normal topology build with usable evidence, with no loop on failure, subsequent edits, hot replacement or core recovery. Tests must cover stale replies, cached bounds and user collapse during an in-flight expansion. Capture virtual evidence and reject renderer errors.

## Idempotence and Recovery

No source migration or dependency changes. The private canvas profile and worktree isolate user state. Failed reads retain previous visible observations; Retry/Refresh remain explicit. Keep errors and last consistent topology visible, never manufacture green. Do not restart Electron unless main-process changes require it; none are planned.

## Artifacts and Notes

Canvas ownership is `/tmp/swarm-ide-ui-sprint.Pmyccs/canvas.md`. Local quality log is `bazel-testlogs/tools/quality/test.log`; no owned-virtual screenshots or council convergence are claimed yet.

### 2026-09-06 later steering checkpoint (supersedes earlier verification notes)

Final local `//tools:quality` passed: 1,139 tests across 82 files, typechecks and node/renderer builds. This is not the all-target suite or a completed merge gate.

Owned virtual rehearsal passed on :90 / 55174, 3.723s scenario / 5.830s total with cleanup_complete=1 and no renderer exceptions. Evidence: `/tmp/swarm-ide-ui-sprint-check.xPkS9D/{mock-overview,build-lens,document-context,document-closed}.png`. It exercises explicit mock commands plus real source opening/closing through the existing bridge; it is not real agent execution, deployment or telemetry. An initial harness gesture raced the palette's transition to path mode; the title now exposes that existing mode and the driver waits for it before typing. No physical desktop automation. Broader pre-merge acceptance and council remain pending.

`fixtures/ui-build-links.snapshot.json` contains 398 links from a real Bazel query of this working tree at `1fe8f23+working`; it is deliberately dated, not live, and only offered when the registered repository id matches. It must not masquerade as a portable provider or green build evidence. Ditz follow-up: `ui-live-build-links`. Adding a target changes only the view, not BUILD files and does not start a build. Mock controls never invoke the real agent client or replace canonical snapshots. Mock names are local UI identities only.

Resizable Context defaults to 30% of the main layout; without documents the graphs keep the majority of the remaining space. Graphs and text split the central area when documents are open. Sidebar thirds and the simultaneous builds/messages/activity dock remain unchanged. The source editor stays mounted under a task document; dirty buffers and independent graph cameras remain protected, except for the user's explicit once-on-open graph reframe.

### Build target patterns

User requested `//...` in the Build graph lens. The input now accepts exact captured labels, recursive `//...` / `//path/...` (optional `:all` / `:*`) and package `//path:all` / `//path:*`. Matching uses exact package boundaries, excludes external repositories and unsupported syntax, and never executes Bazel. The lens remains rule-only even for `:*`, with file omission stated explicitly. Reference semantics: [Bazel target patterns](https://bazel.build/run/build#specifying-targets-to-build).

The eight-input bound now counts patterns, not their expansions. Expanded roots and dependencies share the existing 80-node limit with visible truncation; overlapping patterns deduplicate. Broad selections wrap into bounded-height columns, avoiding an unreadably tall single stack without overlapping dependency bands. Empty/uncaptured inputs cannot be added, existing selections remain intact, and removal reverses pattern expansion. Local `//tools:quality` passed: 1,146 tests / 83 files plus typechecks and node/renderer builds, including matcher boundaries, malformed patterns, >8 matches, exact display limits, dependency traversal, layout non-overlap and actual form add/remove behavior. HMR delivered the change to the existing canvas. No new owned-virtual run claimed for this incremental change; prior screenshots predate wildcard support.

### Follow selected source in the build lens

User requested that file clicks update the Build graph. The graph now follows the coordinated file focus (including directory-map/sidebar selection and source-tab activation), using the active source as fallback when focus is not itself a file. It does not force the Service lens to switch tabs. Exact captured rule-to-file links identify direct file targets, highlighted in the build graph; package proximity is not used as ownership evidence. The view includes direct upstream consumers and downstream dependencies. Optional transitive traversal stays direction-specific so a consumer's unrelated sibling dependencies do not flood the view. Cycles, multi-owner files and the 80-node display budget remain bounded.

Follow file defaults on. Adding a manual target pauses it, retaining the previous manual patterns; toggling follow back on uses the current file. Files without captured links show an explicit unavailable mapping and empty graph, not the last file's targets. Only a changed visible graph scope reframes; background/mock updates retain the camera, and hidden lens changes are framed when that lens is next shown. Real source buffers and logical cursor are unchanged.

Local `//tools:quality` passed: 1,151 tests / 83 files plus typechecks and node/renderer builds. Added exact-reference, bidirectional traversal, no-sibling-flood, multi-owner/cycle/bounds, follow/manual retention, camera/hidden-lens and actual App sidebar/source-tab tests with dirty-buffer/cursor preservation. The owned virtual UI rehearsal passed on :90/55174 in 6.235s total, cleanup_complete=1 and no renderer exceptions. `/tmp/swarm-ide-file-build-check.WoU9kF/document-context.png` visibly shows `core/files.ts`, one direct file target and its 16-target neighborhood; this is captured build evidence with mock agent overlays, not live extraction or real runs. HMR updated the existing human canvas. PR38 remains draft pending the eventual full landing gate; the personally steered sprint continues.

## Interfaces and Dependencies

### End-of-sprint review and handback

The final review preserves independent document selection when focusing graphs, prevents background Reveal candidates becoming visible before admission, closes a task-only text view on Return, and scopes folder-collapse vetoes to the exact active navigation request (including overlapping Reveal). Clearing mock data resets graph-local sprite toggles too. Regression coverage includes explicit source/cursor retention, unadmitted background reads, same-request fold suppression and newer-request expansion.

The expanded owned-virtual checks exposed obsolete input assumptions after the redesign: hidden repository options, pan gestures hitting directory nodes, and a graph-focus command expected to replace the text document. The harness now opens visible controls and pans genuinely blank points; task preservation diagnostics name each facet without dropping assertions. Local quality passes 1,156 tests across 83 files. Exact final all-target build/test outcomes and screenshots are recorded in the CTO seam `/tmp/swarm-ide-ui-sprint.Pmyccs/seam.md`; do not infer hosted CI success. Hosted checks are ignored/nonblocking by user directive.

Explicit followups: `ui-service-source-navigation`, `ui-live-build-links`, `ui-artifact-tiling`, `ui-context-linkages`, `ui-cross-graph-file-navigation`, and review nit `ui-mock-message-submit` (multiline semantics retained pending a UX choice). Captured query data and all mock agent/telemetry surfaces remain honestly labeled, not live capabilities. The 55175 human canvas remains owned by this worktree and is handed back alive to preserve possible buffers; master and other app instances were not adopted or restarted.

Reuse React, existing runtime-validated repository observations, CodeMirror and ReactFlow. New display-only cache/tree helpers must not call filesystem APIs or confer file authority. Bound cache size and rendered rows; only requested folders are read. All build initiation goes through the existing typed `reconciliation.start` request. No dependencies are added.

2026-09-06 steering update: prefer fast prompt-to-visible iterations, batch heavier checks/review at checkpoints. Tree moved out of the map into the upper left third; graph position override reverted to the provider's grid while recursive spatial zoom remains pending. The large text surface is an artifact workspace, not just source editing; task/design/docs tabs and their contextual linkages are the intended next UI direction. Service and build-dependency graphs must stay distinct, without fabricated unavailable data.
