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

## Next joined behavior

The operator increment adds a central read-only view of another agent's worktree
file or patch, leaving local source intact, and mounts the living design surface.
This is planned C7 integration, not a claim that the baseline editor can already
resolve arbitrary registered worktrees. Bright graph controls must remain legible
without removing required attribution.
