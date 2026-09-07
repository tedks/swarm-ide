# Observe the current repository's Bazel graph

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Opening Build graph must show dependencies queried from whichever repository is registered, not a historical capture tied to one worktree path. Users can refresh the observation and see retained data marked stale while relevant inputs change. This observes Bazel declarations; it does not assert successful compilation or deployment.

## Progress

- [x] (2026-09-07) Verified clean `feature/dynamic-build-graph` baseline e8ec0f9 and consumed exact assignment.
- [x] Implement bounded typed query/cache and tests (a7b2938; quality1469/103).
- [x] Connect existing graph, directory links and Context without resetting navigation.
- [x] Prove actual two-repository packaged edge changes and retention on owned virtual desktop, including160px compact canvas in frozen eb46f55 (21.6s/23.6s; cleanup1, zero exceptions).
- [ ] Council convergence, one frozen local full gate, normal landing or precise base hold.

## Assumptions and Failure Modes

The core owns an already registered local repository. Bazel is provided by the configured environment. Repositories without a supported Bazel root are unavailable, not empty graphs. Repository-controlled BUILD/Starlark may fail, stall or produce excessive output; all query work needs finite process, byte and graph bounds. Renderer input cannot choose executable, cwd or query text. Repository identity and input generations fence concurrent results. A retained graph is never labelled current after a failed refresh or moved input. Source file contents do not themselves determine dependency declarations, but new or removed filenames can affect globs. Conservative bounded input scans are acceptable; undocumented omniscient change detection is not.

## Context and Orientation

`app/renderer/App.tsx` imports a path-bound capture from `fixtures/ui-build-links.snapshot.json`. Existing `app/renderer/repository/BuildGraphPane.tsx` and `build-view.ts` provide graph cameras, Follow file and target pattern selection. `protocol/schema.ts` validates the public bridge, `core/worker-runtime.ts` dispatches requests, and the Electron main/preload bridge transports them. A new focused core module will query Bazel and retain one repository's observation. A renderer hook will request it only while a consumer needs data and expose explicit refresh. No historical capture is used by production after this change.

## Plan of Work and Milestones

First add an additive request/result contract for a build-graph observation with explicit status, coverage, input identity and graph nodes/edges. Implement fixed-grammar bounded Bazel querying with a privately owned output location, parsing node kinds rather than guessing file extensions. Controlled tests cover malformed/large output, isolated nodes, out-of-order completion, errors, disposal and input movement.

Then connect the existing graph and link consumers to the observation through one renderer hook. Preserve mounted graph instances and selection/camera/source/draft state. Dirty/error states retain the previous observation with truthful labels and a Refresh/retry affordance. Refresh triggers are demand activation, explicit refresh and bounded observation of relevant definitions and filename membership; no query follows ordinary cursor movement.

Finally add a dedicated `tools/build-graph` proof that creates two real Bazel repositories, opens ordinary packaged UI, changes a BUILD dependency, and verifies an edge appears/disappears without capture identity tricks. Existing D6 task/rehearsal tooling is excluded. Record screenshots, freshness, retention and strict zero renderer exceptions. Run council to fixpoint before one final frozen full local build/test execution. If remote master moved beyond the approved base, hand ROOT exact reviewed heads rather than consuming peers.

## Concrete Steps

All project commands run in `/home/tedks/Projects/swarm-ide/dynamic-build-graph` through `nix develop --command`. Materialize dependencies with `pnpm install --frozen-lockfile`; use `bazel test //tools:quality --jobs=3` for focused implementation checks. Build and test only through Bazel. Final commands are `bazel build //... --jobs=3` and `bazel test //... --jobs=3 --nocache_test_results`; GUI/full tests hold `/tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` with `flock --close`. Desktop proof must own virtual X11 :90 and port55174, never the physical display.

## Validation and Acceptance

Actual repository A has two packages and a dependency. Build graph displays both rule nodes and the edge, including isolated rules. Editing the dependency definition marks the observation stale and a bounded refresh yields the changed graph. Repository B obtains its own graph and cannot reuse A's identity or data. Missing Bazel roots, failed/timeout/malformed query output and limits have explicit non-current states. Refresh/hide/reactivation must retain graph cameras and dirty editor/draft. Every historical/synthetic observation remains labelled separately from actual packaged evidence.

## Idempotence and Recovery

Use owned temporary query/proof directories and processes only; never kill shared Bazel servers or modify shared previews. Preserve this worktree, branch and step evidence. Refresh coalesces duplicate work and cancellation/disposal cannot publish late results. Normal PR merges preserve history. No direct master push, rebase, force push, hosted CI work, credentials or model activation.

## Interfaces and Dependencies

Use existing TypeScript, Zod, Node child-process/filesystem and Bazel facilities only. Add no package dependencies. The request selects only the registered repository/world and refresh intent. Query grammar and executable remain core constants. Renderer consumes a runtime-validated observation and adapts it to the existing graph view; observations distinguish query provenance from binary build status.

## Decision Log

- Decision: one end-to-end PR, no separate design department or platform rewrite. Rationale: tonight's working-repository demo needs visible useful behavior quickly. 2026-09-07, B1.
- Decision: repository-scoped observations, never a global capture cache. Rationale: same labels in different roots are different evidence. 2026-09-07, B1.

## Surprises & Discoveries

The first real query exposed two runtime facts: ignoring rc files also removes Nix's Java selection, and the wrapper can consult repository tools/bazel. ROOT approved only the two explicit pinned runtime declarations (no dependency version/lock changes). A finite production-module trace then proved Bazel exited0 with valid data but stdout EOF waited for owner closure. The corrected collector starts owner close on exit, drains late bytes and waits confirmed cleanup; it does not weaken ownership or retry a timed-out query to claim causality.

The first parser experiment using deps(//...) required external setup beyond this vertical. The implemented //...:* query honestly reports local declaration coverage and unresolved external endpoints, without inventing closure. The first quality run exposed seven tests relying on the old capture or query ordering; explicit labelled mocks and demand restricted to graph consumers repaired those setups. A later native finding had an exact 1RED/1462PASS reproduction for initial error state being hidden by passive demand. The correction preserves error and explicit retry. New collector/input/queued-refresh tests were added alongside fixes and are not claimed as pre-fix RED.

The first successful graph mutation proof exposed a test-input issue: native insertion appended to the prefilled draft. A following Ctrl+A gesture did not establish selection. The proof now establishes DOM text selection before native insertion and checks exact draft text before mutation; it never assigns React state or weakens retention checks. Initial actual graph/edge screenshots and failed runs remain preserved.

## Artifacts and Notes

Step evidence lives at `/tmp/swarm-ide-build-graph-b1.MFmmXC`; `consumed.md` records initial state. Raw test/council and packaged evidence will be linked here as produced.

## Outcomes & Retrospective

At 19:25 UTC, implementation a7b2938 has OpenAI native and same-session Google fix-delta CLEAN. Anthropic explicitly Sonnet timed out240s without a review and is unfilled, not CLEAN. Both complete actual packaged repository journeys passed21.6s each with cleanup1 and zero renderer exceptions. Screenshot: /tmp/swarm-ide-build-graph-b1.MFmmXC/packaged-selection-fix/run.MMLuuS/first/03-added-edges-retained-work.png. Narrow runtime-declaration/invalid-path tests subsequently passed in quality-runtime-proof.log (1470/103). Screenshot inspection exposed a tiny canvas under accumulated controls; the focused correction keeps a160px canvas in a scrollable Build pane. A new actual geometry assertion accompanies that correction; this is not claimed as an independently executed pre-fix RED test.

Remote master advanced to c3128715a785c2fd42011e4cf5941038b268335c. Exact ROOT clearance is requested before any peer consumption or normal landing. No shared app/master/integration adoption has occurred. Final frozen full local gates, compact-canvas proof, Ditz closure and landing are not yet claimed. See docs/dynamic-build-graph.md for exact supported triggers/limits and residual scope.

### Frozen gate and bounded continuation, 19:52 UTC

ROOT cleared exactc312871 (normal PR51). Automatic conflict-free compositioneb46f55 has parentfd13f4b+c312871 and treee7c78f9b5c73443533b130132b736a3c9c2dfff6. Full39 build PASS59.309s; quality1496/106 PASS43.3s; frozen actual two-repository Build graph PASS48.1s, including minimum canvas/retention/error/cleanup assertions. Final-package/build-graph/run.vyF8xY holds evidence. Full15 ended14PASS/1FAIL346.536s, not green.

Navigation had three obsolete capture-notice assertions (exact ROOT-approved replacement in71183f6) plus a separate Swarm Q2 core-recovery service-inspection timeout. Original saved final DOM focus was Refresh directory, with an extra Refresh click; no key-target record existed. The service nodes/source/draft were retained and renderer had zero errors. B1 query was not requested in that scenario. This does not establish original causality.

ROOT authorized one passive bounded focus/key trace and one finite navigation run, no extra input/waits/retries/assertion changes. Instrumented4e0ac39 passed all four real navigation cases101.3s, each cleanup1/zeroerrors. Trace5events/0dropped shows connected service node gaining focus and receiving Shift+Enter; expected inspection and subsequent original provenance/deleted-restored/no-replay/retention assertions passed. Instrumentation adds observation round trips and can perturb scheduling. This is a negative historical diagnostic boundary, NOT a production fix or waiver. See recovery-diagnostic-boundary.md and recovery-diagnostic/repository-navigation/run.n46MZ3/swarm/q2-focus-trace.json in the step directory.

OpenAI native and Google same-session correction/diagnostic deltas CLEAN; Sonnet still unfilled/no-review. Ditz repository-q2-recovery-focus-delivery stays OPEN, as do the historical topology timeout and broader dynamic-build-graph-followup. ROOT is asked to disposition this narrow noncritical residual input-delivery risk before ONE corrected full-local run and normal landing. No further forensic stage, peer consumption, shared app adoption or model execution is assumed. PR52 is pushed and held, not complete.

At19:53 remote master advanced again to94efa68940a2fc17008b9f2dab62bd76ce89dc13. It has not been consumed. The single next action is ROOT's combined exact reviewed-base clearance and residual-focus-risk disposition (final-gate-request.md), followed only if authorized by one corrected full local gate and normal landing with no new failures. As of19:56 no combined authority exists; return a coherent reviewed bounded hold rather than repeatedly testing or waiting indefinitely. No foundation/issue closure or app adoption is claimed.

At20:02 ROOT completed exact94efa689 intake and explicitly authorized its composition, plus accepted only the precisely documented original Q2 risk as nonblocking under the user's critical-only demo policy. The original issue staysOPEN; recurrence/new failures are not automatically exempt. Automatic normal composition has no conflicts and preserves L1 external-workspace startup suppression. ONE corrected full-local gate follows, using the legacy55174 shared lock as directed by virtual-desktops.md; no extra forensic stage, no unreviewed newer base. This supersedes the earlier authority hold; actual green/landing remains pending its receipt.

Initial plan written before implementation to name authority, input and lifecycle assumptions.
