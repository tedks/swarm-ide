# Make logical changes readable across artifact and agent streams

This living ExecPlan follows `.planning/PLANS.md` and must retain its Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective sections.

## Purpose / Big Picture

An operator opens Journal, reads short accounts of meaningful changes, and expands evidence instead of reconstructing work from agent transcripts. An actual supervised summarizer writes the first account from bounded Git evidence and attributed reports. Refresh reads a validated repo-local artifact; it never invokes a provider. Source links open through the existing file broker without replacing dirty buffers or moving graph cameras.

## Progress

- [x] (2026-09-07) Verified clean designated branch `feature/demo-logical-changelog` at ROOT-cleared `c3128715a785c2fd42011e4cf5941038b268335c`; read instructions and wave ownership.
- [x] (2026-09-07 20:00Z) Implemented strict bundle/output contracts, bounded contained reader and export/validate workflow; actual Git spans exported.
- [x] (2026-09-07 20:02Z) One native gpt-6-astra summarizer authored three actual raw outputs: Swarm task-context span and two generations from a new real disposable Git repo. Input/instructions digests retained. Swarm and first proof materialized through Bazel validation; second enters packaged update proof next.
- [x] (2026-09-07 20:08Z) Implemented existing Activity feed -> main text-area expanded document, explicit source actions and retained error/core-generation fencing tests. Initial quality passed after correcting a test's mistaken fixture-function use. No historical broad RED claim.
- [x] (2026-09-07 20:29Z) Actual packaged source-handoff controlled RED->GREEN; pending real source reply, independently panned service graph, dirty source/draft and graph DOM retention proved. Native/Google fixpoint clean; Sonnet unavailable.
- [x] (2026-09-07 20:38Z) Composed ROOT-cleared B1/L1 base in baf6a52. Final local build44, quality1517/108, real packaged Journal4.344s and unchanged ordinary-close rehearsal28.577s passed; both owned desktop cleanups complete. Native/Google composition clean.
- [ ] Normal PR56 merge remains held by ROOT's H1 landing-slot reservation. Coherent reviewed implementation pushed; no shared app adoption.

## Surprises & Discoveries

The existing `core/files.ts` broker rejects path traversal, symlink aliases, special files and oversized/unstable reads. A first new UI test mistakenly treated `initialSnapshot` as a value, causing TypeScript failure before execution; corrected to call the factory. The next quality checkpoint passed. The supplied initial D4 recap and design status paragraph are historically stale; the summarizer correctly distinguishes those reports from later actual Git merges, rather than quietly overwriting history. Native council found that execFile's AbortSignal callback can precede actual child close; the fixed spawn helper waits for close with bounded TERM/KILL escalation, tested against an in-flight TERM-resistant owned process. A subsequent authoritative source callback initially hid Activity too early; an actual packaged controlled-order test at20ff568 failed `Journal remains visible until authoritative source handoff settles` with zero renderer errors/cleanup1. The one-line correction lets existing successful Reveal hide Activity, avoiding a transient no-document graph-reframe transition. This is an introduced controlled-order class, not historical failure attribution.

## Decision Log

Decision: use a versioned repo-local evidence bundle plus generated Journal, joined by a SHA-256 input digest. Rationale: a reproducible external authoring loop supplies genuine model synthesis without enabling production agent execution. Date/author: 2026-09-07 J1.

Decision: one bounded PR, not a PR stack. Rationale: the contract, reader, renderer and executable authoring loop are a single independently usable vertical. Additive seams only; unrelated peers remain independent. Date/author: 2026-09-07 J1.

Decision: distinguish artifact observation, agent report and inferred reconstruction in visible text. Validation proves structure/citation membership, not the truth of generated prose. Date/author: 2026-09-07 J1.

Decision: user steering places compact logical changes in the EXISTING Activity log, with selection opening an expanded Activity document in the main text area. No separate topbar Journal or floating overlay. Expanded entries identify explicit agent/task associations and code actions; unknown associations stay unknown. Date/author: 2026-09-07 user/J1.

Decision: explicit source citations use the existing authoritative `openLinkedFile` Reveal flow, not a display-only open that leaves agent-draft focus on an unrelated directory. Repository navigation caused by an explicit source gesture is intentional; Activity inspection/refresh does not command any cameras or source. Date/author: 2026-09-07 J1, packaged screenshot inspection.

## Outcomes & Retrospective

Implemented and locally verified on ROOT-cleared B1/L1 composition, awaiting ordered PR56 landing. The existing Activity log opens a readable main-document account with agent/task associations, actions, evidence and deliberate working-source links. One actual supervised model turn produced the included Swarm story and two real disposable Git generations. Actual packaged refresh proved stale/unknown-citation refusal and source/draft/camera retention, including controlled first-source timing. Build44 and quality1517/108 passed; unchanged ordinary-close rehearsal also passed. Native/Google review converged; Sonnet was unavailable, not substituted. No hosted-CI claim or all-suite claim: the final checkpoint intentionally ran relevant local gates rather than every unrelated desktop suite.

In-app scheduling, streaming summarization and managed provider activation remain outside this increment. The generated narrative itself surfaced stale task-context documentation; Ditz `task-context-status-doc-drift` records that concrete follow-up, while `journal-followups-20260907` records deferred presentation/automation work. No private transcript was published. ROOT's H1 landing reservation, not a product test failure, currently prevents normal merge; no shared app was changed.

## Context and Orientation

`app/renderer/App.tsx` owns persistent source buffers and independent graph views. `protocol/schema.ts` validates all renderer-to-core requests. `core/worker-runtime.ts` dispatches requests inside a privileged utility process. `core/files.ts` reads canonical regular repo files safely. New `protocol/changelog.ts`, `core/changelog.ts` and `app/renderer/changelog/` contain this feature. New `tools/demo-journal/` owns Bazel entry points and packaged verification. Existing production agent policy and peer modules are unchanged.

An evidence bundle is a bounded list of source observations identified by stable IDs, with a recorded revision span, coverage limits and selected attributed reports. Generated entries cite those IDs. A digest is SHA-256 over the exact exported bundle bytes, binding output to its actual input. A stale or malformed update is visible; the last valid observation is retained and labelled, not silently called current.

## Plan of Work

First define browser-safe strict schemas and cross-citation validation. Use an external Bazel export tool to capture fixed-argv bounded Git commit/file observations and explicit sanitized repo-local reports. The CLI validates/materializes output only for its current input. The core reader handles fixed `.swarm/changelog-bundle.json` and `.swarm/changelog.json` paths through the existing broker and validates digest and references before publication.

Next add compact logical changes to the existing Activity content slot in App and a module-local main text-area document. Cards show headline, intent/outcome and decision; expandable evidence shows explicit agent/task association, kind, source revision, exact paths and gaps. Prose remains React text, never HTML or process commands. Explicit source activation calls the existing ordinary source opener without camera coordination; Journal focus does not imply source or agent execution.

Then generate a real recorded Swarm task-context story using the allowed merged commits and sanitized supplied recaps. One native summarizer receives only the exported bundle and checked-in instructions and produces output; preserve its raw output and generator provenance. For the operational proof, create a disposable real Git repository/change, export it, ask the same summarizer to update its output, validate it and show the change via ordinary packaged UI Refresh on owned virtual X11.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/demo-logical-changelog`. Run `nix develop --command pnpm install --frozen-lockfile` for dependencies. Use `nix develop --command bazel test --jobs=3 //tools:quality` for TypeScript, tests and build checks. `//tools/demo-journal:author -- export ROOT FROM TO` exports and `-- validate ROOT` materializes, as documented in `docs/logical-changelog.md`. `:author -- seed-proof OWNED_EVIDENCE_DIRECTORY` creates the real disposable Git proof input. After actual supervised summary output is supplied, run `:smoke` with `SWARM_JOURNAL_AUTHORING_PROOF` pointing there. Serialize heavy suites and all GUI with `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock`; only owned X11 :90 / port55174. No physical desktop automation or shared app adoption.

## Validation and Acceptance

Tests must reject unknown citations, traversal/symlinks/special files, oversized fields/files, digest mismatch, invalid revision/IDs, stale async results and arbitrary renderer paths. Mounted tests prove text-only rendering, explicit evidence/source activation and retained valid observation on errors. Packaged acceptance opens a real disposable repository, sees an actually agent-generated entry, refreshes an actual new generation, follows a source citation while retaining source/draft/cameras, and observes malformed output refusal. Synthetic schema fixtures are labelled and cannot stand in for actual summarization. Capture screenshot and concise walkthrough. Council uses native OpenAI, foreign Google and explicit Sonnet, with unavailable seats recorded and fix-delta convergence. Hosted CI is ignored under task-specific authority.

## Idempotence and Recovery

Export and validation are explicit operator commands, not background mutation. Refuse malformed input before replacing output; write staged files and rename atomically. Failures keep the last valid UI observation marked retained. Disposable proof repos/profiles/processes are owned and cleaned; preserve source, branch and evidence. Do not merge later peer bases without ROOT clearance. Record remaining noncritical issues in Ditz rather than expanding the slice.

## Artifacts and Notes

Operational handoff: `/tmp/swarm-ide-demo-release.GY8Uwv/journal/`. The final recap distinguishes supervised summarizer generation, real Git/structured observations, agent-reported rationale and deterministic test fixtures. No private transcript or absolute personal path is committed as demo content.

## Interfaces and Dependencies

Use existing Zod, React and Node dependencies. Export `ChangelogBundleSchema`, `ChangelogDocumentSchema` and validated view types from `protocol/changelog.ts`. `readChangelog(root)` returns only bounded validated document/evidence with explicit unavailable or stale state. The browser sends a fixed read request, never paths. Additive core request/response dispatch does not change managed agent admission or global wire version. The renderer receives a typed `onOpenSource(path)` callback; no new process or filesystem interface is exposed.

Initial plan authored 2026-09-07 for one demo vertical; update this document as actual evidence accumulates.
