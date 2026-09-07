# Find and open repository files from anywhere

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Ctrl+K can find a filename outside the loaded directory, then explicitly open its real source in the existing document tabs. Merely typing, highlighting or cancelling never navigates. Existing commands and exact Open path remain available. This is filename finding, not content/symbol search, an atomic repository snapshot or new read authority.

## Progress

- [x] (2026-09-07) Read navigation/UI decisions and inspected the typed bridge, directory and file brokers; selected one bounded vertical.
- [x] (2026-09-07) Implement runtime contract, cached core inventory/query and palette keyboard journey; draft PR39 pushed.
- [ ] Prove failure/race/boundary cases and actual packaged two-repository behavior.
- [ ] Run full local gates and provider-diverse review to fixpoint; normal PR/integration merge and push; close Ditz.

## Decision Log

- Decision: capture Git's tracked plus non-ignored untracked names (including dotfiles) using fixed read-only `ls-files --cached --others --exclude-standard -z`, with the existing sanitized Git runner. Tracked names still appear when ignore rules match. Ignore configuration is data; no fetch/hooks/write/filter command runs. Symlinks, gitlinks, nested repositories, special files and unsupported filename bytes are not actionable matches. The names-only stream avoids ambiguous stage-looking untracked names. Rationale: reuse Git's known boundaries rather than recursively walk the repository on every key. Date: 2026-09-07, N2.
- Decision: retain one inventory, at most 8,192 names / 1 MiB names, with 2 MiB total Git output and 2-second Git deadline. Entry/name cap yields explicitly partial captured coverage; Git failure/output deadline yields unavailable (or a retained stale capture with a failure notice). Capture only first query or explicit Refresh. Queries are literal case-insensitive fragments, at most 256 characters; basename exact/prefix then path prefix/basename substring/path substring rank, ordinal full-path ties. Return at most 40 matches, examining at most 160 candidate paths per query with a bounded metadata deadline. Any query validation truncation is separately partial. Date: 2026-09-07, N2.
- Decision: names are advisory candidates; validate parent containment/nested markers and regular-file type before displaying, and always use existing explicit N1 path activation/file broker on Enter. Names can change after validation; open errors preserve prior work. Cache age five seconds or working-world hints marks stale, never triggers automatic rescanning. Core replacement drops client results and provider disposal aborts owned Git work. Date: 2026-09-07, N2.
- Decision: extend the existing packaged navigation proof for both real repositories rather than duplicate Electron/X11 infrastructure. Hosted CI is ignored by explicit user authority. Date: 2026-09-07, N2.

## Surprises & Discoveries

The current palette only activates the first filtered command and exact paths. N1 already provides guarded off-slice activation and safe files, so search should consume that route rather than create another editor/navigation lifecycle. Git output overflow is currently all-or-error; partial entry/name capture is distinguished from transport failure, not disguised as complete.

Initial local quality passed 1,188 tests / 86 files. Actual packaged unfamiliar search passed (including the name cap), but Swarm at 100% zoom exposed a real race: a passive palette-open effect could erase already-typed native input. Initialization now occurs synchronously in the opening action. Native review found that elapsed checks alone do not bound a stalled filesystem await; a hard response deadline and single outstanding metadata chain now prevent accumulation. Node cannot cancel a kernel metadata call: it may remain until it returns or its owned local-core process exits, but disposal rejects waiting queries and starts no additional chain. This is an explicit residual, not a claim of syscall cancellation.

## Context and Orientation

`protocol/schema.ts` validates every renderer/core request and reply. `protocol/repository.ts` defines directory observations. Add the search request/result in a small adjacent module. `core/repository-boundary.ts` runs sanitized bounded read-only Git and rejects nested repositories; `core/files.ts` owns final descriptor/read authority. `core/provider.ts` owns the registered canonical root and disposable directory reader; add the similarly disposable filename reader without publishing navigation events. `core/worker-runtime.ts` routes search replies. `app/renderer/App.tsx` owns the command palette and `openLinkedFile`, the explicit guarded N1 activation. A separate small search controller/component owns query lifetime, keyboard selection and coverage presentation. Existing Service/Build graphs, layout, task and agent drafts must survive.

## Plan of Work

First add runtime-validated search contracts and a bounded cached reader with literal deterministic ranking, failure retention, cancellation and no-content metadata eligibility. Wire only the registered provider and ordinary worker. Then integrate a small palette filename result area: direct typing finds files alongside commands, keyboard arrows choose a result, Enter explicitly opens and Escape restores the prior focused element without navigation. Explicit Refresh updates the capture and exact-path mode remains unchanged. Finally extend unit contracts/race tests and the existing packaged navigation acceptance for actual two-repository source opening, not fixture metadata injection.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/repository-file-search` on `feature/repository-file-search`, based on reviewed normal PR38 `2933f2d`. Use `nix develop --command pnpm install --frozen-lockfile` if needed, then `nix develop --command bazel test --jobs=3 //:quality` while iterating. Final build is `nix develop --command bazel build --jobs=3 //...`; final uncached suite is `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test --jobs=3 --nocache_test_results //...`. Archive logs/proofs outside rewritable Bazel outputs. Start/comment/close `repository-file-search` through Ditz and synchronize. Push granular topic commits and early draft PR; normal merge only after local gates and clean review. The sole integration lease is clean pushed `integration/first-agent-run` at `fad686a`; merge the reviewed normal head and push, verifying tree identity. No master/human preview adoption.

## Validation and Acceptance

Unit tests distinguish tracked/nonignored untracked/dot/ignored names, duplicates, literal shell/glob-looking strings, caps, empty complete versus partial, errors/stale capture, disposal/supersession and symlink/.git/nested boundaries. Renderer tests prove Escape and typing do not move source, late A cannot override B or a new core, and keyboard Enter chooses exactly the highlighted path. Existing packaged `//tools/repository-navigation:smoke` runs actual main/preload/core in two committed repositories: find an off-slice file, inspect its exact bytes, retain dirty source/logical cursor, task/agent draft and graph instances/cameras at 100/150 zoom. Strict zero renderer exceptions and owned cleanup are required. No real model execution occurs.

## Idempotence and Recovery

Refresh replaces only a successful complete bounded observation; failure retains known names as stale and labels the failure. Cancelling/hiding invalidates client responses without cancelling a shared capture needed by a newer query. Provider disposal aborts its owned Git children; metadata checks stop at generation/deadline boundaries. Existing source is never overwritten by a name result. All automated GUI work uses owned virtual X11; preserve human ui-canvas port 55175 and possible buffers, other projects and master.

## Interfaces and Dependencies

Add `repo.search` with repository identity, literal query and explicit refresh. A result binds query/repository/capture ID/time, captured count/completeness, stale state, match truncation, bounded full paths and notice. A request-specific parser rejects mismatched authority and mixed payloads. Reuse Node filesystem metadata/Git runner, Zod and React; no dependency or new renderer capability.

## Artifacts and Notes

Control/evidence directory: `/tmp/swarm-ide-file-search-n2.MCo2v9`. Reviewed-base authority: `/tmp/swarm-ide-agent-rehearsal-i3.dLrYMQ/root-integration.md`. A concise seam records meaningful milestones only.

## Outcomes & Retrospective

Implementation pending. Repository navigation is already real; this step closes filename finding only. Live build links, service callsites, tiling, richer Context and real-agent policy remain separate, unclosed work.

Revision: initial bounded contract before implementation, 2026-09-07.
