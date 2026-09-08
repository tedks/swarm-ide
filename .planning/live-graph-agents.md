# Put real agent activity on graph nodes

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator looking at a repository, build target, service or component should see which registered agents most recently touched its source and click the agent to open its conversation. Updates must not move graph nodes or mix identical filenames across worktrees.

## Progress

- [x] (2026-09-08) Inspected existing observations and graph consumers; dependencies materialized.
- [x] Add exact-worktree observation and membership mapping, independent clickable overlay.
- [x] Connect repository, build, service and component consumers without new polling.
- [x] Focused local tests/types: 33 direct/existing tests plus one fresh-window mounted test passed; native runtime convergence clean.
- [x] One owned GUI execution displayed real registered locations and selected the exact conversation while retaining the local editor and graph cameras, with zero renderer errors. Scenario did not pass: the intentionally dirty editor vetoed normal quit. Cleanup confirmed.
- [ ] Corrected visible-pointer/undo-before-close driver is reviewed and syntax-checked but requires separately authorized GUI execution; issue swarm-live-sprite-pointer-proof tracks this.
- [x] Living design and actual source/Bazel mapping updated; PR136 implementation pushed.
- [ ] Final ready push, Ditz sync and executive handoff.

## Surprises & Discoveries

Registered `ExternalDetail.entries` carry typed `path`, `cwd`, event IDs and timestamps; each session has a checked canonical `worktree`. Shared lifecycle distinguishes working, waiting, failed, completed and unknown. Native `TrustedSnapshot.activities` deliberately strips file paths and retains only generic summaries. Neither a task attachment nor natural-language output is a reliable current location, so native runs without a structured location remain in the list. This increment adds no telemetry or parser speculation.

Native review found that initial `workspace.snapshot` did not return a canonical root descriptor; the ordinary first window therefore had no root until a worktree switch. The existing startup request now uses `workspace.open` with a null session, preserving generation/navigation guards and avoiding a second read. A direct mounted startup test covers descriptor arrival. Existing living-design tests still hardcoded the pre-PR130 fixture project ID; their test base now derives that identity without weakening the protocol.

## Decision Log

Use the existing registered fleet and selected detail, preferring newer checked observations. Gate placement on exact selected canonical root and safe path resolution. Retain the last file event when a later event is not file-related, but label it last touched, not currently being edited. Stale/paused/unavailable observations cannot animate as working. Terminal lifecycle never regresses to working because a file was touched.

Use a React context overlay inside graph nodes so transcript changes do not alter node arrays, edge arrays, layout or camera dependencies. Graph membership remains domain-specific: nearest visible directory or file, explicit Bazel file input, authored component source path, or service navigation mapping. No inferred dependency walks or source ownership from proximity.

## Outcomes & Retrospective

The real registered fleet is connected to repository, build, declared service and authored component graph overlays. Native runs whose observations contain no file location are deliberately unplaced, not assigned guessed nodes; issue `swarm-native-graph-locations` tracks the necessary structured producer addition.

Direct tests cover the requested negative worktree/status and interaction boundaries. The one actual packaged run rendered this session's real `docs/design/graph-agent-locations.md` event on the cockpit component and docs directory, then opened the exact conversation while retaining a deliberately dirty README buffer and graph cameras. It recorded zero renderer errors and owned cleanup, but not a green scenario: ordinary quit was vetoed by the dirty buffer. The driver now undoes only its own edit before close and requires a visible unobscured native pointer hit. Those corrections have not had a second GUI run because the assignment allowed at most one. ROOT receives this explicit boundary, not a clean-close or native-pointer overclaim.

## Context and Orientation

`app/renderer/repository/AgentSprites.tsx` currently paints mock robots. `GraphPane.tsx` handles repository/services, `repository/BuildGraphPane.tsx` handles Bazel targets, and `plans/ProjectionCanvas.tsx` paints component graphs. `App.tsx` already owns the registered observer and exact conversation-selection callback. New `graph-agents` renderer helpers will consume those observations only; the core and wire schema stay unchanged.

## Plan of Work

First implement pure observation/path and membership helpers plus accessible robot buttons. Add a shared context around the existing workspace, with small node outlets and an Agents visibility switch. Component and service mappings must use explicit existing sources and reject unavailable or different-workspace inputs. Add direct tests for negative worktree/path boundaries, lifecycle, multiplicity, click and key isolation, stable graph arrays/camera and selection. Reuse the owned virtual desktop harness for one real registered transcript display without messages or model calls.

## Concrete Steps

In `/home/tedks/Projects/swarm-ide/live-graph-agents`, use `nix develop --command bazel test --jobs=3 //tools/live-sprites:checks`, then `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Test scripts are Bazel-owned and run the relevant Vitest files and both TypeScript boundaries. Add the owned GUI target in that package after the direct behavior is stable.

Actual final direct gate: `nix develop --command bazel --output_base=/tmp/swarm-ide-live-sprites.UQXd9n/bazel test --jobs=3 //tools/live-sprites:checks` passed in 16.0 seconds. The second Vitest invocation intentionally selects only the new startup case (seven unrelated workspace cases unselected), not a full navigation-suite claim. Desktop bundle passed. The single `//tools/live-sprites:smoke` execution and original negative close result remain under the step's `gui/` directory.

## Validation and Acceptance

Tests must show that another worktree's same path never places a sprite, unknown paths remain absent, stale and terminal states do not animate, two agents independently open their conversations, and sprite events do not select the underlying node. Changing activity must preserve positions, edges, camera and selected nodes. The owned GUI should display a real registered agent's observed file event and click its conversation while preserving an editor buffer. Record any unsupported path honestly rather than broadening the test.

## Idempotence and Recovery

No model calls, messages, registry writes, user project edits or shared preview changes. Preserve all work in this branch, push granular commits and let ROOT perform normal merge/adoption. GUI resources must be owned and cleaned; branch and evidence remain recoverable.

## Artifacts and Notes

Concise seams, verification and final recap live in `/tmp/swarm-ide-live-sprites.UQXd9n`. Ditz issue is `swarm-live-graph-agents`.

## Interfaces and Dependencies

Use existing React, ReactFlow, `ExternalDetail`, `AgentExecutionState`, `BuildLinkSnapshot` and plan/service mappings. The observation helper returns stable agent identity, canonical relative path, latest action and lifecycle. The overlay accepts explicit membership paths and invokes App's existing conversation callback; it neither selects graph nodes nor modifies clients.
