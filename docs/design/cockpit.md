# Cockpit, focus and source

The cockpit is an instrument panel the operator can reach into. Navigation,
source, context and agent controls remain visible together; changing the central
document should not throw away a draft, dirty file or graph camera.

## Lower-level map

| Part | Actual implementation | Relationship |
| --- | --- | --- |
| Composition and commands | [App.tsx](../../app/renderer/App.tsx) | Chooses central surface and coordinates consumers |
| Source editing | [EditorPane.tsx](../../app/renderer/EditorPane.tsx), [state.ts](../../app/renderer/state.ts) | CodeMirror and source-tab lifetime |
| Graph presentation | [GraphPane.tsx](../../app/renderer/GraphPane.tsx), [graph-adapter.ts](../../app/renderer/graph-adapter.ts) | Domain graph data becomes React Flow nodes/edges |
| Contextual instruments | [ContextPane.tsx](../../app/renderer/context/ContextPane.tsx) | Facts and links for the current attention target |
| Side instruments | [WorkbenchSidebar.tsx](../../app/renderer/WorkbenchSidebar.tsx) | Agent/task/activity surfaces beside the central work |
| Persistent dock | [AgentDock.tsx](../../app/renderer/agents/AgentDock.tsx) | Build resources, agent messages, Work Log and Activity in independently scrolling columns |
| Layout adjustment | [ResizeDivider.tsx](../../app/renderer/ResizeDivider.tsx) | Pointer and keyboard dividers resize Context/source horizontally and the conversation dock vertically |
| File authority | [core/files.ts](../../core/files.ts) | Reads and conditional writes behind the typed bridge |
| Agent worktree inspection | [WorktreeInspection.tsx](../../app/renderer/WorktreeInspection.tsx), [core/worktree-inspection.ts](../../core/worktree-inspection.ts) | Registered session selects the actual read-only worktree source and current diff |
| Raw fleet activity | [FleetActivityView.tsx](../../app/renderer/FleetActivityView.tsx) | Timestamped session events open in the center, distinct from Work Log outcomes |

Focus is not permission to overwrite a buffer. Explicit navigation owns a source
handoff; late asynchronous responses must not steal a newer choice. The editor
keeps local edits and reports conflicts instead of silently replacing them with
disk content. Task attachment similarly fixes context independently of later
navigation. [Recovery](../../app/renderer/recovery.ts) retains usable views while
re-establishing current-core authority.

The renderer owns presentation and gestures, not filesystem or process access.
See [runtime](runtime.md) for the bridge and [repository](repository.md) for
the data supplying graphs and context.

## Build connections

All files above are inputs to `//:quality_sources` in
[BUILD.bazel](../../BUILD.bazel); that filegroup feeds `//:desktop-bundle` and
the `//tools:quality` test. `//:dev` aliases `//tools:dev` for the watched local
loop. These are shared application targets, not a separate cockpit service.

## Joined operator behavior

The center can inspect another registered agent's worktree file or patch while
the local CodeMirror buffer, cursor and graph cameras remain intact. The path is
resolved from the private session registration, never an arbitrary command cwd.
Malformed event paths produce a notice instead of navigating. Ctrl+W closes the
inspection rather than its hidden editable source.

Both live Activity file events and operator-associated briefing links carry the
registered session into this inspector. A different opened repository does not
hide canonical worktree briefing links or redirect them into local same-path files.

Plan is the fresh-start home for the living component diagram/document and its
related planning views. Code opens the separate repository/service/build
projections. There is one architectural entry point, not separate System and
Plan hierarchies; empty Performance/Refactor lenses have been retired. Saved
navigation retains paths and focus while migrating those old values to Plan
(a saved System source session resumes Code). The Plan home never discards the
mounted editor or graph instances. Explicit source, task and worktree activation
returns to Code; background observations do not switch the lens.

The Work Log is mounted once in a persistent dock column immediately left of
Activity, independent of the scrolling or folded agent list, with explicit Start/Stop; live
timestamped activity is separate in the persistent dock and center log. Saved
summaries remain a separate log tab. Graph controls and required attribution use
explicit dark-theme colors.

Selecting a Work Log outcome opens `WorkLogEntryDetail` in the center with its
agent, task, changed areas, checks and follow-ups. This is a pure view of the
selected outcome: the dock panel remains the single polling/control owner. Closing
the outcome, switching documents or Ctrl+W preserves the mounted source editor.
At narrow widths the dock scrolls horizontally while its columns retain usable
minimum widths and independent vertical scrolling. This keeps agent messaging,
summary settings and Activity reachable without remounting their content.

The dock's single header contains named registered conversations, with the
selected agent's Terminal, Worktree and Details icons aligned to the right.
There is no second Conversation/title row. Terminal copies the checked command;
unavailable session actions stay disabled. The selected conversation follows the
registered agent.
The unique real root is the initial default unless a previous explicit selection
is still registered. Child selection switches chat/control, not the central
source, task or diff. Context keeps the agent's worktree and terminal details;
it no longer duplicates the conversation's message owner. One retained
`SteeringMemory` keeps target drafts/receipts through loading and development
remounts. The Agent tools icon opens native trusted execution/history and New/Fork
without a permanent generic tab. Real drafts and explicitly opened native runs
retain tabs; old stored runs retain their own tabs rather than a competing sidebar list.
`//tools/conversation-cockpit:unit` and its owned-virtual `:smoke` cover this
composition. Actual transcript reads are separate from controlled Send evidence.
With a registered-conversation surface, the default dock takes about 32% of the
viewport (220–400px). Context starts at23% width so a normal desktop leaves room
for a two-column Plan overview; smaller windows stack readable plan sections.
Context and the outer dock can be resized. The horizontal dock divider supports
dragging, Up/Down and Home; a deliberate adjustment takes22–55% of the workbench
height, consistently using that container even when interface zoom makes it
taller than the viewport. Pointer dragging preserves the editor's focus.
Conversation also takes a larger horizontal share than either log, with useful
minimum widths and independent scrolling retained for all instruments. A single
Activity heading and divider replace the nested activity/jobs shell. The top
health indicator reports the current build-graph observation rather than exposing
internal reconciliation epochs. Operational document-title observations remain
available to the local verification harness.

`useBuildGraph` observes the current repository while the core is ready, regardless
of selected Plan/Code lens, and receives the working-source fingerprint for
debounced invalidation. The hook pauses on blur and keeps settled input quiet.
The old automatic service-artifact binary build is not the repository graph:
it stays an explicit **Build service topology** action under the toolbar's
secondary build/refresh menu. **Refresh build graph** is a secondary retry;
normal navigation does not require pressing it. See the repository design for
the query owner's bounded scheduling and authority.
The message list retains at least 80px after a delivery receipt; timestamps and
message/receipt controls remain visible instead of squeezing chat to zero height.

The selected agent's **Worktree** action opens `AgentWorktreeBrowser` in the
center, carrying the registered session ID into the typed broker. Its directory
navigation and master comparison do not change the main repository or editor
buffer. Returning hides the browser and restores the original surface; closing
its tab or Ctrl+W closes only that inspection. File-event inspections remain a
separate compatible route. The normal mount is tested in `cockpit-app.test.tsx`;
the broker/browser's real two-worktree package evidence belongs to its producer.

`OverflowStrip.tsx` wraps the existing document, lens and agent tab lists without
changing their selection or keyboard owners. Native horizontal scrolling remains;
overflow arrows are available only when needed and do not activate tabs. Selection
and resize reveal the active tab; a fixed control slot avoids layout jumps.
Scrollbars elsewhere, including source editors and diffs, stay visible when needed
with a slim dark theme. These renderer inputs use the same root build targets.

`//tools/operator-cockpit:plan-first` checks startup, old-navigation migration,
real CodeMirror text/cursor retention and mounted graph identities through Plan
and Code, target activation, dock keyboard/pointer bounds and task-consumer
compatibility. Domain graph correctness belongs to the corresponding provider
checks; the mounted tests do not claim actual browser geometry. The owned
`SWARM_COCKPIT_PLAN_ONLY=1` operator smoke mode opens the actual packaged app
against a disposable repository containing the authored design, and checks the
desktop/compact Plan layout, native source editing and retained cameras.
