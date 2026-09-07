# Prove deliberate task refresh and immutable admitted history

This living ExecPlan follows `.planning/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as work proceeds.

## Purpose / Big Picture


A person can attach an explicitly chosen Ditz task to a fixed-source draft, prepare its exact disk/metadata context, and deliberately replace that attachment after metadata advances. Refresh alone must not rewrite the draft. Separately, the test-only deterministic rehearsal can admit that same real context and retain its original task revision through history/recovery, without any model or external agent. Production launch remains unavailable.

## Progress


- [x] (2026-09-07 17:51Z) Verified designated clean `feature/task-draft-integration` at reviewed PR50 normal `e8ec0f953071cec9bfeed7555e120aedc4c108dc`; consumed exact compacted ROOT-fork task and accepted design/scope.
- [x] (2026-09-07 17:53Z) Created/started Ditz `repo-task-draft-integration-d6`, commented open parent `repo-task-draft-provenance`, synced; frozen dependency materialization passed without upgrades.
- [x] (2026-09-07 17:57Z) New worker-composition assertion RED with1 failure/1454 passing. Exact real Tasks composition and archive-local YAML then added. Actual production package metadata-change/re-attach/reprepare at100/150 PASS16.117s, errors0/cleanup1; ordinary existing assertions retained. No deterministic admitted proof claimed yet.
- [ ] Add separate task-bearing deterministic packaged admission/history/recovery proof and exact adversarial coverage map.
- [ ] Review to clean fixpoint, run one frozen integrated build/full local suite, preserve raw evidence and normally merge only on ROOT-cleared base.
- [ ] Close/sync bounded Ditz issue after actual merge; parent closes only with complete accepted coverage.

## Surprises & Discoveries


The existing rehearsal service already uses the production task resolver, but its worker does not compose the real Tasks provider. ROOT preapproved that exact test-only composition. The ordinary rehearsal has four fixed close/drain counts; the new task journey must be separate, not renumber them. Existing production acceptance already proves Attach/Prepare/Remove and disk/task hashes, so the increment extends that evidence.

## Decision Log


Decision (2026-09-07, D6): use one reviewed base and one vertical owner. Reuse ordinary task acceptance and its disposable CLI-authoring helper, add a separate compiled task-rehearsal entry and proof, and preserve ordinary close verification unchanged. No production provider, permissions, storage or dependency changes are planned.

Decision (2026-09-07, D6): unrelated task edits keep the attached issue blob/title/description stable, but advance the full metadata commit. Canonical task bytes include that commit and therefore change along with context hashes. An old admitted context is immutable evidence, not current task observation.

## Outcomes & Retrospective


Implementation and proof are pending. The previous D4/D5 merged gates are baseline evidence, not execution on this new branch. The historical90-second topology timeout remains open and unexplained; its narrow user-authorized disposition does not waive any new failure.

## Context and Orientation


`tools/task-integration/acceptance.cjs` drives ordinary DOM/native inputs through the actual packaged Electron renderer/preload/main/core. `fixture.mjs` creates source and two Ditz CLI-authored tasks in an owned private repository, never the user's metadata. `core/tasks/draft-context.ts` is the real pinned Git/YAML resolver; `core/agents/context.ts` binds canonical task bytes to source/prompt hashes. The renderer keeps a one-slot task reference separate from editable instructions and source focus.

`tools/agent-rehearsal/build.mjs` builds an explicitly separate test artifact. Its `tests/support/agent-rehearsal-service.ts` uses the real context/store/service with an in-process deterministic responder, no executable/network/model. `agent-rehearsal-worker.ts` needs the exact real Tasks provider composition. The new task-only entry/driver uses this same worker and resolver while the existing four-run driver/close assertions remain intact.

## Plan of Work


First extend the CLI fixture with Unicode/quoted literal text and a helper that changes only the unrelated task. Extend the production acceptance's existing preparation oracle to compare each current full pin and retain source, dirty text, logical cursor, instructions and graph instances/cameras across explicit refresh/re-attach/reprepare at normal and compact zoom. Observe actual transport read-only to distinguish user Prepare from background reads and prove no spontaneous agent commands.

Next compose the real Tasks reader in the test worker and a separate fixed task-rehearsal entry in the existing test bundle. Use an owned disposable CLI repository to prepare and deliberately admit one task-bearing deterministic run. Observe unchanged original materialization after metadata advances, renderer reload and actual core recovery. Validate persisted context/receipts against prior read evidence and bounded responder cleanup; preserve ordinary four-run proof unchanged. Map hostile input/lifecycle/legacy/uncertainty requirements to named existing tests rather than rerunning redundant scenarios in a browser.

Finally run independent native OpenAI and foreign Google/Anthropic Sonnet review concurrently, fix Important/Critical findings and converge on fix deltas. Use targeted Bazel checks during editing and one final frozen full checkpoint. Any new failure is retained and blocks landing until an actual bounded correction or ROOT disposition.

## Concrete Steps


All commands run from `/home/tedks/Projects/swarm-ide/task-draft-integration`. Dependencies are already materialized with `nix develop --command pnpm install --frozen-lockfile`. Use `nix develop --command bazel test //:quality --jobs=3 --nocache_test_results` for non-GUI quality. Owned GUI and full suites acquire `/tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` with `flock --close`; use only virtual :90/55174.

The existing production proof command is `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel run //tools/task-integration:smoke --jobs=3`. Add a dedicated task-rehearsal Bazel proof target with the same owned harness. Final frozen commands are `nix develop --command bazel build //... --jobs=3` and locked `nix develop --command bazel test //... --jobs=3 --nocache_test_results`.

## Validation and Acceptance


Production must show the original attachment/preparation untouched by unrelated metadata advancement and list refresh, then explicit accepted replacement and fresh Prepare must display the new full metadata pin/context hash. Independently read the raw Git issue blob, verify object hash and exact CLI title/description/canonical materialization/source/prompt hashes. Every production snapshot still shows zero runs and disabled launch. Both100/150 layouts preserve exact dirty source/cursor/instructions/graph cameras; renderer exceptions fail the proof.

The separately labelled rehearsal must use the real task reader/resolver and ordinary Attach/Prepare/confirmation/Launch, admit exactly one deterministic run, advance metadata and retain original admitted bytes/hash/pin through reload/core/history recovery without replay. No real provider is claimed. Existing ordinary four-run close/drain proof remains unchanged. Adversarial unit/contract coverage must name actual tests and distinguish synthetic faults from historical causality.

## Idempotence and Recovery


Each acceptance creates its own private fixture/profile and ownership record. The owned harness cleans only that runtime; evidence remains. Do not touch master, shared integration, human canvas55175 or their buffers. Never retry unchanged failures to green. Worktree/branch/session and raw logs remain recoverable. No source/metadata mutation outside owned fixtures except Ditz CLI tracking this work.

## Artifacts and Notes


Operational step receipts, concise `seam.md`, raw gate logs, screenshots, review results and final merge/tree attribution live in `/tmp/swarm-ide-task-journey-d6.Y4wW6r`. `consumed.md` records exact ancestry/model/task verification. Final evidence is archived with SHA256 and exact frozen source tree. Hosted CI is ignored, not described as green.

## Interfaces and Dependencies


Reuse `createDitzTaskProvider`, `createAgentTaskResolver`, the typed bridge and strict V1/V2 context/store formats. No new public command, environment-selected provider, dependencies or persistence format. Test-only entry/driver composition and minimal Bazel data wiring are preapproved; any additional production correction requires an exact reproduction and ownership request.

Revision (2026-09-07): initial bounded D6 execution plan; records reviewed baseline, test-only ownership and final remaining vertical rather than repeating completed D4/D5 implementation.
