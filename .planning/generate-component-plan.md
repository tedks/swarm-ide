# Generate a useful design from an ordinary repository

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

When a repository has no `.swarm/plans.json`, its Components view offers Generate component plan. One deliberate click starts a normal visible Codex agent in that exact worktree, using an editable saved prompt and default model gpt-5.6-sol with xhigh reasoning. The agent writes ordinary design documents and the existing plan index, which the existing reader validates and displays. Existing plans, including malformed plans, are not overwritten by this action.

## Progress

- [x] (2026-09-08) Read instructions, inspect current plan reader and agent owner, start `swarm-generate-component-plan`.
- [ ] Publish direct-start requirements and open draft PR.
- [ ] Add saved generation settings, absence protection, prompt and empty-view action.
- [ ] Join reviewed normal start; prove focused behavior and one owned real generation.
- [ ] Native review, design mappings, accomplishment notes, push and handoff.

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

Reads and settings edits never start agents. Only the explicit action starts a fresh token; uncertain outcomes are observed rather than replayed. Existing index files withhold generation. Partial outputs remain inspectable. Stop and disposal stay with the existing normal agent owner. No other worktrees or user project files are edited.

## Interfaces and Dependencies

The launch consumer needs `text`, `model`, `effort`, stable token and selected-workspace identity; the core generates/validates the prompt and protects absence before forwarding to the existing owner. No new provider library. The existing plan reader remains the source of success, not a final assistant message.

## Surprises & Discoveries

The current PLAN_INDEX_UNAVAILABLE diagnosis combines missing and unreadable files; a distinct verified absence signal is necessary before offering generation.

## Decision Log

Use the existing trusted-local owner and request protocol, with the producer-owned direct-start API. Do not treat an arbitrary final message as valid generated design. User policy calls for direct local checks and native review rather than a full legacy/hosted gate.

## Artifacts and Notes

Progress and proof attribution are recorded in `/tmp/swarm-ide-startup-simple.Wz8BqH/component-plan/seam.md` and `verification.md`.

## Outcomes & Retrospective

Implementation not complete. This initial plan records scope and safeguards before code.
