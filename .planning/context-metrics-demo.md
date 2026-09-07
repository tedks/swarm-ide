# Context instruments that explain a file's place in the system

This ExecPlan follows `.planning/PLANS.md` and is maintained as implementation proceeds.

## Purpose / Big Picture

Selecting a file should explain its direct and indirect build relationships, show useful latency instruments with honest illustrative provenance, and distinguish declared services from actual deployments. Global working, built and deployed state should remain in Context regardless of the selected artifact. The source editor, task links and focus authorization remain intact.

## Progress

- [x] (2026-09-07) Read assignment, common ownership boundaries and repo instructions; launched the user-requested bounded native brainstorm.
- [x] (2026-09-07 23:10Z) Implement bounded reverse build relationships, illustrative latency, deployment/empty states and Global Context in52ad79b; draftPR69 opened.
- [x] (2026-09-07 23:13Z) Add focused and mounted regressions; native review findings reproduced3RED/49PASS, corrected and converged CLEAN. Normally compose ROOT-reviewed syntax base717485e asd5e33f7, preserving both task request and focus assertions.
- [x] (2026-09-07 23:22Z) Actual owned packaged journey passed on4dc57f2: three real file contexts, native source/draft retention and real Bazel relationships;9.836s scenario, zero renderer errors, cleanup1.
- [x] (2026-09-07 23:25Z) Final proportional local quality1703/122 and focused52/6 passed; native final test-delta review CLEAN. ReadyPR69 pushed; Ditz sync complete for ROOT landing.

## Surprises & Discoveries

The existing Context already has memoized service and build indexes, exact service declaration membership, source receipts and task backlink authority. The build projection exposes rule-to-rule edges and source references but Context currently displays only direct targets. No new provider is needed.

Native review found two new presentation errors: lifecycle-ready could precede a fresh workspace observation, and the combined source card initially hid dirty unknown/conflict messages. Three controlled regressions failed before correction, then passed. The broad first pass also identified two exact legacy request-array expectations that needed to admit only the new nonforced build observation; ROOT authorized those and three obsolete packaged display assertions without relaxing any source safety checks.

The new packaged driver initially lacked pinned Bazel/Java environment inheritance. Later driver iterations revealed unacknowledged native input and measurement during the deliberate cross-directory camera update. The final driver sequences keys and actual cursor acknowledgement, uses hit-tested controls, and settles explicit directory navigation before comparing an unrelated cursor gesture. These are proof-driver corrections, not claims of historical production bugs being fixed. Raw failure logs and representative captures remain in the step records.

## Decision Log

Use the existing bounded query graph, reversed once per observation, then cache per-file target traversal; never run a query per edit. Direct means a ruleInput source reference, indirect means reverse dependency reachability, not exclusive ownership. Keep retained and partial scope explicit.

Use small typed authored latency examples tied to exact declared sample source paths/targets and repository identity, not arbitrary cursor positions or claimed production data. Deployment rows require an explicit deployment association; service declarations alone are not proof.

Move source receipt provenance into Working source details while removing checksum rows and redundant buffer widgets. Unsaved/stale notices stay with source facts. Put Global Context outside the task/external selection branches.

## Outcomes & Retrospective

The visible vertical is implemented and ready in PR69. Local quality passed1703 tests in122 files; focused Context passed52 tests in6 files; actual packaged core/Bazel/three-file proof passed with owned display139/port55219 and cleanup. Native substantive and fix-delta review converged CLEAN; foreign seats were intentionally omitted under the user's Codex-only instruction. Hosted CI was not used. ROOT owns normal merge, Ditz closure and managed preview adoption; the child leaves its branch/worktree/evidence intact.

Latency remains an explicitly authored example. Real latency and file-to-deployment membership are tracked in Ditz `context-observed-latency-deployments`; no declaration is promoted to deployment evidence. The UI consumes the existing shared graph observation and introduces no core provider, deployment scanner or agent execution capability.

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

Operational handoff lives in `/tmp/swarm-ide-demo-controls.q2i33c/context-metrics`, with concise seam and verification files. PR69 owns the change, Ditz `context-metrics-demo-20260907` stays in progress pending ROOT landing. Final actual packaged evidence is `/tmp/swarm-context-proof-complete.0i2uRP/context-metrics/run.DPUs1y/`, including three screenshots and proof.json. No checksum manifest is needed.

## Interfaces and Dependencies

Reuse `ContextSection`, `WorkspaceSnapshot`, `BuildLinkSnapshot` and existing source/task action callbacks. New renderer-local data must not require bridge schema changes or a telemetry scanner. No dependency updates.

Initial plan records the bounded user-visible vertical and explicit ownership boundaries.

Completion update records actual implementation, native findings, corrected driver boundaries and proportional verified outcomes; normal landing remains ROOT-owned.
