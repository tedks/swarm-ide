# Generate a useful design from an ordinary repository

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

When a repository has no `.swarm/plans.json`, its Components view offers Generate component plan. One deliberate click starts a normal visible Codex agent in that exact worktree, using an editable saved prompt and default model gpt-5.6-sol with xhigh reasoning. The agent writes ordinary design documents and the existing plan index, which the existing reader validates and displays. Existing plans, including malformed plans, are not overwritten by this action.

## Progress

- [x] (2026-09-08) Read instructions, inspect current plan reader and agent owner, start `swarm-generate-component-plan`.
- [x] (2026-09-08) Publish direct-start requirements; draft PR133 now stacks on PR132.
- [x] (2026-09-08) Saved generation settings, absence protection, prompt and empty-view action.
- [x] (2026-09-08) Normally join pushed c192151, add explicit effort forwarding and selected-registration recovery; focused checks and both typechecks pass.
- [x] (2026-09-08) Native convergence clean after retained identity, stale callback, nested boundary and failed-process cleanup corrections.
- [x] (2026-09-08) Controlled packaged GUI passed3.203s/cleanup1/zero renderer errors; single real run produced three useful docs/nodes but was stopped at300s during validation, with originals unchanged and confirmed cleanup.
- [x] (2026-09-08) Joined final reviewed PR132 a5ca4fbe, conflict-free. Generation123 and New-agent206 focused cases pass with both types. Living-design mapping checks pass; its separate camera case failed (90 pass/1 fail), preserved as a noncritical follow-up.
- [ ] Final accomplishment notes, push, cleanup and handoff.

## Context and Orientation

`protocol/plans.ts` validates the version-1 forest: parent/child components, design docs, explicit interfaces and actual build mappings. `core/plans.ts` reads `.swarm/plans.json`. `app/renderer/plans/navigation.ts` shares one plan read/selection across `DesignWorkspace.tsx` and the cockpit. `app/renderer/agents/use-trusted-fleet.ts` and `core/agents/trusted-local.ts` own normal live conversations, approvals and Stop. A concurrent New agent owner is adding direct start with correct selected-worktree routing; consume its reviewed commit rather than manufacture a source attachment or a second process owner.

## Assumptions and Failure Modes

The user trusts the selected local project. Generation is explicit write authority limited in its prompt to design files, not permission to silently change application behavior. An unreadable or malformed index is not absence. Recheck actual absence at admission; instructions tell the agent to check again before writing, preserve existing docs and publish the index last. Failure or cancellation may leave useful partial files; retain them and show an error rather than claim success. A workspace change must revoke stale UI actions and must not redirect an admitted run. Duplicate clicks must not launch duplicate agents. No startup model calls, automatic retries, credential reads or global config changes.

## Plan of Work

First publish the needed text/model/effort/worktree direct-start fields to the New agent owner. Add a browser-safe generation configuration and default prompt describing the actual index schema, meaningful hierarchy and verified source/build connections. Persist editable configuration using the existing local profile settings pattern. Add an explicit missing-index signal from the core reader so the empty Components view can distinguish absence from failure. Connect its action to the shared live conversation owner; refresh the normal plan reader after the run reaches a terminal state, and make partial/malformed output visible without overwriting. Update `docs/design/planning.md` and the matching graph source/build mappings.

## Milestones

The first milestone is an inspectable prompt/settings form and correctly guarded button, independently testable with controlled callbacks. The second is the shared real agent launch and result observation; the user sees progress, approvals and Stop in the normal conversation UI. The last milestone is focused tests and one actual generation in an owned disposable Git repository, separately attributing controlled UI wiring and real model output.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/component-plan-generation`, materialize with `nix develop --command pnpm install --frozen-lockfile` if needed. Run the new `nix develop --command bazel test --jobs=3 //tools/component-plan:checks` target for focused tests and both TypeScript boundaries. Build the existing desktop package through Bazel for owned virtual-X11 verification. Commit small increments, push feature/generate-component-plan, open a draft PR, and use normal reviewed joins. ROOT performs final merge and app adoption.

## Validation and Acceptance

Tests cover missing versus existing/malformed plan, custom prompt/model/effort persistence, exact selected worktree, double-click suppression, failure/Stop, late workspace changes, and normal validation of generated files. On an owned tiny repository with source and no plan, explicit generation should create docs and a schema-valid index with correct source links. If the requested model cannot run, retain its configured name and report that exact boundary, never substitute a model or label controlled data as generated output.

## Idempotence and Recovery

Reads and settings edits never start agents. Only the explicit action starts a fresh token. Uncertain outcomes remain attached to that token; explicit Check or retry launch reuses it, so core's permanent admission guard prevents a second process if the original was accepted. Existing index files withhold generation. Partial outputs remain inspectable. Failed writers retain exclusion until owned cleanup is confirmed. Stop and disposal stay with the existing normal agent owner. No other worktrees or user project files are edited.

## Interfaces and Dependencies

The launch consumer builds the inspected prompt from the shared browser-safe format and sends `text`, `model`, `effort`, stable token and selected-workspace identity. Core validates the request and protects absence before forwarding to the existing owner. No new provider library. The existing plan reader remains the source of success, not a final assistant message.

## Surprises & Discoveries

The current PLAN_INDEX_UNAVAILABLE diagnosis combines missing and unreadable files; a distinct verified absence signal is necessary before offering generation.

Native review found that failure precedes process cleanup, so failure alone cannot authorize another writer. It also found that generic failed bridge responses cannot distinguish rejected admission from a lost post-admission reply; same-token explicit recovery solves both cases without guessing or replaying. A selected-root runtime cache retained an old registration identity; the narrowly scoped cache refresh now has an S1→S2 recovery regression.

The actual requested-model run created useful docs and the index, then spent the remaining proof window on validation including Bazel. It was deliberately stopped at300s, not marked completed. The default prompt now asks for declaration reads and lightweight validation without starting builds/setup. This corrected prompt has direct/native checks, not a second live-model claim. The earlier real run also left an untracked MODULE.bazel.lock in its owned fixture; original source files and commit/index remained unchanged.

## Decision Log

Use the existing trusted-local owner and request protocol, with the producer-owned direct-start API. Do not treat an arbitrary final message as valid generated design. User policy calls for direct local checks and native review rather than a full legacy/hosted gate.

## Artifacts and Notes

Progress and proof attribution are recorded in `/tmp/swarm-ide-startup-simple.Wz8BqH/component-plan/seam.md` and `verification.md`.

## Outcomes & Retrospective

The explicit button now launches the normal agent in the selected worktree with saved editable settings and gpt-5.6-sol/xhigh defaults. Normal generated-file reading automatically populates the graph; existing plans remain protected, failures/Stop retain files and retries cannot duplicate an admitted run. Packaged controlled proof covers visible agent, graph loading, retained dirty source and closing a completed session. The real single run independently created three grounded docs and components, but did not complete its turn before the proof deadline. Follow-up swarm-plan-generation-finish-check records terminal proof on the lighter prompt. Separate swarm-component-camera-order-check records the existing camera test failure without changing graph behavior or claiming a cause. PR133 stacks on PR132; ROOT owns normal landing/adoption.

Revision note: updated after final producer composition, native convergence and actual proof intake; validated real artifacts, interrupted model turn and controlled GUI completion remain separately attributed.
