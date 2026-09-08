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

System design opens the living component diagram/document in the center. The
Work Log is mounted below the running-agent list with explicit Start/Stop; live
timestamped activity is separate in the persistent dock and center log. Saved
summaries remain a separate log tab. Graph controls and required attribution use
explicit dark-theme colors.

Selecting a Work Log outcome opens `WorkLogEntryDetail` in the center with its
agent, task, changed areas, checks and follow-ups. This is a pure view of the
selected outcome: the sidebar remains the single polling/control owner. Closing
the outcome, switching documents or Ctrl+W preserves the mounted source editor.

`OverflowStrip.tsx` wraps the existing document, lens and agent tab lists without
changing their selection or keyboard owners. Native horizontal scrolling remains;
overflow arrows are available only when needed and do not activate tabs. Selection
and resize reveal the active tab; a fixed control slot avoids layout jumps.
Scrollbars elsewhere, including source editors and diffs, stay visible when needed
with a slim dark theme. These renderer inputs use the same root build targets.
