# Context instruments that explain a file's place in the system

This ExecPlan follows `.planning/PLANS.md` and is maintained as implementation proceeds.

## Purpose / Big Picture

Selecting a file should explain its direct and indirect build relationships, show useful latency instruments with honest illustrative provenance, and distinguish declared services from actual deployments. Global working, built and deployed state should remain in Context regardless of the selected artifact. The source editor, task links and focus authorization remain intact.

## Progress

- [x] (2026-09-07) Read assignment, common ownership boundaries and repo instructions; launched the user-requested bounded native brainstorm.
- [ ] Implement bounded reverse build relationships, illustrative latency, deployment/empty states and Global Context.
- [ ] Add focused and mounted regressions; perform native review to clean convergence.
- [ ] Run proportional Bazel local gates and an owned virtual two-context journey; push ready PR and sync Ditz for ROOT landing.

## Surprises & Discoveries

The existing Context already has memoized service and build indexes, exact service declaration membership, source receipts and task backlink authority. The build projection exposes rule-to-rule edges and source references but Context currently displays only direct targets. No new provider is needed.

## Decision Log

Use the existing bounded query graph, reversed once per observation, then cache per-file target traversal; never run a query per edit. Direct means a ruleInput source reference, indirect means reverse dependency reachability, not exclusive ownership. Keep retained and partial scope explicit.

Use small typed authored latency examples tied to exact declared sample source paths/targets and repository identity, not arbitrary cursor positions or claimed production data. Deployment rows require an explicit deployment association; service declarations alone are not proof.

Move source receipt provenance into Working source details while removing checksum rows and redundant buffer widgets. Unsaved/stale notices stay with source facts. Put Global Context outside the task/external selection branches.

## Outcomes & Retrospective

Implementation and verification pending.

## Context and Orientation

`app/renderer/context/compose.ts` creates renderer-local section models from validated workspace observations. `ContextPane.tsx` renders them and existing guarded source/task actions. `app/renderer/repository/layers.ts` defines the bounded Bazel observation used by both graph and Context. `App.tsx` memoizes indexes and owns shared attention; edit only Context composition and the global revision strip. T4 owns task-specific detail and R4 owns resource widgets.

## Plan of Work

Add context-local helpers to index reverse dependency links, resolve direct/indirect targets safely through cycles and clip displayed rows while retaining totals. Add a typed latency model and table with explicit units/window and Illustrative label. Simplify existing sections without removing authorization, source receipts or backlink behavior. Add GlobalContext using workspace revision facts. Preserve source/service rows and links. Add unit and mounted tests covering missing/retained/foreign observations, graph cycles, partial bounds, global scope and latency contrasts.

## Concrete Steps

All commands run in `/home/tedks/Projects/swarm-ide/context-metrics-demo`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use `nix develop --command bazel test //:quality --jobs=3` for integrated TypeScript/unit/renderer checks and `nix develop --command bazel build //:desktop-bundle --jobs=3` for packaging. Add an owned Bazel virtual scenario using the existing virtual desktop launcher, suggested display139/port55219 after collision checks.

## Validation and Acceptance

Tests must show exact direct and indirect labels including cycles/deduplication and bounded counts; no labels from another repository or missing observation. Mounted Context must show the Global section independently, a compact empty contrast, explicit illustrative latency units and declared symbol scope, and no old provider/buffer/SHA display. The actual owned virtual journey must select two source contexts and preserve existing source/draft/graph state with no renderer errors. Capture a screenshot, not physical-desktop automation.

## Idempotence and Recovery

No storage migration, global settings or core execution changes. Keep branch and evidence recoverable. ROOT merges and adopts; this child cleans only its own virtual processes and Bazel server. Do not claim a later pass explains a historical failure.

## Artifacts and Notes

Operational handoff lives in `/tmp/swarm-ide-demo-controls.q2i33c/context-metrics`, with concise seam and verification files. PR and Ditz identifiers will be recorded after creation.

## Interfaces and Dependencies

Reuse `ContextSection`, `WorkspaceSnapshot`, `BuildLinkSnapshot` and existing source/task action callbacks. New renderer-local data must not require bridge schema changes or a telemetry scanner. No dependency updates.

Initial plan records the bounded user-visible vertical and explicit ownership boundaries.
