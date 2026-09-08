# Put real agent activity on graph nodes

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator looking at a repository, build target, service or component should see which registered agents most recently touched its source and click the agent to open its conversation. Updates must not move graph nodes or mix identical filenames across worktrees.

## Progress

- [x] (2026-09-08) Inspected existing observations and graph consumers; dependencies materialized.
- [ ] Add exact-worktree observation and membership mapping, independent clickable overlay.
- [ ] Connect repository, build, service and component consumers without new polling.
- [ ] Focused local tests/types, native review and one owned GUI proof.
- [ ] Update living design, push ready PR and Ditz accomplishment handoff.

## Surprises & Discoveries

Registered `ExternalDetail.entries` carry typed `path`, `cwd`, event IDs and timestamps; each session has a checked canonical `worktree`. Shared lifecycle distinguishes working, waiting, failed, completed and unknown. Native `TrustedSnapshot.activities` deliberately strips file paths and retains only generic summaries. Neither a task attachment nor natural-language output is a reliable current location, so native runs without a structured location remain in the list. This increment adds no telemetry or parser speculation.

## Decision Log

Use the existing registered fleet and selected detail, preferring newer checked observations. Gate placement on exact selected canonical root and safe path resolution. Retain the last file event when a later event is not file-related, but label it last touched, not currently being edited. Stale/paused/unavailable observations cannot animate as working. Terminal lifecycle never regresses to working because a file was touched.

Use a React context overlay inside graph nodes so transcript changes do not alter node arrays, edge arrays, layout or camera dependencies. Graph membership remains domain-specific: nearest visible directory or file, explicit Bazel file input, authored component source path, or service navigation mapping. No inferred dependency walks or source ownership from proximity.

## Outcomes & Retrospective

Implementation and proof pending. Native runs whose observations contain no file location are deliberately unplaced, not assigned guessed nodes.

## Context and Orientation

`app/renderer/repository/AgentSprites.tsx` currently paints mock robots. `GraphPane.tsx` handles repository/services, `repository/BuildGraphPane.tsx` handles Bazel targets, and `plans/ProjectionCanvas.tsx` paints component graphs. `App.tsx` already owns the registered observer and exact conversation-selection callback. New `graph-agents` renderer helpers will consume those observations only; the core and wire schema stay unchanged.

## Plan of Work

First implement pure observation/path and membership helpers plus accessible robot buttons. Add a shared context around the existing workspace, with small node outlets and an Agents visibility switch. Component and service mappings must use explicit existing sources and reject unavailable or different-workspace inputs. Add direct tests for negative worktree/path boundaries, lifecycle, multiplicity, click and key isolation, stable graph arrays/camera and selection. Reuse the owned virtual desktop harness for one real registered transcript display without messages or model calls.

## Concrete Steps

In `/home/tedks/Projects/swarm-ide/live-graph-agents`, use `nix develop --command bazel test --jobs=3 //tools/live-sprites:checks`, then `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Test scripts are Bazel-owned and run the relevant Vitest files and both TypeScript boundaries. Add the owned GUI target in that package after the direct behavior is stable.

## Validation and Acceptance

Tests must show that another worktree's same path never places a sprite, unknown paths remain absent, stale and terminal states do not animate, two agents independently open their conversations, and sprite events do not select the underlying node. Changing activity must preserve positions, edges, camera and selected nodes. The owned GUI should display a real registered agent's observed file event and click its conversation while preserving an editor buffer. Record any unsupported path honestly rather than broadening the test.

## Idempotence and Recovery

No model calls, messages, registry writes, user project edits or shared preview changes. Preserve all work in this branch, push granular commits and let ROOT perform normal merge/adoption. GUI resources must be owned and cleaned; branch and evidence remain recoverable.

## Artifacts and Notes

Concise seams, verification and final recap live in `/tmp/swarm-ide-live-sprites.UQXd9n`. Ditz issue is `swarm-live-graph-agents`.

## Interfaces and Dependencies

Use existing React, ReactFlow, `ExternalDetail`, `AgentExecutionState`, `BuildLinkSnapshot` and plan/service mappings. The observation helper returns stable agent identity, canonical relative path, latest action and lifecycle. The overlay accepts explicit membership paths and invokes App's existing conversation callback; it neither selects graph nodes nor modifies clients.
