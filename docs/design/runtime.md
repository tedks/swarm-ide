# Typed local core, providers and the development loop

Swarm trusts the local machine and its configured agent harnesses, while keeping
privileged operations out of the renderer. The boundary is practical: a graph
label or clicked document cannot become an arbitrary process command.

The top-level Runtime area describes this routing and ownership boundary across
the application, not a service separate from the Repository and Agents areas.
Repository request/result arrows are two directions of one capability. Agent
results distinguish the IDE-owned native app-server from the read-only transcript
observation and checked queue handoff of an existing terminal owner. Reporting a
terminal process never makes that process owned by the IDE.

## Lower-level map

| Layer | Actual implementation | Responsibility |
| --- | --- | --- |
| Renderer | [app/renderer](../../app/renderer/App.tsx) | Focus, views, commands and local editing state |
| Preload bridge | [preload.ts](../../app/electron/preload.ts) | Narrow runtime-validated request/event surface |
| Electron main | [main.ts](../../app/electron/main.ts), [core-supervisor.ts](../../app/electron/core-supervisor.ts) | Native window and utility-process lifecycle |
| Core dispatch | [worker.ts](../../core/worker.ts), [worker-runtime.ts](../../core/worker-runtime.ts) | Validates, routes and publishes provider results |
| Workspace routing | [workspace-context.ts](../../core/workspace-context.ts), [workspace.ts](../../protocol/workspace.ts) | Checked same-repository selections and immutable provider lifetimes |
| Contracts | [protocol/schema.ts](../../protocol/schema.ts) and domain modules | Shared request/result types and runtime schemas |
| Providers | [provider.ts](../../core/provider.ts), files, tasks, build graph, agents | Filesystem, Git, Bazel and owned harness operations |
| Installed Linux command | [launcher.mjs](../../tools/cli/launcher.mjs), [package.nix](../../nix/package.nix) | Resolves the invocation's project, launches the immutable production bundle and keeps host configuration available |
| Service declarations | [service-discovery.ts](../../core/service-discovery.ts) → [provider.ts](../../core/provider.ts) | Read-only working declarations → source graph; no build or deployment |

The Electron renderer has context isolation and no Node integration. The local
core resolves workspace identity and canonical paths, manages process lifetimes
and publishes bounded results. Registration/configuration selects actual providers;
renderer text does not grant new filesystem or execution authority.

`workspace.open` takes a registered session ID or the launch workspace, not a raw
path. Each opened canonical repository ID owns its own files, watchers, tasks,
plans, build and project-context readers. `workspaceId` on requests and events,
or an existing repository ID on domain requests, routes the operation before any
await. A write accepted for A therefore remains an A write after the UI opens B.
Unknown or contradictory scope is rejected. Failed initialization closes only its
own providers; core shutdown closes all contexts, including pending creation.

The renderer's [workspace bridge](../../app/renderer/workspace-bridge.ts) stamps
rooted requests and filters events; shared agent observation, steering and Work
Log services remain single owners in the launch context. New agent preparation
outside that launch scope is explicitly unavailable in this increment. Provider
facts are rebuilt for the selected root or shown unavailable, never relabelled.
Opened contexts remain alive until core shutdown; idle-context eviction and
cross-repository workspace selection are follow-ups rather than hidden behavior.

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

## Installed application path

The Nix `packages.swarm-ide` output builds the same `//:desktop-bundle`, then
installs its `app/`, `core/` and `renderer/` trees plus the `swarm` command.
`apps.default` invokes that command. `swarm --workspace PATH` resolves the project
from the caller's directory and launches packaged Electron; it does not start
Vite or rebuild the project. An installed `package.json` gives Electron the stable
`swarm-ide` user-data identity. The fixed installed CLI bootstrap applies any
explicit profile with Electron's userData API before starting the unchanged main.
Writable history stays in the user profile, not
the Nix store. The host's agent tools and configuration remain the source of truth.

The direct launcher boundary is tested by `//tools/cli:checks`; the installed
command and real workspace/source path are exercised by the owned virtual
`//tools/cli:smoke`. See [Linux installation](../linux-install.md). The container
path can consume the existing production tar independently; it is not a reason
to route installed desktop execution through a development server.

An explicit `--tmux-server`/`--tmux-socket` and `--tmux-session` association uses
`//tools/cli:registration-bundle`, which packages the existing exact-pane discovery
and registry writer from `tools/session-registration`. Only that chosen session's
panes are inspected. A unique rollout, or one explicit CLI header alongside only
its same-process direct native children, selects a candidate; unknown/mixed
identities remain ambiguous. Header linkage never substitutes for the existing
pane/PID/start/open-file validation. Each verified process supplies its own canonical Git worktree;
the opened project never substitutes for an unavailable agent context. A fresh
private bounded registry generation feeds the unchanged observer. Older private
generations remain available explicitly, not merged automatically into new scope.
No agent or tmux lifecycle is transferred to the installed app.

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

An explicitly selected target build writes a private Bazel Build Event Protocol
JSON-lines file. While that process runs, the selected-target executor reads newly
appended complete lines and reports the latest target, test or output milestone
through its build-job observation. Running progress stays indeterminate; a
milestone is not a successful process exit. The old service-provider build and
artifact publication pipeline is removed: service discovery only reads declarations.

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
or turn lightweight repository queries into binary builds. The reader and target executor
are inputs of `//:quality_sources` and `//:desktop-bundle`.
`//tools/build-graph:progress-checks` exercises the parser and reader plus both
TypeScript boundaries; selected-target wiring has separate build-job checks.
`//tools/build-graph:progress-probe` consumes the desktop bundle and runs a small
real Bazel build in a disposable owned process namespace, proving that a target
milestone arrives before exit and that process cleanup finishes.

## Selected target builds

The dependency graph has two different actions: **Refresh dependencies** queries
declarations; **Build selected target** compiles the explicitly selected local
rule. It does not run the fixed example service-topology build or automatically
build the whole repository. Selection must come from a current observed rule;
the privileged bridge accepts one exact local label, not a pattern, executable,
working directory or arbitrary flags.

[`protocol/build-jobs.ts`](../../protocol/build-jobs.ts) defines
`build.start`, `build.observe` and `build.cancel`. The worker routes these to a
[`TargetBuildService`](../../core/build-jobs.ts) created for the registered
repository root and world. Each root owns its own service; switching worktrees
must select that service, never relabel jobs from another root. The service
admits one build at a time and retains its 20 most recent jobs through source
changes for the core lifetime. Historical success does not certify later edits.

[`target-build-process.ts`](../../core/target-build-process.ts) runs pinned Bazel
7 in a private owned PID namespace and private output cache, using batch mode
and at most three build workers. Repository `.bazelrc` settings are respected;
system/home rc files are not loaded. This is trusted repository execution, not
read-only analysis. The build has a 15-minute deadline and an 8 MiB process-output
limit, retaining the last 4 KiB of readable output. Cache/artifacts last until
core shutdown; this is not the user's shared Bazel server or persistent cache.

The same complete-line BEP reader supplies real in-flight milestones. Jobs show
target, status, start time, elapsed time, latest message and retained output.
They do not report synthetic CPU/memory values or guessed percentages. Stop
requests owned shutdown and remains Stopping until cleanup finishes. Unknown
cleanup fails the job, prevents another launch and withholds successful core
shutdown attestation. Build observations and source refresh never replay Start.

The renderer's [`useTargetBuilds`](../../app/renderer/build-resources/use-target-builds.ts)
polls only running jobs (or recovers a failed observation), with repository/world
and core-lifetime fencing. The existing
[`BuildResources`](../../app/renderer/build-resources/BuildResources.tsx) retains
the resulting cards independently of example topology jobs.
`//tools/build-graph:target-checks` consumes `//:quality_sources` for service,
collector, bridge-correlation, hook and mounted-control regressions plus both
TypeScript boundaries. `//tools/build-graph:target-probe` consumes its probe
module, sources and desktop bundle; it exercises actual worker request routing
and owned successful/failing Bazel targets in a disposable repository.

## Dependency setup and demo applicability

Passive build-graph observation is offline. **Refresh dependencies** deliberately
permits normal declared dependency downloads and repository loading, without
compiling targets. The graph shows bounded Bazel progress/errors and **Cancel
refresh**. Requests still carry the selected repository/world identity through
the existing core route. A temporary query/output repository cache is reused
within that core provider's lifetime and removed after confirmed shutdown; no
host cache/configuration is changed. Passive failed-input checks do not retry
cold downloads. The existing 30-second offline deadline becomes 120 seconds for
deliberate loading; both retain the 4 MiB output limit and owned process cleanup.
Cancellation retains the old graph, prevents late publication and waits for
cleanup before another query. Cancellation does not silently restart on return.

Service observation no longer owns a Bazel build pipeline. The provider reads
generic Compose/native declarations, validates the working fingerprint around
discovery and publishes source evidence. Its single active read is coalesced with
source changes, aborted on disposal and prevented from publishing stale results.
Selected-target builds remain a separate capability. No special example adapter
or `.swarm/service-topology.json` gate remains.

`//tools/build-graph:compat-checks` consumes `//:quality_sources` for these
boundaries, renderer cancellation and both TypeScript configurations.
`//tools/build-graph:compat-probe` consumes the query module, source scripts and
desktop bundle to perform one deliberate query of a supplied real repository,
verify passive result reuse and unchanged Git status, and confirm cleanup.
