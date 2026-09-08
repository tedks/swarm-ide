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
| Live build messages | [build-progress.ts](../../core/build-progress.ts) → [provider.ts](../../core/provider.ts) | Private Bazel event file → bounded current-job message |

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

## Container browser entry

The [container guide](../container-demo.md) describes the optional local noVNC
entry. Its Dockerfile invokes the existing `//:desktop-bundle` and packages that
tar with Electron and an owned Linux display; it does not add a browser core API.
`//tools/container:checks` and `//tools/container:smoke` each declare a `data`
dependency on `//tools/container:sources`. The smoke command uses an already-built
Docker image: it has no direct Bazel dependency on `//:desktop-bundle`.
See [the container component](container.md) for the transport, sandbox and mount
boundaries. Linux/amd64 browser proof does not imply macOS/ARM validation.

## Live build messages

The explicit service build already writes a private [Bazel Build Event Protocol](https://bazel.build/remote/bep)
JSON-lines file. While that process runs, the core reads newly appended complete
lines and sends the latest changed target, test or output milestone through
`job.changed`. The existing job widget displays the message; running progress
stays indeterminate. Configuring or completing a target does not mark the build
successful: process exit, artifact validation and the exact source fingerprint
still control that decision.

One reader samples every 250 ms, with no overlapping reads, a 4 MiB total limit,
a 256 KiB line limit and 300-character messages. Partial JSON/UTF-8 waits for a
complete line. Malformed, oversized, replaced or truncated files stop progress
reporting, not the build. Command-line and environment records are ignored;
ordinary build output can still contain what a repository's tools print. Terminal
escape codes are removed. Messages from older attempts, disposed providers or
finished jobs cannot update the current job. The reader drains complete final
lines and closes before temporary-file cleanup. A telemetry close error stays
advisory rather than changing the build result.

This does not start additional builds, monitor agent-launched Bazel processes,
or turn lightweight repository queries into binary builds. The reader and provider
are inputs of `//:quality_sources` and `//:desktop-bundle`.
`//tools/build-graph:progress-checks` exercises the parser, reader, provider wiring
and late-event guards plus both TypeScript boundaries.
`//tools/build-graph:progress-probe` consumes the desktop bundle and runs a small
real Bazel build in a disposable owned process namespace, proving that a target
milestone arrives before exit and that process cleanup finishes.
