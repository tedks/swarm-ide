# Publish real repository topology and edit its source safely

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current while work proceeds. This document follows `.planning/PLANS.md`.

## Purpose / Big Picture

After this change, opening Swarm IDE shows the real checked-out repository rather than a fictional software world. Its service graph begins gray because no build-derived topology has yet been observed. The user can run `Build repository service topology`, immediately see an exact fingerprint and Bazel target in yellow, and then see a validated `FraudCheck` service with its interfaces and actual source links turn green only if the workspace stayed unchanged. Clicking a repository file or service source link opens the real file in a sandboxed CodeMirror source observatory. Its primary purpose is browsing and watching agents change the working world: incoming text glows green and removed text appears briefly as a red ghost before dissolving. Direct editing remains a smaller, conflict-safe capability; successful saves naturally alter the same fingerprint used by topology reconciliation.

## Progress

- [x] (2026-09-05 14:20Z) Verified clean `origin/master` at PR #3 and created `feature/real-service-topology` in `/home/tedks/Projects/swarm-ide/real-service-topology`.
- [x] (2026-09-05 14:23Z) Started ditz issues `real-service-topology-provider` and `initial-snapshot-event-race`; filed `first-real-agent-run-surface` behind the provider.
- [x] (2026-09-05 14:27Z) Audited the protocol, fixture worker, Electron bridge, renderer event reducer, graph pane, build targets, and desktop harness.
- [x] (2026-09-05 19:05Z) Added deterministic Bazel service declaration/source targets, a validated artifact extractor, and public Protocol Buffers contracts for `FraudCheck.Assess` and `Payments.Authorize`.
- [x] (2026-09-05 19:05Z) Replaced the production fixture worker with the real workspace provider and exact Git/Bazel reconciliation state machine.
- [x] (2026-09-05 19:05Z) Added the typed file bridge, CodeMirror workspace tabs, focus-linked source navigation, live external-change flashes, and file-security/concurrency tests.
- [x] (2026-09-05 19:20Z) Fixed bootstrap ordering, removed fabricated normal-world runtime/agent claims, and expanded contract/UI failure coverage.
- [x] (2026-09-05 19:29Z) Proved Bazel quality gates, deterministic artifacts, warm timings, X11 behavior on 55174, and HMR.
- [ ] Push a draft PR, run the provider-diverse council to fixpoint, obtain green CI, merge normally, close/sync issues, and leave clean synchronized master running on 55173.

## Surprises & Discoveries

- Observation: the existing normal app imports `fixtures/world.ts` directly from `core/worker.ts`, so every production-visible service, job, metric, deployment, and source path is fabricated.
  Evidence: `core/worker.ts` imports `initialSnapshot`, `dirtySnapshot`, `progressSnapshot`, and `successfulSnapshot`; the initial fixture claims active agents and `deploy:local-084`.
- Observation: the snapshot request is subscribed after the request is initiated, then loaded unconditionally, allowing a delayed bootstrap response to overwrite a newer event.
  Evidence: `App.tsx` calls `invoke(workspace.snapshot).then(setWorkspace(loadSnapshot(...)))` while `onEvent` independently advances the reducer.
- Observation: gRPC is the closest public counterpart to Google's internal Stubby system, and Protocol Buffers service declarations give this prototype a real, buildable RPC boundary without importing a service framework.
  Evidence: the demo's `proto_library` targets build under Bazel; the extractor rejects a missing RPC or request/response drift before producing an artifact.
- Observation: X11 automation can address the real Electron window reliably, but GNOME's active screensaver swallows synthetic keys even when the window manager still reports that window as active.
  Evidence: failed zoom/command acknowledgements coincided with `org.gnome.ScreenSaver.GetActive = true`; normal `SetActive false` restored the same unchanged smoke command.
- Observation: changing a React effect dependency-array shape during HMR produces the expected React development warning because preserved hook state came from the older module shape.
  Evidence: a clean renderer reload removed the warning; typecheck, production build, tests, and subsequent HMR all passed.

## Decision Log

- Decision: use one checked-in `service.swarm.json` plus an adjacent Bazel source target and explicit `genrule` that invokes a narrow JavaScript extractor.
  Rationale: the declaration owns semantic identity, Bazel owns implementation inputs, and the artifact stays deterministic without teaching the extractor renderer contracts.
  Date/Author: 2026-09-05 / Integration Architect.
- Decision: represent an unconfigured deployment with empty revision strings and a visible status widget, not a fabricated runtime provenance record.
  Rationale: the existing revision shape can remain structurally unchanged while honestly expressing absence.
  Date/Author: 2026-09-05 / Integration Architect.
- Decision: carry file reads and writes as dedicated runtime-validated core requests and responses through the existing utility process.
  Rationale: renderer IPC remains a single narrow capability; Electron never gives the sandbox filesystem authority.
  Date/Author: 2026-09-05 / Integration Architect.
- Decision: preserve graph instances while file tabs are active by hiding rather than unmounting the graph workspace.
  Rationale: React Flow camera state remains local to each graph instance and survives graph-to-file transitions without new public presentation state.
  Date/Author: 2026-09-05 / Integration Architect.
- Decision: make the CodeMirror surface browse-and-observe first, with live filesystem changes visualized inline; manual editing is secondary.
  Rationale: the IDE's central cognitive job is making swarm activity legible. A typed file watcher can represent changes from future wrapped agents today without coupling source observation to the later agent harness.
  Date/Author: 2026-09-05 / User steering and Integration Architect.
- Decision: use public protobuf/gRPC-style contracts as the demo analogue of Stubby, but keep topology identity in the small `service.swarm.json` declaration and implementation ownership in Bazel.
  Rationale: each truth has one owner: protobuf proves RPC method/type shape, the manifest supplies stable Swarm IDs, and Bazel supplies the exact build inputs. The extractor refuses disagreement among them.
  Date/Author: 2026-09-05 / User steering and Integration Architect.

## Outcomes & Retrospective

The implementation gate is satisfied pending council/CI/merge. Production now opens the actual `swarm-ide` working tree with an empty gray service graph, no fixture claims, and an explicit `not configured` deployment. The exact target `//examples/checkout-world/services/fraudcheck:service_topology` produces one semantic artifact at `bazel-bin/examples/checkout-world/services/fraudcheck/service-topology.json`; two identical builds produced byte-identical SHA-256 `4e03424ea3b0cb47aa05d32974b796f6a01d9c79a02f0c1fefb73954befbed8b`.

The real provider captures Git HEAD plus changed/deleted/non-ignored untracked paths, modes, and bytes. It publishes yellow for that working fingerprint, invokes Bazel with fixed arguments and no shell, accepts a bounded strictly validated artifact, recomputes the fingerprint, and uses the artifact SHA-256 as build ID. An exact mismatch, failed build, malformed artifact, duplicate request, or older attempt cannot publish green; red retains the previous graph.

The source observatory opens canonical bounded UTF-8 files through the typed bridge. It rejects traversal, symlink escape, non-files, binary/control bytes, invalid Unicode, oversize content, and stale expected revisions. Saves use a unique sibling, preserve mode, fsync, atomically rename, and return the new working fingerprint. External clean-buffer changes render additions green and removals as a temporary red ghost; dirty buffers become conflicts without replacement.

Validation evidence: `bazel test //...` and `bazel build //...` pass; the Bazel-owned quality target reports 15 files and 81 tests passing. Five clean warm runs measured click-to-yellow 128/117/91/84/90 ms (median 91 ms) and click-to-green 990/198/176/166/172 ms (median 176 ms, observed p95 990 ms), within the targets; a later automated end-to-end run measured 68 ms and 963 ms. X11 screenshots under `artifacts/real-topology/` and `artifacts/desktop-final/` show gray→yellow→green, the real graphs/contracts, graph↔file tabs, live green insertion/red deletion, and preserved conflict content. Real-window Ctrl-S wrote the expected probe and changed the working world; a subsequent external restore left the unsaved buffer visible under `CONFLICT`. Final HMR measured 70 ms edit-to-pixel, 99 ms edit-to-title, and 11 ms Vite-event-to-paint on port 55174.

Remaining risk is intentionally narrow: file observation is local single-host coordination rather than a hardened multi-user filesystem transaction, and source flashes use one bounded line-level replacement region rather than a full semantic diff. Agent attribution, durable change history, generalized provider discovery, LSP, terminals, and merge UI remain follow-up scope.

## Context and Orientation

`protocol/schema.ts` defines every renderer-to-core request, response, event, graph, mapping, widget, and workspace snapshot with Zod runtime validation. `app/electron/main.ts` starts `core/worker.ts` as a privileged Electron utility process and brokers validated messages. `app/electron/preload.ts` exposes only that typed bridge to the sandboxed React renderer. `app/renderer/App.tsx` renders the four-region cockpit; `app/renderer/GraphPane.tsx` owns each React Flow graph, and `app/renderer/state.ts` rejects invalid or stale events. `fixtures/world.ts` contains deliberately fictional worlds used today by both production and tests; after this work it remains only test material.

A working-world fingerprint is a deterministic SHA-256 digest of Git HEAD plus the content and identity of every tracked modification, deletion, and non-ignored untracked regular file. It identifies the exact local source inputs the user sees. A build artifact is green only when fingerprints computed immediately before and after Bazel match. The artifact digest is the build revision ID. “Last green” means an already validated graph remains visible while a later attempt is yellow or red.

The privileged core opens only the configured workspace root supplied by Electron. A canonical file is a regular UTF-8 file whose real path remains below that root. Reads and writes reject absolute paths, traversal, symlink escape, binary data, oversized content, non-regular files, and invalid encodings. A content revision is a SHA-256 digest returned by a read. Save succeeds only when the current on-disk digest equals the editor’s expected revision, then writes a sibling temporary file, preserves mode, fsyncs it, renames it atomically, and fsyncs the directory. On conflict the user’s in-memory buffer remains untouched.

## Plan of Work

First add `examples/checkout-world/services/fraudcheck/service.swarm.json`, its implementation source, and `BUILD.bazel`. Add a small extractor under `tools/` whose inputs are the declared manifest and Bazel-owned source list. It validates schema version, stable and unique IDs, request/response types, missing or dangling required interfaces, and contained normalized source paths, then writes canonical JSON with no timestamps or presentation fields. A Bazel target named `//examples/checkout-world/services/fraudcheck:service_topology` produces the sole artifact.

Then add core modules for workspace fingerprints, safe files, artifact validation/adaptation, and the real provider. The initial snapshot contains a real bounded repository graph and an empty gray service graph. Starting reconciliation captures the fingerprint synchronously, publishes yellow before launching fixed-argument `bazel build`, reads the bounded artifact, computes its SHA-256 build ID, rechecks the workspace, and publishes green only for an exact match. Every attempt has an epoch and only the current attempt may publish. Failures turn the attempt red while retaining the last validated graphs. Duplicate request IDs are rejected both while pending and after completion within a bounded cache.

Extend `FocusRef.domain` with `interface`, bump the protocol version, and add dedicated `file.read`, `file.write`, `file.watch`, and `file.unwatch` requests plus a typed file-change event without changing existing graph and workspace shapes. The renderer opens `FocusRef.path` values in file tabs through those requests. CodeMirror 6 holds the buffer; the UI shows path, load/save/conflict/error status, dirty state, multiple tabs, and Ctrl-S. When a watched file changes externally, the renderer reloads the authoritative text and computes a bounded line change: inserted text receives a fading green decoration and removed text is rendered as a temporary red block widget at its former boundary before disappearing. The user's dirty buffer is never replaced; the event instead surfaces a conflict. Graph panes stay mounted behind the active file so their cameras survive. Service widgets expose owning target, provided and required interface identities, real source paths, artifact digest/provenance, and `not configured` deployment state; each source becomes an editor-opening action.

Finally repair snapshot bootstrapping by subscribing first and merging the response only when its sequence exceeds the reducer watermark. Expand Bazel-owned tests for contracts, fingerprint inputs, path security, optimistic concurrency, reconciliation ordering/failures, artifact determinism, renderer navigation, and production provider inclusion. Add an X11 smoke driver for gray-to-yellow-to-green and editor interactions, then record five warm timings and screenshots on port 55174.

## Concrete Steps

All commands run from `/home/tedks/Projects/swarm-ide/real-service-topology`. Materialize dependencies only with:

    nix develop --command pnpm install --frozen-lockfile

Build and test only through Bazel:

    nix develop --command bazel build //...
    nix develop --command bazel test //...

Run the feature window without touching ports 5173 or 55173:

    SWARM_DEV_PORT=55174 nix develop --command bazel run //:dev

Run desktop verification against that same environment:

    DISPLAY=:0 SWARM_DEV_PORT=55174 nix develop --command bazel run //tools:desktop-smoke

## Validation and Acceptance

`bazel build //...` must produce both the application archive and the service topology artifact. Two builds from unchanged inputs must yield byte-identical artifact SHA-256 values. `bazel test //...` must pass all contract, provider, file-boundary, reducer, and renderer tests.

In the real Electron window, initial service topology is empty gray and contains no fake Gateway, Checkout, Payments, agents, runtime metrics, or deployment versions. Activating `Build repository service topology` produces a yellow title and UI state in under 100 ms with target `//examples/checkout-world/services/fraudcheck:service_topology`, then a green FraudCheck node with `Assess` and `Payments.Authorize`, actual paths, exact fingerprint, artifact digest, and `not configured` deployment. A failed later build retains the prior green graph. Five warm build runs should have median at most 2 seconds and p95 at most 4 seconds; any miss is reported.

Clicking the FraudCheck implementation link opens actual content in CodeMirror. Opening a second file yields two tabs. Graph-to-file-to-graph preserves camera location. An external insertion appears with transient green emphasis; an external deletion flashes as a red ghost at the deletion boundary and disappears. An external change while the user has a dirty buffer reports a conflict without losing that buffer. Editing marks the tab dirty; Ctrl-S saves when the expected revision matches and the working fingerprint changes. Traversal, symlink, binary, oversized, and unwritable inputs show bounded errors and never disclose or overwrite outside data.

## Idempotence and Recovery

The extractor and build are deterministic and may be rerun safely. A failed build never removes the last green graph. A failed save leaves the editor buffer and original file intact; orphaned unique temporary siblings may be removed after verifying they use the `.swarm-save-` prefix. The feature uses its own worktree and port. If development processes stop, rerun the Bazel dev target on 55174; do not terminate unrelated listeners on 5173 or the master UI on 55173.

## Artifacts and Notes

Local visual evidence is under ignored `artifacts/real-topology/`, `artifacts/desktop-final/`, and `artifacts/hmr-final/`. The draft landing unit is PR #4. Review rounds, final CI, normal merge commit, closed issues, and master verification will be appended during landing.

## Interfaces and Dependencies

`protocol/schema.ts` will expose protocol version 2 and add `interface` to `FocusRef.domain`. It will define `file.read` with a workspace-relative path, and `file.write` with path, expected revision, and bounded UTF-8 content. Successful file reads return path, content, revision, and size; successful writes return the new revision and working-world fingerprint. Existing workspace responses/events retain their structure.

`core/files.ts` will expose contained-file resolution, `readWorkspaceFile`, and `writeWorkspaceFile`. `core/fingerprint.ts` will expose `computeWorkingWorldFingerprint(workspaceRoot)`. `core/service-topology.ts` will validate extractor artifacts and adapt them into graphs, mappings, and widgets. `core/provider.ts` will own initial state and reconciliation. `core/worker.ts` will remain the process transport/state-machine boundary.

The renderer will use CodeMirror 6 packages (`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`) through a small `app/renderer/EditorPane.tsx` wrapper and a bounded line-diff helper. It will not gain Node APIs or direct filesystem access. The core watcher emits only validated workspace-relative paths and content revisions; it never streams arbitrary filesystem bytes.

Plan revision note (2026-09-05): initial plan created after repository audit; it incorporates the real topology and editor as one fingerprint-coherent release gate. Revised after direct user steering to make the editor a live source observatory whose primary interaction is transient inline visualization of external/agent additions and deletions.
