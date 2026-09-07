# Make registered agent forks visibly connected

This living ExecPlan follows `.planning/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

The External sessions rail should look like an actual family tree: solid lines connect a registered parent to its children, with independent roots and readable names even at deep levels. Selecting a session still reads its existing conversation; launching or handing off remains a separate explicit action.

## Progress

- [x] (2026-09-07 22:58Z) Read assignment, repository instructions and existing observer UI/model/proof; pushed plan and opened draft PR65.
- [x] (2026-09-07 23:00Z) Added connector geometry and mounted regressions: baseline 4 failed / 32 passed.
- [x] (2026-09-07 23:02Z) Implemented solid connectors and neutral observer wording; observer suite36 passed.
- [x] (2026-09-07 23:06Z) Quality1663 tests/120 files and observer suite passed; packaged geometry/native-Enter/conversation/handoff/source-retention proof passed on owned :141/55221 with cleanup1. Native full and two test-only delta reviews CLEAN.
- [x] (2026-09-07 23:10Z) PR65 marked ready; native/local/owned proof complete and GUI/Bazel released. Final documentation pushed and Ditz synced for ROOT merge/closure.

## Surprises & Discoveries

The current rail preserves numerical depth through all 64 registered sessions but caps visual indentation at eight levels. Existing packaged observer proof already uses an owned synthetic registry and verifies read-only conversation, checked tmux handoff and source/camera retention.

The initial packaged geometry proof passed, but its screenshot only exposed the first row in the small sidebar. Ordinary Directory/Tasks folding now exposes the tree without substituted CSS. Adding native Enter initially omitted Electron's `char` event; that driver-only execution timed out with zero renderer errors and cleanup1. Matching the existing repository native-input sequence (focus window, focus button, keyDown/char/keyUp) passed with an asserted trusted click. This is not evidence of a production keyboard bug or its repair.

## Decision Log

Use a flat depth-first sequence with explicit ancestor continuation flags and child/last-sibling metadata. CSS draws one-row line segments from those facts rather than measuring live DOM coordinates. This keeps lines correct when labels wrap and avoids layout observers. Use horizontal overflow and uncapped depth rather than falsely flattening deep ancestry. Date: 2026-09-07, H2.

Only `registered-parent` relationships whose parent is present may connect. Existing unknown/cyclic ancestry is not promoted to a relationship; unreachable malformed cycles remain disconnected. No registry discovery or process behavior changes. Date: 2026-09-07, H2.

## Outcomes & Retrospective

Solid trunks and elbows now reflect actual registered-parent relationships, including continuing trunks across a sibling's descendants. Distinct roots and unavailable ancestry remain unconnected; labels retain their native buttons and scroll horizontally at deep levels. Unit coverage includes all64 levels; actual packaged proof covers fourteen synthetic registrations with an eight-level chain, sibling branch, second root, unknown parent and cycle. It preserves source/cameras, read-only conversation, explicit checked tmux handoff and owned external process survival at app close. Quality and native review are clean. This remains a presentation slice, not managed execution or live telemetry; ROOT owns final merge/adoption.

## Context and Orientation

`app/renderer/external-agents/ExternalAgents.tsx` has `lineageRows`, `ExternalAgentRail` and `ExternalAgentInformation`. The typed `ExternalAgentSummary` in `protocol/external-agents.ts` gives a session identity, optional parent and validated ancestry classification. `external-agents.css` styles only the observer surface. `tests/external-agents-ui.test.tsx` covers observation, selection, handoff and lifecycle. `tools/demo-agents` is an existing Bazel-owned packaged proof using explicitly synthetic session files and a private virtual display; no real agent is launched.

## Plan of Work

First extend the row model with real parent connection, whether a later sibling requires a continuing trunk, and whether children extend a node downward. Add tests for branches, multiple roots, deep levels, absent/cyclic ancestry and stable native selection. Then replace arrows with decorative solid CSS segments behind readable buttons; retain the existing list and accessible button labels. Update the information sentence so the observer does not claim other execution profiles are unavailable. Finally strengthen the owned observer proof with connector geometry assertions and a labelled synthetic screenshot, without changing its authority or retention checks.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/agent-lineage-connectors` on `feature/agent-lineage-connectors`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //tools/demo-agents:unit --jobs=3`, then `nix develop --command bazel test //:quality --jobs=3`. Build through `nix develop --command bazel build //:desktop-bundle --jobs=3`. Run the existing owned observer proof through `nix develop --command bazel run //tools/demo-agents:smoke --jobs=3`, setting `SWARM_VIRTUAL_DISPLAY=:141` and `SWARM_VIRTUAL_DESKTOP_PORT=55221` after checking availability. Keep evidence in the assigned operational step directory. Native council reviews the pushed diff to a clean fixpoint; ROOT handles normal merge/adoption after handoff.

## Validation and Acceptance

The new model tests must distinguish a continuing sibling trunk from a last-child elbow, preserve all 64 levels, and never connect unknown or cyclic ancestry. Mounted tests keep focused buttons mounted through observation updates and verify selection only requests a read. The packaged proof must show solid connectors in an actual Electron window on the owned virtual desktop, preserve source/camera state, keep private synthetic input excluded and close with owned cleanup. Synthetic session evidence must remain labelled; no production telemetry or model turn is claimed.

## Idempotence and Recovery

All source edits stay in the feature worktree. GUI proof owns its private profile, registry, tmux socket, display and loopback port and cleans only those processes. Preserve raw failed evidence if a check fails; correct a concrete cause before retrying. Keep branch/worktree and pushed commits for ROOT review. Do not touch managed55176 or physical DISPLAY0.

## Artifacts and Notes

Operational handoff: `/tmp/swarm-ide-demo-controls.q2i33c/lineage-lines/seam.md` and `verification.md`. Ditz id: `agent-lineage-connectors-20260907`.

PR65 executable358ddf5 (production45f3463). Final actual proof: `/tmp/swarm-ide-demo-controls.q2i33c/lineage-lines/packaged-native/run.11XRNQ/`, including `lineage-worklog.png`, `lineage-independent-roots.png`, `connector-geometry.json`, `proof.json`, and `postclose.json`. Scenario1.120s, total2.039s, acceptance1.054s, zero renderer errors/model turns, cleanup1. Quality45.5s and packaged bundle4.52s. Hosted CI intentionally ignored; no peer result or real provider execution claimed.

## Interfaces and Dependencies

No new dependency or protocol capability. Extend only the internal lineage row presentation type. Keep `ExternalAgentRail` and `ExternalAgentInformation` public props and existing client behavior unchanged.

Initial plan records the narrow presentation boundary and proof strategy before editing production code.

2026-09-07 completion update records actual checks, visual framing and test-driver correction without attributing a historical production cause.
