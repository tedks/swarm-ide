# Foundation architecture

The Electron renderer is sandboxed, has context isolation enabled, and has no
Node integration. It can issue only the runtime-validated requests exposed by
`app/electron/preload.ts`. `app/electron/main.ts` brokers those requests to a
separate Electron utility process running `core/worker.ts`. Filesystem, process,
Bazel, Git, deployment, metrics, and agent authority belong in that local core;
none is granted to React.

The production core is a real local-workspace provider. It fingerprints the
opened Git working tree and publishes a service topology only from a bounded,
validated Bazel artifact whose protobuf interfaces have compiled successfully.
`fixtures/world.ts` remains test-only and exercises the same
`protocol/schema.ts` contracts and failure states. Validation occurs at the
renderer boundary, main process, privileged core, and artifact-provider seam.

## Contract vocabulary

- `FocusRef` identifies the selected artifact, its domain, world, and exact
  working/built/deployed revision.
- `GraphSlice` is one bounded topology with positioned nodes, annotated edges,
  input fingerprint, epoch, zoom band, and provenance.
- `NavigationMapping` carries explicit candidate mappings between graphs,
  including confidence, reason, and ambiguity.
- `Widget` is contextual information with priority and provenance.
- `Job` and `Activity` describe work, progress, resources, incoming diffs, and
  system publications.
- `WorkspaceSnapshot` is the coherent read model consumed by the workbench.
- `CoreRequest`, `CoreResponse`, and `CoreEvent` are the narrow bridge protocol.

The snapshot validator rejects dangling graph edges, duplicate topology/node/
edge IDs, dangling navigation mappings, inconsistent ambiguity, working focus
from the wrong revision, and green publications whose provenance or fingerprints
do not match working source. The renderer reducer rejects duplicate sequences,
out-of-order sequences, and old epochs. Mutating responses never overwrite the
event stream; initial responses carry a sequence watermark, while an explicit
`workspace.reset` event is the only authoritative transition to an older epoch.
These checks are complementary: malformed data cannot cross the protocol, and
well-formed but late data cannot replace a newer world.

The core takes the output location from the successful target-completion event
of the exact Bazel build invocation, never from the workspace's convenience
symlink or a second configuration lookup. It accepts exactly one bounded local
artifact. The consumer preserves the exact event-reported path through the
no-follow regular-file open, so resolving a final symlink cannot erase the fact
that the declared output was linked. It independently recomputes its versioned
input digest from the exact canonical manifest, sources, and protobuf declarations. A globally ordered Git
observer combines file hints with a non-starving polling fallback, so changes
outside open source tabs also revoke green truth. Explicit hints supersede older
computations; periodic ticks wait for an active computation to finish.

## UI and graph seams

`app/renderer/App.tsx` owns workbench composition and commands.
`app/renderer/GraphPane.tsx` owns the current React Flow rendering surface.
`app/renderer/graph-adapter.ts` is the replaceable conversion from domain-neutral
`GraphSlice` data to React Flow nodes and edges. Layout coordinates are provider
data for now; a later layout worker can replace them without changing focus or
reconciliation contracts. Source observation does not replace navigation: while
a file tab is active, the same mounted graph instances form a compact sidebar
beside CodeMirror, preserving their camera state. Edges are selectable
presentation-level relationships; their interface focus, endpoints, contract,
and graph provenance populate contextual instruments without adding a universal
"edge artifact" to the shared protocol.

Each source-tab lifecycle has one generation and one explicit initial-read
owner, independent of React render/effect timing. File
events received while that first read is pending advance its observation
watermark instead of launching a competing read; the opener retries a bounded
number of times until its bytes match the newest observed revision or surfaces a
visible error. Close operations synchronously advance lifecycle authority and
compose their state updates, so batched closes and late reads cannot resurrect a
tab. Surface selection has the same synchronous authority, so closing an active
tab and then its fallback in one event batch reliably returns to the graphs.
Save completion accepts delayed events for either its expected base revision
or its newly written revision while treating any third revision as a conflict.

`tools/dev.mjs` creates watched main, preload, and core bundles with esbuild,
starts one Vite server, and launches the Nix-provided Electron binary. Renderer
edits use Vite HMR without re-entering Bazel. A successful multi-entry build is
compared by executable bytes, excluding source maps: unchanged code does nothing,
core changes replace only the utility process, and preload changes refresh the
existing document when its buffers and pending writes are safe. Main changes
defer the whole bundle update behind a deliberate restart-required notice; they
never replace the native window automatically. Bazel remains the supported owner
of the long-running command. See `docs/development-loop.md` for recovery limits.
`bazel build //...` also builds `bazel-bin/swarm-ide-foundation.tar.gz`, containing
the bundled Electron main/preload/core and Vite renderer outputs. This initial
local genrule intentionally stops short of a generalized hermetic JavaScript
toolchain.

## Current vertical slice

The first real provider reads one checked-in service declaration, compiled
protobuf descriptor sets, and an adjacent Bazel-owned source target. Its graph
is gray before observation, yellow while source is dirty or building, green
only for an exact before/after fingerprint, and red on bounded failure while
retaining the last good topology. The renderer's source observatory reads,
watches, and conditionally saves canonical workspace files only through the
typed core bridge; external and future agent edits appear as transient inline
green additions and red departing text. Ctrl-W is renderer-owned and closes only
a safe source tab; Electron's application menus have no competing window-close
accelerator.
