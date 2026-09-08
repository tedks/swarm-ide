# Live, retained observation of registered agents

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Selecting a registered external coding session should show newly recorded work without repeated Refresh clicks. The app reads an explicitly supplied local registry and bounded JSONL transcript tails. Automatic observation is not execution, a generated logical summary, or evidence that reported changes actually landed. The source editor, draft, selection and graph cameras stay where the operator put them.

## Progress

- [x] (2026-09-08 00:38Z) Read the existing observer, contracts, instructions and ROOT assignment.
- [ ] Add serialized retained refresh, stale-result fences and hidden/disposed lifecycle tests.
- [ ] Add compact observed workstream in Activity, separate from recorded logical summaries.
- [ ] Run focused local tests, quality/build and one owned virtual packaged proof; native review to convergence.
- [ ] Push ready PR and synchronize Ditz for ROOT landing.

## Surprises & Discoveries

The existing hook clears detail on every Refresh and permits parallel manual reads. Transcript entry identifiers contain tail offsets, so appending or deduplicating successive tails by those identifiers is not correct. The renderer bridge has no request cancellation primitive; stopping observation means no new requests and discarding in-flight completion, not falsely claiming cancellation of the core's bounded read.

## Decision Log

- Decision: Use one serialized request lane and one bounded latest pending intention, with a single scheduled timer. Replace each validated bounded tail atomically and retain it while refreshing. Rationale: prevents overlap, flicker, duplicate entries and unbounded queueing. Date/author: 2026-09-08, E3.
- Decision: Refresh registry at roughly three seconds and selected detail at roughly one second, only while visible and core-ready. In-flight work is fenced by lifecycle/selection identity. Rationale: immediate usefulness without a new event platform or core/protocol changes. Date/author: 2026-09-08, E3.

## Outcomes & Retrospective

Implementation and verification pending. ROOT, not this worker, owns normal merge and managed-preview adoption.

## Context and Orientation

`app/renderer/external-agents/client.ts` wraps typed `externalAgents.snapshot`, `.read` and `.handoff` bridge requests. `protocol/external-agents.ts` validates at most 64 registrations and a 120-entry/256KiB tail. `ExternalAgents.tsx` owns the ancestry rail and detail panel; peer S3 owns its steering controls. New `ObservedActivity.tsx` is an independent compact activity instrument mounted in `App.tsx`. All filesystem/process capabilities remain in the existing privileged core.

## Plan of Work

First replace overlapping manual hook operations with a serialized observer that preserves snapshot/detail during ordinary refresh, invalidates stale completion on selection/core/visibility changes, and schedules bounded automatic reads. Keep explicit handoff independent and never replay it. Then mount a separately labelled selected-session observed workstream in existing Activity. Add lifecycle/retention tests and a packaged proof using an explicitly owned synthetic rollout that is appended while the real app is running.

## Concrete Steps

Use `/home/tedks/Projects/swarm-ide/live-external-activity` on `feature/live-external-activity`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //tools/live-observers:unit --jobs=3`, `nix develop --command bazel test //tools:quality --jobs=3`, and the new owned virtual target under `//tools/live-observers`. Build with `nix develop --command bazel build //:desktop-bundle --jobs=3`. Do not run language-native tests or automate a physical/forwarded desktop.

## Validation and Acceptance

Hold a selected read, request another selection, and prove only one bridge request runs and the old response cannot publish. Advance fake time to prove roughly one-second detail and three-second registry freshness without overlap. Hide or unmount and prove timers stop, late responses are ignored, and show/recovery refreshes correctly. Fail a background read and preserve previous visible evidence with an honest notice and revoked handoff. Change transcript tail offsets and prove replacement, not accumulation. In the owned virtual packaged app, append a labelled synthetic assistant/tool event and observe it appear without clicking Refresh, while retaining unrelated work and no renderer exceptions.

## Idempotence and Recovery

No production registry or transcripts are mutated. Test fixtures and virtual processes are owned and cleaned by the harness. Ditz uses deterministic issue `live-external-activity-20260907`. No master/shared preview changes, credential access, product model requests or automatic handoff are authorized. A failed request may be retried as a read on the next bounded interval; explicit handoff is never automatically retried.

## Artifacts and Notes

The concise milestone and final recap live in `/tmp/swarm-ide-real-swarms.Djy75P/live-observers/`. New tests and owned virtual evidence must distinguish controlled transcript generation from observation of actual implementation agents.

## Interfaces and Dependencies

Preserve `useExternalAgents(bridge, ready, generation)` compatibility and add optional visible control. Preserve returned `snapshot`, `detail`, `selected`, `busy`, `notice`, `read`, `refresh`, `handoff`; optional `observing`/`refreshing` distinguish retained background refresh from explicit busy operations. No protocol/core edits or new packages are needed.

Revision note: initial bounded implementation plan, written before source changes.
