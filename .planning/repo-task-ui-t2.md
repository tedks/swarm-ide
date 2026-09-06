# Browse repository tasks without taking over source focus

This ExecPlan follows `.planning/PLANS.md` and is maintained throughout T2. The shared contract and overall release sequence are in `docs/repo-task-surface.md` and `.planning/repo-task-surface.md`; those files are not edited in this slice.

## Purpose / Big Picture


The Work panel gains Tasks instead of a disconnected Dispatch queue. A developer can inspect metadata in Information while retaining the source editor, graph cameras and agent draft, then deliberately Reveal one recorded file reference. Production currently has an unavailable task provider, so the visible honest unavailable state is the actual runtime increment; test-only schema-valid data proves browsing. T3 separately connects the real reader and verifies actual metadata.

## Progress


- [x] (2026-09-06) Created designated worktree at reviewed a218277; read instructions, full task design and source lifecycle; started bounded client and pure component helpers.
- [ ] Implement independent task client and metadata instruments with adversarial tests.
- [ ] Add narrow App composition and safe explicit source/line Reveal with real CodeMirror retention tests.
- [ ] Run local quality, full build and all tests; prove actual unavailable UI on owned virtual X11.
- [ ] Reach provider-diverse council fixpoint, normal merge, Ditz sync, cleanup and exact handoff.

## Surprises & Discoveries


The existing source opener activates the target before observation and hides typed broker errors behind generic text. The existing editor instance is keyed by active file, so switching source tabs recreates that editor. T2 must not recreate the active editor merely to inspect a task or re-Reveal an already-open file; narrow source changes must not rewrite this lifecycle.

The default task provider is intentionally unavailable and the outer task-read deadline is still five seconds. ROOT settled a later T3 task-only twelve-second outer deadline; T2 must display timeout failure, not install an incompatible five-second client timer or change agent acknowledgement timing.

## Decision Log


Decision: task observation and selection live in a dedicated external-store client, separate from workspace focus. Rationale: envelopes may contain incidental workspace state and arrive late; task reads must never steer graphs or files. Context uses registered world/repository and provider ditz, with full ID identity and separate revision evidence. Date/author: 2026-09-06, T2.

Decision: native task buttons, filters and scoped CSS compose into existing Work and Information panels. Selection does not open hidden compact panels or steal focus. Explicit palette actions can open panels. Rationale: preserve the existing cockpit and keyboard semantics rather than introduce an overlay. Date/author: 2026-09-06, T2.

Decision: only literal canonical `file_refs` pass to the existing broker. Unsaved, uncertain, loading or conflicting buffers do not receive metadata line navigation. Clean saved files validate line existence before a unique navigation request reaches CodeMirror. Rationale: metadata line numbers are not offsets into arbitrary unsaved content. Date/author: 2026-09-06, T2.

## Outcomes & Retrospective


Implementation and verification are in progress. No real backlog, provider launch or production policy availability is claimed.

## Context and Orientation


`protocol/tasks.ts` validates two read-only requests: tasks.snapshot with a refresh flag and tasks.read with pinned metadata commit/full ID. `parseCoreResponseForRequest` validates the envelope and result against that request; the renderer additionally checks its registered repository, generation, observation sequence, selected ID and blob. Snapshot is the last complete observation; attempt status can fail while that snapshot remains visible.

`app/renderer/App.tsx` owns source tabs, existing graphs, palette and panel composition. `EditorPane.tsx` synchronizes content into a stable CodeMirror instance. `core/files.ts` remains the final file authority, including containment and nonregular/binary/size failures. Agent clients, graph implementation and all privileged code are frozen here.

Assume every task description, title and note is hostile literal text. Never interpret HTML, URLs, guessed prose paths, glob patterns, directives or task readiness. Responses can be malformed, mismatched, delayed, reversed or interrupted by core replacement. Files can be deleted, FIFOs, symlink escapes, changed during opening or dirty locally. Handle these as visible bounded errors without mutations or silent authority changes.

## Plan of Work


First create `app/renderer/tasks/client.ts`, a read-only store with lifecycle/correlation guards, visible-only five-second cheap checks, initial/explicit full refresh and no queued polling backlog. Pure TaskPanel and TaskDetail components show Open/All, full-ID/title search, sorted summaries, literal dependencies/diagnostics, revision and attempt failure. Tests use existing fixtures exclusively under tests.

Then compose those instruments in App, keeping graphs and editor mounted during inspection. Source interactions restore source information while retaining task selection. Add palette actions for Tasks, Refresh and Show details. The explicit Reveal flow validates syntax, uses existing watch/read, reports typed errors, retains dirty text/cursor, and navigates only a valid line of saved content. Add a non-remounting EditorPane line request and focused regressions.

Finally run gates on the frozen worktree, request independent native/foreign review, fix every important finding and repeat fix-delta review until clean. Archive actual virtual screenshots and truthful local/hosted evidence before normal PR merge and Ditz completion.

## Concrete Steps


All project tooling runs from `/home/tedks/Projects/swarm-ide/repo-task-ui`:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //:quality --jobs=3 --nocache_test_results
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results

GUI tests only use the owned disposable X11 harness on port 55174. Never target DISPLAY=:0, watched 55173 or unrelated 5173. Existing harness commands and supported test arguments will be recorded with actual evidence; no unowned global target changes are authorized.

## Validation and Acceptance


Client tests reject wrong request/world/repository/provider/revision/kind/blob, old sequence, disposed generation and out-of-order selected detail. They prove hidden/disposed timers stop, first open differs from cheap checks, failures retain old observations, and no task operation invokes agent commands or writes files.

Component and integrated App tests prove stable full-ID selection, Open is not Ready, missing selected tasks remain explicit, malicious descriptions stay text, invalid references stay disabled, and only explicit Reveal opens source. Actual CodeMirror tests preserve identity, content and cursor during task selection and dirty Reveal; repeated clean line Reveal navigates without remount. Missing/FIFO failures are visible typed messages, and unsuccessful navigation does not destroy previous source/draft/graphs.

Owned virtual proof checks actual unavailable production behavior, keyboard/palette navigation, compact/150% layout and source/camera/draft continuity. Simulated metadata tests are not actual provider integration. All relevant local gates and council convergence are necessary for the user's conditional remote-CI waiver; hosted failures must remain reported as failures.

## Idempotence and Recovery


Reads and navigation do not write task metadata. Explicit full refresh is coalesced; errors do not cause a retry storm. Closing/disposal rejects late requests and releases timers. Preserve peer worktrees, watched master and app. Commit/push granularly on this branch and normal-merge only after gates; retain the clean worktree/branch/session and evidence for ROOT retirement.

## Artifacts and Notes


Step coordination is `/tmp/swarm-ide-task-ui-t2.MreE08/seam.md`. Final sanitized evidence belongs under control-worktree `artifacts/overnight-wave/task-ui-t2/`; no private task text or credentials in logs. Ditz issue `repo-task-ui-t2` blocks `repo-task-surface` and closes only verified T2. T3 and D2 remain separate gates.

## Interfaces and Dependencies


TaskBridgeClient exports getSnapshot/subscribe, connect, setContext, setVisible, refresh, select and dispose. TaskPanel and TaskDetail consume typed pure props, never privileged APIs. Existing React, CodeMirror, Zod and typed bridge suffice; no new dependencies. An optional editor navigation request carries a unique nonce, requested line and exact saved content so late navigation cannot target a different buffer revision.

Revision note: initial T2 plan records scope, explicit assumptions, hostile inputs, frozen ownership, proof boundaries and the later T3 deadline gate before implementation.
