# Open service declarations deliberately without losing work


This living ExecPlan follows `.planning/PLANS.md`. Maintain Progress,
Surprises & Discoveries, Decision Log, and Outcomes & Retrospective.

## Purpose / Big Picture


Clicking a service in the service graph will open its recorded interface
declaration in the existing editor. The repository view reveals that file while
the service camera stays put. The evidence is a built declaration, not proof of
a call expression or an external service implementation. Ambiguous definitions
require a choice; failed or superseded navigation leaves existing work intact.

## Progress


- [x] (2026-09-07) Read Q1 contract, ROOT acceptance, and personally steered UI decisions; confirmed designated clean branch at `8f49e16` and materialized frozen dependencies.
- [ ] Add failing candidate and deliberate-activation regressions.
- [ ] Implement bounded resolver, explicit graph gesture, and chooser.
- [ ] Prove actual packaged declarations and retained-service core recovery.
- [ ] Run full local gates, review to fixpoint, Ditz, normal merge and exact integration.

## Surprises & Discoveries


Q1 records exactly one declaration path per interface, but several provided
interfaces may name different paths or the same path. The existing file Reveal
already revalidates dirty open files through the broker. Its attention/core/open
generation guards need an additional optional publication guard for this consumer.
Q1 service retention and packaged core recovery were previously separate proofs.

## Decision Log


Decision (2026-09-07): Provided declarations define the observed service; required
declarations explicitly naming an external service are all that is known about
that service. No implementation or manifest fallback is permitted. This follows
ROOT's exact interpretation and avoids inventing callsite evidence.

Decision (2026-09-07): Graph activation is a separate callback from graph
inspection. Passive mappings and publications cannot accidentally open files.
Keep an explicit inspection gesture available and reuse the existing Reveal.

## Outcomes & Retrospective


Implementation and verification remain pending. This closes only Q2, not the
broader service/call navigation or Context foundation requirements.

## Context and Orientation


`protocol/context.ts` validates the bounded `serviceContext` snapshot field.
`app/renderer/context/compose.ts` composes facts using independent evidence clocks.
`app/renderer/App.tsx` owns document state and `revealTaskReference`, the explicit
broker-backed file-opening path. `GraphPane.tsx` owns actual ReactFlow gestures.
The local core remains the only filesystem authority. `tools/repository-navigation/`
builds real temporary repositories and verifies the packaged Electron app on an
owned virtual desktop. Existing service graph identities are stable strings,
not labels, preferred paths, or universal artifact nodes.

## Plan of Work


First implement a pure bounded resolver in the renderer Context directory. It
matches repository/world, published built revision and exact graph identity,
then returns deduplicated paths and all provided/required relation labels.
Tests must reject unknown identity and guessed implementation paths.

Next wire only deliberate service/interface activation to the resolver and
existing Reveal. A chooser uses ordinary accessible controls and explicit
Cancel/Escape. Capture attention, navigation, core and publication identity;
new intent or publication invalidates old choices and late activation. No new
provider, request, timer, scan, dependency, layout, or graph remount is introduced.

Finally extend the existing packaged navigation proof, including a built Swarm
service surviving actual core replacement as retained evidence. Run all local
gates at the frozen executable head, obtain substantive provider-diverse review
to a clean fixpoint, and normally merge/push only this reviewed change.

| Gesture / state | Candidates | Result |
| --- | --- | --- |
| Click or keyboard-activate observed service | Exact provided declaration associations | Open one unique path; otherwise chooser. |
| Activate referenced external service | Required declarations explicitly naming it | Label required declaration; implementation unavailable. |
| Activate exact interface | That interface's declaration association | Broker-validated current source. |
| Multiple interfaces share a path | One path with all relation labels | One open, no duplicate read from this gesture. |
| Missing / unsupported / wrong repository or world | None | Explicit unavailable notice; inspection remains. |
| Hover, pan, passive mapping, build or recovery | No activation | No source open. |
| Cancel, newer intent, publication or core replacement | Old selection invalid | No late foreground activation. |
| Retained build or dirty destination | Historical declaration, current-file check | Keep provenance distinct and preserve unsaved bytes/cursor. |

## Concrete Steps


All commands run in `/home/tedks/Projects/swarm-ide/service-source-navigation`.
Use `nix develop --command bazel test --jobs=3 //:quality` for red/green tests and
`nix develop --command bazel build --jobs=3 //...` for all targets. Final suites:

    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test --jobs=3 --nocache_test_results //...

Create/start deterministic Ditz issue `service-source-navigation-q2`; comment the
broader `ui-service-source-navigation` and contextual parents without closing
them. Open an early draft PR, push granular commits, then normal PR merge after
local checks and council. Hosted CI is intentionally ignored under user authority.

## Validation and Acceptance


Pure/mounted tests cover exact identity, deduplication, roles, ambiguity,
unknown/unavailable input, keyboard/cancel, stale choice/result, and dirty source
retention. Real packaged acceptance opens actual declaration bytes through
main/preload/core/Bazel and preserves both repository journeys, task/agent drafts,
logical cursor, service/build graph instances and cameras at 100/150 percent.
An actual Swarm core replacement must retain original service build evidence as
stale, not green with unavailable fingerprint, and allow a new deliberate broker
revalidated definition open without replay. Zero renderer exceptions and owned
cleanup are mandatory. Mounted-only ambiguity evidence, if needed, is explicitly
different from a genuinely built packaged ambiguity case.

## Idempotence and Recovery


No source writes or agent activation belong to navigation. Existing canonical
broker failures preserve buffers. Only owned temporary tests/review work are
cleaned; human canvas55175, old master, unrelated ports and branches stay intact.
Preserve evidence, worktree and session for ROOT intake. Integration starts only
from leased `ac5fb540a458e1ecfecac099db60e8f52991eb37`, consumes the exact reviewed
normal merge, and is pushed with tree equality verified.

## Artifacts and Notes


Step evidence and concise milestone seam live at
`/tmp/swarm-ide-service-source-q2.GkNCX4`. Save logs and proof receipts outside
rewritable Bazel outputs. The final recap distinguishes executable evidence reuse
from a newly executed aggregate tree and records exact hashes and unavailable seats.

## Interfaces and Dependencies


Reuse React, existing `FocusRef`, `WorkspaceSnapshot`, Q1 `ServiceContextObservation`,
and broker-backed Reveal. Add a pure declaration-candidate result with path,
relation labels and publication identity. No protocol/provider/dependency changes.
ROOT owns successors and runtime adoption; production agent policy stays unavailable.
