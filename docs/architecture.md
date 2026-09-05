# Foundation architecture

The Electron renderer is sandboxed, has context isolation enabled, and has no
Node integration. It can issue only the runtime-validated requests exposed by
`app/electron/preload.ts`. `app/electron/main.ts` brokers those requests to a
separate Electron utility process running `core/worker.ts`. Filesystem, process,
Bazel, Git, deployment, metrics, and agent authority belong in that local core;
none is granted to React.

The current core is a deterministic mock provider. Its data lives in
`fixtures/world.ts`, but it traverses the same `protocol/schema.ts` request,
response, event, snapshot, and provenance contracts required of future real
providers. Validation occurs in the renderer boundary, main process, and core.

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

The snapshot validator rejects dangling graph edges, duplicate topology IDs,
working focus from the wrong revision, and a green publication whose build or
graph fingerprints do not match working source. The renderer reducer also
rejects duplicate sequences, out-of-order sequences, old epochs, and mismatched
green events. These checks are complementary: malformed data cannot cross the
protocol, and well-formed but late data cannot replace a newer world.

## UI and graph seams

`app/renderer/App.tsx` owns workbench composition and commands.
`app/renderer/GraphPane.tsx` owns the current React Flow rendering surface.
`app/renderer/graph-adapter.ts` is the replaceable conversion from domain-neutral
`GraphSlice` data to React Flow nodes and edges. Layout coordinates are provider
data for now; a later layout worker can replace them without changing focus or
reconciliation contracts.

`tools/dev.mjs` creates watched main, preload, and core bundles with esbuild,
starts one Vite server, and launches the Nix-provided Electron binary. Renderer
edits use Vite HMR without re-entering Bazel. Main/core/preload edits restart only
Electron. Bazel remains the supported owner of the long-running command.

## Next vertical slice

The best next proof is one small real provider: read a checked-in service
declaration plus Bazel targets, publish a service graph through the existing
contract, and retain the fixture as a failure-mode test. Do not add a general
plugin framework first. The provider boundary should be earned by two concrete
implementations before it is generalized.
