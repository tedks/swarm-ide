# Prove deliberate task refresh and immutable admitted history

This living ExecPlan follows `.planning/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as work proceeds.

## Purpose / Big Picture


A person can attach an explicitly chosen Ditz task to a fixed-source draft, prepare its exact disk/metadata context, and deliberately replace that attachment after metadata advances. Refresh alone must not rewrite the draft. Separately, the test-only deterministic rehearsal can admit that same real context and retain its original task revision through history/recovery, without any model or external agent. Production launch remains unavailable.

## Progress


- [x] (2026-09-07 17:51Z) Verified designated clean `feature/task-draft-integration` at reviewed PR50 normal `e8ec0f953071cec9bfeed7555e120aedc4c108dc`; consumed exact compacted ROOT-fork task and accepted design/scope.
- [x] (2026-09-07 17:53Z) Created/started Ditz `repo-task-draft-integration-d6`, commented open parent `repo-task-draft-provenance`, synced; frozen dependency materialization passed without upgrades.
- [x] (2026-09-07 17:57Z) New worker-composition assertion RED with1 failure/1454 passing. Exact real Tasks composition and archive-local YAML then added. Actual production package metadata-change/re-attach/reprepare at100/150 PASS16.117s, errors0/cleanup1; ordinary existing assertions retained. No deterministic admitted proof claimed yet.
- [x] (2026-09-07 18:18Z) Separate task-bearing deterministic packaged proof passed23.911s/cleanup1/errors0, including actual UI Prepare/Launch, real Tasks/resolver, metadata advance, renderer reload, two core generations, retained81-record counts and original task materialization visibly inspected at100/150. Quality1462/104 passed. Exact transcript-content comparison was subsequently strengthened after review below.
- [x] (2026-09-07 18:32Z) Native review found same-size record text/timestamp changes escaped the new verifier. Precise2RED/1462PASS precedes bounded complete pagination and exact transcript comparison after renderer/core recovery and shutdown; targeted1470/104 then passed. Native fix-delta CLEAN; Google convergence and final full checkpoint pending at this written candidate. Sonnet120s timed out without a review, explicitly unfilled.
- [ ] Review to clean fixpoint, run one frozen integrated build/full local suite, preserve raw evidence and normally merge only on ROOT-cleared base.
- [ ] Close/sync bounded Ditz issue after actual merge; parent closes only with complete accepted coverage.

## Surprises & Discoveries


The existing rehearsal service already uses the production task resolver, but its worker does not compose the real Tasks provider. ROOT preapproved that exact test-only composition. The ordinary rehearsal has four fixed close/drain counts; the new task journey must be separate, not renumber them. Existing production acceptance already proves Attach/Prepare/Remove and disk/task hashes, so the increment extends that evidence.

The first new driver used Enter on the task-row control, which has deliberate document-opening semantics, and failed waiting for source. The next iteration used exactly one attested visible native pointer activation but recorded retention before the preceding Reveal had finished directory/cursor reconciliation. The final driver explicitly waits for the requested source line, observed directory and settled initial camera before creating its retention baseline. Those are new-driver failures, not an attribution of previous historical GUI failures. Both failed runs and cleanup records remain in the operational step directory.

The first complete task-bearing recovery journey failed its new postclose whole-run comparison: existing `AgentService.shutdown()` calls `uncertain(run)` for loaded history, and even settled history receives a monotonic `updatedAt`. A focused verifier regression then produced2RED/1459PASS: legitimate shutdown timestamp change was rejected and transcript-count drift was undetected. The corrected new verifier permits only that bounded timestamp change, retains exact equality of all other run/context fields, checks admission receipt, contiguous record IDs/count/bytes and private bounded storage. All1462 tests subsequently passed. The pre-existing ordinary close verifier and its assertions were not edited.

Native council then found a genuine additional evidence gap: counts and total bytes cannot establish record-content immutability. Two focused same-size text/timestamp mutations were accepted before correction (2RED/1462PASS). The corrected task-only driver captures the complete bounded transcript via real `agent.read` pagination and compares all records/timestamps after both recovery boundaries; postclose verification checks its independent original hash. Missing/nonprogressing pages, gaps, changed run observations and bounds fail closed. All1470 tests passed after this correction; this is a new verifier repair, not historical-cause evidence.

## Decision Log


Decision (2026-09-07, D6): use one reviewed base and one vertical owner. Reuse ordinary task acceptance and its disposable CLI-authoring helper, add a separate compiled task-rehearsal entry and proof, and preserve ordinary close verification unchanged. No production provider, permissions, storage or dependency changes are planned.

Decision (2026-09-07, D6): unrelated task edits keep the attached issue blob/title/description stable, but advance the full metadata commit. Canonical task bytes include that commit and therefore change along with context hashes. An old admitted context is immutable evidence, not current task observation.

## Outcomes & Retrospective


The remaining vertical is implemented in test-only integration tools using the already shipped UI/core. Actual production evidence shows four explicit Prepare requests, zero launch/steer/cancel, stable dirty source/cursor/cameras and exact full-pin replacement. Separate deterministic evidence shows one Prepare and one Launch, original task materialization unchanged after a real secondary-task CLI edit, clean renderer reload and actual owned core loss/recovery. The final recovered core has zero responder starts and drains normally; the original completed core process is gone. This is not a live-provider or external-agent-process proof.

Review-corrected targeted quality is1470 tests/104 files. Earlier production journey16.117s and task rehearsal23.911s both had errors0/cleanup1; they precede the new exact-transcript correction and are not its GUI proof. Google fix-delta convergence and one final frozen whole-tree build/test remain required at this written candidate. Final exact-head/merge/tree/full-log attribution is recorded in the PR and `/tmp/swarm-ide-task-journey-d6.Y4wW6r/landing-verification.md`; prior baseline or targeted evidence must not be represented as that future execution. The historical90-second topology timeout remains open and unexplained; its narrow earlier disposition waives no new failure. Post-run receipts will update completion without repeating full suites for status-only documentation.

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

### Exact adversarial coverage reused


`tests/agent-task-context.test.ts` covers canonical materialization/revalidation, hostile world/repository/returned-reference/reference-only targets, combined escaped envelope overflow, held Prepare/revalidate disposal, final metadata check after source observations, repeated/reentrant disposal, clock reversal/expiry and one shared30-second deadline. Its real resolver tests cover exact CLI data with no linked-file reads/writes, changed commit with unchanged issue blob, missing IDs/ref and wrong blob, actual malformed/oversized Git blobs, controlled movement after parsing, cancellation of a real Git child and awaited YAML-worker termination. D6's new CLI helper adds a genuine edit to the unrelated task instead of only an identical-tree synthetic commit.

`tests/task-reader-git.test.ts` independently covers corrupted object bytes, missing promised objects with no lazy fetch, special/nested metadata, issue/object bounds and hostile-config FIFO reap. `tests/task-metadata.test.ts` covers invalid UTF8, unsupported literal references, actual YAML schema/AST/byte/depth limits and worker disposal. These synthetic negative tests are not historical causality claims.

`tests/core-supervisor-agent-task.test.ts` covers exact40-second task Prepare versus ordinary5-second/Tasks12-second deadlines, loss/restart and ignored late Prepare, plus real late admitted/rejected Launch outcomes after held CLI metadata revalidation. Launch remains unknown at its original5-second limit; absence of a receipt is not turned into certain rejection.

`tests/agent-task-draft.test.tsx` covers fixed source independent of task/current navigation, exact Append/Replace/Cancel/Remove/no-op/new-revision semantics, proposal generations, HMR/disconnect, held Launch acknowledgement retirement and late Prepare invalidation. `tests/task-attachment-eligibility.test.ts` proves current full-pin eligibility; `tests/task-client.test.ts` covers old task/revision replies, independent result streams, ref checks, explicit refresh, retained stale data and core-generation authority.

`tests/agent-task-contract.test.ts` covers exact Unicode/escaping/canonical fields,16KiB envelope and max+one,128KiB whole context, browser-safe execution, full-pin response correlation and recomputed-hash smuggling. `tests/agent-task-store.test.ts` proves strict V1/V2 mixed history, no eager rewrite, normal next-write preservation and old receipt acknowledgement without revalidation/replay. `tests/agent-rehearsal-service.test.ts` proves admitted task history/deduplication despite changed/missing metadata and held Prepare/Launch shutdown ownership. Those tests complement, rather than replace, the new actual packaged task-bearing history/recovery journey.

The final whole-tree checkpoint also runs existing actual two-repository navigation/Context/backlink evidence and unchanged ordinary four-run close/drain proof. The new task fixture must not be labelled the user's actual repo or live agent. New `task-journey-boundary` tests prove CLI secondary-only blob changes, real reader/resolver composition and observation-only bounded transport; `task-rehearsal-close` tests pin legitimate timestamp behavior while rejecting context/receipt/time/record drift without repairing history.

## Idempotence and Recovery


Each acceptance creates its own private fixture/profile and ownership record. The owned harness cleans only that runtime; evidence remains. Do not touch master, shared integration, human canvas55175 or their buffers. Never retry unchanged failures to green. Worktree/branch/session and raw logs remain recoverable. No source/metadata mutation outside owned fixtures except Ditz CLI tracking this work.

## Artifacts and Notes


Operational step receipts, concise `seam.md`, raw gate logs, screenshots, review results and final merge/tree attribution live in `/tmp/swarm-ide-task-journey-d6.Y4wW6r`. `consumed.md` records exact ancestry/model/task verification. First production evidence is `production-first/run.FDV1Va`; task rehearsal with visibly scrolled original-revision label is `rehearsal-visible/run.A6LFLC`. Final evidence is archived with SHA256 and exact frozen source tree. Hosted CI is ignored, not described as green.

To rerun the owned demonstration explicitly, from this worktree run `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel run //tools:desktop-task-rehearsal-smoke --jobs=3`. It opens only its disposable virtual display, writes a fresh evidence directory and cleans its runtime. It is not a human app adoption command. The existing deliberate human test-only launcher remains `nix develop --command bazel run //tools:agent-rehearsal -- --interactive-desktop --workspace /absolute/repo-containing-checkout-world`; it opens the explicitly selected desktop and retains a fresh private profile, so do not run it automatically. Production `//:dev` stays unavailable for provider launch.

## Interfaces and Dependencies


Reuse `createDitzTaskProvider`, `createAgentTaskResolver`, the typed bridge and strict V1/V2 context/store formats. No new public command, environment-selected provider, dependencies or persistence format. Test-only entry/driver composition and minimal Bazel data wiring are preapproved; any additional production correction requires an exact reproduction and ownership request.

Revision (2026-09-07): initial bounded D6 execution plan; records reviewed baseline, test-only ownership and final remaining vertical rather than repeating completed D4/D5 implementation.
