# Typed local core, providers and the development loop

Swarm trusts the local machine and its configured agent harnesses, while keeping
privileged operations out of the renderer. The boundary is practical: a graph
label or clicked document cannot become an arbitrary process command.

## Lower-level map

| Layer | Actual implementation | Responsibility |
| --- | --- | --- |
| Renderer | [app/renderer](../../app/renderer/App.tsx) | Focus, views, commands and local editing state |
| Preload bridge | [preload.ts](../../app/electron/preload.ts) | Narrow runtime-validated request/event surface |
| Electron main | [main.ts](../../app/electron/main.ts), [core-supervisor.ts](../../app/electron/core-supervisor.ts) | Native window and utility-process lifecycle |
| Core dispatch | [worker.ts](../../core/worker.ts), [worker-runtime.ts](../../core/worker-runtime.ts) | Validates, routes and publishes provider results |
| Contracts | [protocol/schema.ts](../../protocol/schema.ts) and domain modules | Shared request/result types and runtime schemas |
| Providers | [provider.ts](../../core/provider.ts), files, tasks, build graph, agents | Filesystem, Git, Bazel and owned harness operations |

The Electron renderer has context isolation and no Node integration. The local
core resolves workspace identity and canonical paths, manages process lifetimes
and publishes bounded results. Registration/configuration selects actual providers;
renderer text does not grant new filesystem or execution authority.

The `projectContext.observe` route validates the opened repository/world and
coalesces bounded read-only Node/Python/Hugo, Docker and manifest discovery. Each
detector retains its own prior observation time if temporarily unavailable. Its provider cancels pending
reads when the core closes. The renderer never supplies a process command, root
path or container control operation; see [runtime context](../project-context.md).

Snapshots and events carry ordering and source identity so late results cannot
overwrite newer state. Failure retains useful prior observations while controls
re-establish authority. Derived graphs separate working, built and deployed
information. The trusted-local agent path uses normal configuration; older
isolated-profile limitations do not define all agent execution.

## Actual build and reload graph

1. `//:quality_sources` collects application, core, protocol and supporting inputs.
2. `//:desktop-bundle` consumes that filegroup plus `//:package.json`; its tool
   `//tools:build-app` produces `swarm-ide-foundation.tar.gz`.
3. `//:quality` selects `//tools:quality`, whose data dependency is the same
   filegroup. Dedicated feature tests add smaller entry points where declared.
4. `//:dev` aliases `//tools:dev`. [dev.mjs](../../tools/dev.mjs) watches the
   renderer/main/preload/core bundles under the Nix/Bazel-owned development entry.

Renderer changes use HMR. Core changes can replace the utility process without
recreating the native window. Unsafe document reloads wait for buffer/pending-write
conditions; main-process changes require an explicit restart. This is a fast local
loop, not a claim of a fully hermetic JavaScript build toolchain.

See [BUILD.bazel](../../BUILD.bazel), [tools/BUILD.bazel](../../tools/BUILD.bazel),
[development loop](../development-loop.md) and [architecture](../architecture.md).
GUI verification uses an owned virtual X11 desktop, never the operator's display.
