# Preserve the native window during development reloads

This living ExecPlan follows `.planning/PLANS.md`. Maintain its Progress, discoveries, decisions, and outcome sections as the implementation evolves.

## Purpose / Big Picture


An ordinary code edit must reach the running Linux cockpit without replacing its native window, changing its workspace, stealing focus, or throwing away source buffers. Renderer edits use Vite's existing in-document update mechanism. Core edits replace only the privileged utility process. Preload edits reload the existing document when it is safe. Main-process edits explicitly require a deliberate restart.

## Assumptions and failure modes


The privileged main process owns a single BrowserWindow; only its trusted top-level renderer can request bounded operations. Development builds are local trusted inputs, not commands accepted from the renderer. An individual build may fail or overlap another edit, the core may exit before or after a file rename, and messages from an old process can arrive after a replacement is ready. A save without its acknowledgement has an unknown outcome, not proof that nothing was written. Never automatically replay it. A dirty or unresolved buffer blocks document reload, including keyboard reload. A core restart must settle read requests, drain intentional writes, and invalidate old events without resetting the native window. Shutdown must disable retries before killing anything. Crashes that repeat must exhaust a bounded retry budget. The physical master app on 55173 and the unrelated 5173 listener are out of scope for automation.

## Progress


- [x] (2026-09-05 23:05Z) Created designated feature worktree from synchronized b513ac0; started both Ditz issues; installed frozen dependencies; traced development, IPC, editor and virtual-display lifecycles.
- [x] (2026-09-05 23:23Z) Implemented executable-byte build dispatch, cumulative update revisions, utility supervision and 8 lifecycle tests.
- [x] (2026-09-05 23:23Z) Implemented guarded document refresh, stale-view retention, file re-observation, navigation persistence and unknown-save disk reconciliation; 131 focused tests pass.
- [x] (2026-09-05 23:32Z) Fixed native council findings: Fast Refresh remount checkpoints including uncertain saves, working-reference retagging, and stale topology persistence across combined core/preload updates. Extended virtual proof passed and 134 focused tests passed.
- [x] (2026-09-05 23:41Z) Final code a378a41: 136 focused tests, all five Bazel test targets uncached, and all 19 build targets pass. Final extended virtual reload scenario, zoom and dedicated HMR proof pass.
- [x] (2026-09-05 23:39Z) Council converged CLEAN after three native rounds; foreign seats unavailable after actual attempts. PR #7 pushed; hosted CI/merge and deliberate master adoption remain landing gates.
- [ ] Push draft PR, council to fixpoint, normal merge after gates, synchronize issues/master, preserve evidence and clean owned resources.

## Surprises & Discoveries


The existing development launcher restarts the entire desktop after every successful bundle, including a core-only edit. The main process ignores core.ready/core.failed and has no recovery after exit. Writes deliberately have no timeout; this is correct for commit-bearing operations but requires explicit unknown-outcome handling after exit. Hosted PR #5 CI had a cold topology timeout despite successful local proof; that recorded waiver is not a waiver for new failures.

React/DOM tests exposed a stale selector-cache result in the installed jsdom version: querying an old class returned the same element after its class had changed. The recovery test now checks the stable file-state element's current class instead. The buffer's disk reconciliation was correct.

The first hosted PR #7 run hit the same dynamic-class selector problem in an existing save test: its DOM printed `saved · Saved · working cccccccccccc` while `.file-saved` returned null. All file-state assertions now query the stable element and inspect its current class. This is a targeted test correction, not a timeout waiver. The disposable virtual world needs a real Git HEAD and a fresh frozen dependency materialization, not copied package-store metadata. The extended scenario also exposed restoration running before lifecycle readiness; restoration now waits for ready.

## Decision Log


Use a single multi-entry esbuild context and publish only complete successful output sets, comparing bundle contents to choose an action. This avoids independent watchers racing shared dependency edits. Main changes latch a restart-required notice instead of silently replacing the window. Keep the core protocol independent of shell lifecycle: add a bounded validated shell lifecycle channel and generation-tagged transport envelopes. Defer document refresh while source buffers or save outcomes require attention. These are intentionally conservative defaults, chosen on 2026-09-06 by the implementation owner.

User steering refined the intent: preserve everything an edit did not invalidate. Compare executable bytes with external source maps, not bundle timestamps; a comment-only rebuild performs no lifecycle action. Core replacement does not rebuild unrelated derived data automatically; it retains the previous topology as stale until an explicit build reconciles it. Cumulative core/preload revisions in the control snapshot prevent a fast later edit from hiding an earlier required update.

The first council was not clean: native Codex found that hook-changing Fast Refresh remounts bypass beforeunload, old graph navigation identities were stale after core source changes, and combined core/preload replacement lost the retained graph. A small Vite-only module checkpoint now preserves component state and marks outstanding saves unknown after remount; validated session storage preserves the stale snapshot over a permitted document refresh. Working navigation is retagged without changing derivation provenance. Claude timed out after 300 seconds without a review; agy hit its headless command-permission failure and then timed out after the helper's one retry. These are missing foreign seats, not clean opinions.

Round two found two fix-introduced races. Actual pending-write ownership now survives component remount and notifies the new component when the old operation settles; disk reconciliation stays blocked until then. Navigation restoration also waits for an observed snapshot for the current generation. Round three, scoped only to that fix delta, was CLEAN. Session-storage preflight avoids repeated automatic reload vetoes when storage is unavailable. No new privilege capability or process-wide hot swapping was added.

## Outcomes & Retrospective


Implementation is complete and verified locally. Three council rounds resolved the less obvious failure modes: a remount is not an unload; a warning is not ownership of a running write; a ready process is not yet a fresh snapshot. Native convergence on a378a41 was CLEAN. The marker-qualified handoff records final hosted CI/merge state. Adoption requires a deliberate action on the physical-desktop instance; the step will not silently restart it or fast-forward its watched checkout without that choice. Ditz `adopt-stable-window-on-framework0` records the adoption gate, and `document-refresh-editor-viewstate` records remaining cursor/undo/viewport checkpointing.

## Context and Orientation


`tools/dev.mjs` compiles Electron main/preload and `core/worker.ts`, and launches Vite plus Electron through `tools/dev.sh` and Bazel. `app/electron/main.ts` owns the native window and the utility process (a separate OS process for filesystem/build/provider work). `app/electron/preload.ts` exposes validated bounded methods to the sandboxed renderer. `protocol/schema.ts` defines existing request/response/event schemas. `app/renderer/App.tsx` owns source tabs, optimistic saves, observation, navigation and zoom. `app/renderer/state.ts` applies ordered graph snapshots. An epoch is a monotonic identifier for a sequence of derived work within one core; a process generation additionally distinguishes epochs after restart. `tools/virtual-desktop-run.sh` owns Xvfb/Openbox and app/scenario processes; `tools/x11-driver.sh` rejects unowned displays and windows.

## Plan of Work


First extract utility-process lifecycle and request settling into a dependency-injected supervisor with fake-process unit tests. Integrate it into the small Electron shell and forward generation-tagged events/responses. Add a validated shell status/refresh bridge. Change the development launcher to publish successful multi-bundle changes through an owned development control file; main changes remain deferred. Prove failed builds and output classification with tests.

Next teach the renderer to retain stale content during recovery, discard old asynchronous reads, resubscribe source observation, and obtain a fresh workspace snapshot with reset counters scoped to the new generation. Preserve dirty buffers; interrupted saves require a disk read before any retry. Protect document unload and save practical navigation state for clean refreshes; zoom already has persistence. Keep diagnostics visible without creating windows.

Finally add an owned-X11 scenario alongside existing topology/zoom/HMR scenarios. It edits disposable source copies, observes actual visible markers, asserts unchanged main PID/window ID/workspace/focus, and exercises core crashes, failed and rapid rebuilds, dirty deferral and recovery. No general test-harness replacement or future product features belong in this step.

## Concrete Steps


Work only in `/home/tedks/Projects/swarm-ide/stable-native-window-dev-reload`, branch `feature/stable-native-window-dev-reload`. Run tooling through Nix and builds/tests only through Bazel:

    nix develop --command bazel test //tools:quality
    nix develop --command bazel build //...
    nix develop --command bazel test //...
    SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-reload-smoke

Create and push an early draft PR with granular commits. Run the council-review skill to a clean fixpoint, recording missing foreign seats. Close `supervise-local-core` and `stable-native-window-dev-reload` only after verified landing, and run `nix run github:tedks/ditz -- sync`. Normal-merge through the PR, fetch and fast-forward master, archive evidence under `master/artifacts/stable-window-reload-final`. Stop only this feature's owned app/test resources and Bazel server, then remove the clean merged worktree and its branches.

## Validation and Acceptance


Tests must cover readiness and failure deadlines, exhausted crash retries, shutdown, read settling, unknown writes, draining writes, duplicate requests and stale process messages. Renderer tests must show new generation sequence zero is accepted, prior graph content is explicitly stale, open files are watched again, and a dirty buffer survives core replacement. Unacknowledged saves must not trigger a write retry until disk is reconciled. Virtual evidence must record the same native X11 window ID and Electron main PID before and after actual renderer/preload/core edits, unchanged workspace and focus when another virtual window is active, expected document/core generation changes, dirty refresh deferral, failed-build last-good behavior, crash recovery and rapid build convergence. Record timings and screenshots, not merely successful compilation. Hosted CI must be green or a specific new exception must be authorized; PR #5's debt stays visible.

## Idempotence and Recovery


Build outputs and test evidence are disposable; source changes are committed and pushed incrementally. Scenarios must restore only their own expected edits or operate on disposable copies. Failed builds leave last-good output available. A permanently failed core remains visibly unavailable, preserving buffers; it does not enter an unbounded crash loop. A source edit requiring a main restart remains visibly pending until the user chooses to restart. Never kill or automate the physical desktop to adopt it.

## Artifacts and Notes


PR #7 contains the implementation and virtual proof. The extended passing scenario under `artifacts/reload-fifth` recorded window 4194307, main PID 1533698, app workspace 0, active workspace 1, focus owner 14680091 throughout all update classes. Renderer update was 218ms, core update 494ms, crash recovery 423ms, and save-to-preload refresh 370ms. The same scenario preserved a populated FraudCheck topology through a structural HMR remount and a combined core/preload update. Final evidence and merge/CI/council identifiers will be added at landing. The final response begins `STABLE-WINDOW-RELOAD-20260905-8C42 COMPLETE — EXECUTIVE RECAP`; an unmet gate must be explicit.

## Interfaces and Dependencies


Use existing Electron utilityProcess/BrowserWindow, React, Zod, esbuild, Vite and Nix/Bazel dependencies. Add a shell lifecycle contract with monotonically increasing status revision, core generation/readiness, document reload state and bounded messages. The supervisor accepts injected process launch and event/status callbacks so lifecycle behavior is testable without a display. Renderer privileges remain bounded: observe lifecycle and acknowledge a safe reload, never launch arbitrary processes or evaluate code.

Revision note: initial plan records the bounded design and failure assumptions before implementation.

Revision note (2026-09-05 23:43Z): the final passing proof under `artifacts/stable-window-reload-final/reload` recorded window 4194307, main PID 1643606, app workspace 0, active workspace 1 and focus owner 14680091 throughout all update classes. Renderer update was 219ms, core update 584ms, crash recovery 417ms and save-to-preload refresh 348ms. Scenario time was 29.225s including building its populated topology; it preserved that topology through structural HMR and combined core/preload updates. Dedicated HMR observed changed pixels at 113ms; zoom restored exactly (zero changed pixels). These are samples, not guarantees. Final evidence is archived to master/artifacts/stable-window-reload-final, with immutable merge/CI/council/cleanup facts in the recap. No PR #5 CI waiver is generalized.
