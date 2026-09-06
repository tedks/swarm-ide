# Read pinned Ditz metadata without changing the repository

This living ExecPlan follows `.planning/PLANS.md`. Progress, discoveries, decisions and outcomes are updated as the bounded T1 step proceeds.

## Purpose / Big Picture


This step supplies a real read-only provider behind the existing task contract. Tests can observe complete Ditz metadata at one Git commit, inspect details from that same revision, detect branch changes, and retain the last valid snapshot after malformed input. The application continues using the unavailable provider until T3 explicitly composes this reader with the independently developed task UI. No source content, task writes, agent requests, or model calls belong to this step.

## Progress


- [x] (2026-09-06) Read the approved task design, landed schemas and provider interface; create designated worktree from reviewed `a218277` and materialize frozen dependencies.
- [x] (2026-09-06) State untrusted-input assumptions and publish `createDitzTaskProvider` consumer seam.
- [x] (2026-09-06 08:09Z) Implement bounded Git object reads, isolated YAML validation, cache and observation lifecycle. Draft PR32 opened from first plan commit `4ddc938`.
- [ ] Prove real Git/YAML hostile inputs, correlation, stale/error retention, concurrency and disposal through Bazel-owned tests.
- [ ] Complete local build/all-tests, provider-diverse review to fixpoint, normal reviewed PR landing, Ditz sync and owned cleanup.

## Surprises & Discoveries


The existing task interface already separates observation attempt status from the retained complete snapshot. Wire schemas bound whole serialized results, so validating an individual detail or snapshot alone is insufficient near a byte limit. The provider must validate full result envelopes before publication.

The first executable quality run passed 751 tests and failed two disposable Git fixture checks: Git objects are read-only on disk, and fixture auto-maintenance could race recursive cleanup. The fixture now recreates only its owned fault-injection object and disables auto-maintenance. The next run passed 753 tests; one new stderr-bound fixture assumed a huge fatal diagnostic would be emitted, but Git truncates that diagnostic. Its positive control is being corrected rather than declaring the bound proven.

The reader verifies hashes of selected commit, tree and blob bytes rather than assuming an object filename attests immutable content. Commit/tree size preflight adds a conservative 128KiB structural ceiling. Git still reads local configuration, so a blocking include is killed and reaped under the command deadline. Output/time caps are not an OS memory sandbox for Git pack decompression; Ditz `repo-task-git-memory-limits` records that distinct residual.

## Decision Log


The registered root and installed project Git executable are constructor authority, never renderer input. Git-controlled object bytes, configuration and YAML are untrusted. Git reads must not trigger replacement objects, lazy fetching, network transports, hooks, checkout filters or arbitrary configured programs. Failures produce fixed sanitized diagnostics without metadata contents.

ROOT settled the scan budget at 10 seconds, each Git command at 5 seconds or the remaining budget. T3 alone will extend the outer task-read request timeout to 12 seconds. Other request/agent timing is unchanged and `repo-task-read-deadline` stays open until joined verification.

The main provider owns one complete cache and one in-flight observation. Concurrent requests share bounded work instead of queuing an arbitrary refresh backlog. Cache replacement is atomic after all issue/project data and full envelopes validate. Details never reread a moving ref. Disposal cancels and awaits all owned children before resolving, and no disposed operation may publish.

## Outcomes & Retrospective


Implementation and verification are in progress. This document does not claim integrated task browsing or a production provider change.

## Context and Orientation


`protocol/tasks.ts` defines algorithm-tagged Git identities, strict task summaries/details and request-correlated results. `core/tasks/contracts.ts` defines the provider constructor and snapshot/read/dispose interface. The current unavailable provider and `core/worker-runtime.ts` remain frozen. New `core/tasks/git-reader.ts` reads fixed local Git objects; `metadata.ts` validates project/issues and derives literal dependency diagnostics; `provider.ts` owns observation and cache state. New tests use disposable Git repositories, not the user's metadata branch.

The metadata branch is exactly `refs/heads/ditz-metadata`. At a resolved commit, require regular `.ditz/project.yaml` and immediate `issue-<full-ID>.yaml` blobs. IDs must match filenames. YAML permits one document and unique scalar string keys, not aliases, tags, merge/prototype keys or parse warnings/errors. Validate UTF-8 and byte/depth/node limits before ordinary conversion. Use one terminable parser worker so a timer can actually interrupt pathological parsing.

## Plan of Work


First implement a fixed-argument, bounded-output Git reader that resolves the local metadata ref and reads the exact tree/blob identities. In parallel add syntax-safe YAML parsing with the pinned `yaml` 2.8.1 dependency. Then connect both to `createDitzTaskProvider`, keeping the last complete cache separate from the latest attempt status. Tests demonstrate successful pinned reads, invalid future revision retention, ref advancement, expired detail identity, input ceilings and owned lifetime cleanup. No shared production files change.

## Concrete Steps


Work only in `/home/tedks/Projects/swarm-ide/repo-task-reader`. Use the project environment and Bazel entry points:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //:quality --jobs=3 --nocache_test_results
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results

Open a draft PR after the first coherent committed increment. Review with native OpenAI and foreign Google/Anthropic seats; an unavailable seat is recorded, never substituted. Fix and re-review deltas until CLEAN. Only consume newly merged upstream heads after ROOT's explicit reviewed clearance. User permits failed hosted CI only after all relevant local checks pass; never label hosted failure green.

## Validation and Acceptance


A real disposable Git repository must yield task identities, issue blob IDs and descriptions from exactly one pinned metadata commit. Advancing its branch yields stale retained data until explicit refresh; malformed new data yields an honest failed attempt with the prior revision still readable. Missing metadata is unavailable, not empty. A valid project with no issues is observed empty. Reading a displaced cached revision yields correlated expiration, not newer text.

Tests must reject malformed UTF-8, duplicate/unsafe YAML constructs, unsafe Git tree entries and oversize input/output without silently dropping issues or truncating text. Dependency cycles, missing endpoints and one-sided declarations are diagnostics rather than inferred readiness. Explicit unsupported file paths remain literal data; no source bytes are read. Concurrent observations are bounded; cancellation and disposal leave no owned process, worker, timer or late publication. T3 separately owns real-Ditz-CLI-authored fixtures and actual bridge/UI acceptance.

## Idempotence and Recovery


Readers never mutate refs, metadata or source. Test fixtures are owned disposable directories; cleanup targets only those directories and exact owned processes. Keep the clean pushed worktree and step/evidence files until ROOT retires them. Never update or restart watched master, port 55173, the unrelated port 5173, or the physical desktop. Full GUI tests use the owned virtual harness under the shared lock.

## Artifacts and Notes


The live integration seam is `/tmp/swarm-ide-task-reader-t1.gcYI0r/seam.md`. Sanitized final evidence belongs at `/home/tedks/Projects/swarm-ide/master/artifacts/overnight-wave/task-reader-t1/handoff.md`. Record actual tested revisions, tests, review, hosted CI and cleanup rather than predicted outcomes. Ditz `repo-task-reader-t1` blocks `repo-task-surface`; close only the delivered reader slice.

## Interfaces and Dependencies


Export `createDitzTaskProvider: CreateTaskProvider` from `core/tasks/provider.ts`. Its context contains the registered root, world and repository ID. `snapshot({refresh:true})` performs one complete bounded scan; `false` only checks the local ref. `read({metadataCommit,taskId})` reads the retained complete cache. `dispose()` is idempotent and awaits cancellation. Preserve existing protocol shapes and unavailable default. A parser worker packaging requirement, if needed, must be explicit in the T3 handoff rather than hidden behind passing source tests.

The concrete worker program is a fixed string in `core/tasks/metadata-worker.ts`, run once per complete scan and terminated/reaped on every outcome. Its YAML module is resolved relative to the compiled local-core package. Source/development installs include pinned `yaml` 2.8.1; the current esbuild application tar does not package that external module. T3 must explicitly package/bundle the worker or pinned YAML dependency, then verify the actual artifact before enabling this provider. No new standalone worker file is discovered from metadata and no metadata bytes become executable source.

Revision note: initial T1 plan records exact scope, assumptions, proof requirements and consumer seam before implementation.

Revision note: implementation milestone records actual failing fixture checks, hash/structural bounds and the explicit packaging/resource follow-ups before final verification.
