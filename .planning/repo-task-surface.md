# Connect real repository tasks to the cockpit

This ExecPlan is a living document, maintained under `.planning/PLANS.md`.
`Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`
must stay current. D1 authored the design; T0 implements the shared base only.
Later implementation milestones require ROOT dispatch into designated worktrees.

## Purpose / Big Picture


A developer will see this repository's real Ditz tasks in the work panel,
inspect a task beside an open source file, and explicitly open a referenced
source or document without losing graph cameras or unsaved work. This delivers
useful product behavior even while actual model launch is unavailable. It does
not dispatch work, change task status or pretend an open task is ready to run.

The first release ends at read-only browsing and file navigation. After it lands,
a separate small contract gate can add explicit task-to-draft attachment with
revision-checked provenance. That extension must not block the useful first
release or weaken agent policy gates.

## Progress


- [x] (2026-09-06) D1 inspected product/agent architecture, installed Ditz help/JSON, real metadata and corroborating local Ditz source; selected the read-only first release.
- [x] (2026-09-06) D1 drafted `docs/repo-task-surface.md` and this plan; no product files changed.
- [x] (2026-09-06) D1 light independent OpenAI native design review CLEAN; whitespace, referenced existing files, actual schema/file-opening claims and plan consistency checked locally. PR #25 pushed; landing outcome recorded in its PR and ignored handoff.
- [x] (2026-09-06 07:02Z) T0 shared task read contracts, fail-closed stub and parser dependency base implemented and reviewed in PR #28. Exact code `947f6c3`, aggregate `8757050` after reviewed I2/P4; full 25-target build and all 9 uncached test targets passed (671 tests / 53 files). Normal landing/accounting is recorded in the PR and ignored handoff.
- [x] (2026-09-06 06:45Z) T0 created the designated `repo-task-base` worktree from reviewed `e2f3da7`, started `repo-task-contract-t0`, implemented initial wire/provider base and materialized pinned yaml 2.8.1; subsequent completed review/verification is recorded above.
- [ ] T1 and T2 in parallel: pinned local metadata provider; work-panel/detail UI against fixtures.
- [ ] T3: integrate reviewed T1/T2, real-metadata acceptance and owned virtual desktop proof.
- [ ] D2: separately review the task-to-draft schema/storage/revalidation extension; only then dispatch its consumers.

## Surprises & Discoveries


T0 inspection found the existing main-process supervisor applies a 5-second
timeout to every read, while this design permits a 10-second whole metadata
scan. T0 does not change the shared agent supervisor. Before T1 is integrated,
ROOT must assign a precise task-read timeout hunk and regression, or reduce the
scan budget coherently. A timed-out read is not a mutation and must not be
silently represented as a complete observation. Ditz `repo-task-read-deadline`
blocks `repo-task-surface`; this remains a T3 gate.

Native T0 council found that admitting every domain code in the generic outer
error envelope would allow `TASK_NOT_FOUND`/`TASK_REVISION_EXPIRED` without
their task/world/revision identity. The corrected outer allowlist includes only
actual transport/dispatch failures; domain outcomes remain in the correlated
task read result or observation. Regressions reject uncorrelated domain errors
for both task commands. Google found a count-limit naming nit; file reference
counts now explicitly bind the file-reference ceiling rather than its current
equality with the dependency ceiling.

The `yaml` 2.8.1 direct dependency causes pnpm to select Vite's existing optional
YAML peer. The lockfile therefore changes peer-qualified Vite/Vitest keys, not
their versions. There are no unrelated dependency upgrades. Existing root
`quality_sources` globs already track new protocol/core/tasks/fixtures/tests.

Installed `ditz --version` reported `0.1.0-ocaml`. `ditz ref --help` describes
`PATH` with optional `:LINE` and `--note`; list JSON really includes `file_refs`,
`blocks` and `blocked_by`. Before D1 creation, the repository had 79 issues and
none with structured file refs. Do not invent references to make a screenshot
look populated. A later isolated smoke repository must create refs using Ditz.

Local Ditz source at `3e2a5800794c316541da8c575481ced4a30fea17` shows
`Git.read_file_from_branch` using `git show ditz-metadata:<path>` separately for
each issue. `GitBackend.load_issues` logs and omits malformed files. The installed
CLI help has no commit selector. This motivates pinned Git-object reads rather
than presenting successful CLI output as a complete atomic observation. The
source checkout corroborates behavior but is not an executable provenance proof.

`protocol/agents.ts` currently restricts `links.task` to a normalized repo path;
Ditz lives on another Git branch. Reusing that string for an issue ID would lie
about identity. Task browsing needs its own read model, not new graph nodes or
changes to the six agent operations.

## Decision Log


Decision (T0, 2026-09-06): wire protocol 4 adds `task` beside the existing
success envelope's workspace snapshot, file and agent result. Task requests
must have exactly the approved fields; task replies cannot also contain file
or agent results. The incidental workspace snapshot verifies registered world
and repository only; a task client must never use it to retarget source focus.
Stateless identity validation is shared by worker, main and preload; existing
core-generation rejection remains, and T2 owns observation/selection tokens.
Persisted agent run and launch-context shapes do not include the wire version
and are unchanged: there is no agent migration in T0.

Decision (T0, 2026-09-06): `GitObjectId` is `{algorithm,hex}` with exact full
lowercase SHA-1/SHA-256 lengths. Snapshot summaries carry blob IDs of the same
algorithm. Read results echo world/repository/provider/task/metadata commit,
including typed domain errors in `result:{ok:false,error}`; transport errors
retain the existing failure envelope. Observation sequence is independent of
the core's shared event sequence. Serialized task-result payloads, not the
unrelated incidental workspace payload, are bounded by 512 KiB/64 KiB.

Decision (T0, 2026-09-06): unsupported literal file paths remain visible data
with `navigation:"unsupported"`; the shared syntactic classifier cannot claim
file existence. Ref and dependency counts must match full detail arrays.
Disposition is a bounded nullable string rather than an invented closed
enumeration; actual Ditz state/type enums are strict. T1 must validate fields
and same-snapshot dependency diagnostics before publication.

Decision (D1, 2026-09-06): release task browsing before draft enrichment. This
separates visible progress from policy activation and from a durable agent
schema change, while leaving a precise follow-on gate.

Decision (D1, 2026-09-06): read one local metadata commit through bounded Git
objects; do not run Ditz list on every view change. This avoids mixed revisions,
silent omissions, checkout mutation and network-on-open. Ditz CLI remains the
supported human/agent mutation interface outside this read-only product slice.

Decision (D1, 2026-09-06): explicit Reveal is the only task action that navigates
source. Task detail is a selected instrument view, not a source focus. This keeps
source editing, graph navigation and task inspection independently steerable.

Decision (D1, 2026-09-06): complete bounded snapshots, not partial truth. Limits,
malformed metadata and missing branches are distinct errors with retained old
data. A 256-task ceiling is an acknowledged prototype limit, not scale readiness.

## Outcomes & Retrospective


T0 implements and independently verifies the shared base, not usable task
browsing. PR #28 owns protocol 4, strict task payloads and request correlation,
the privileged task-provider injection and honest unavailable default, tests
and fixtures, and pinned yaml 2.8.1. There is no Git reader, safe metadata
parser, task UI, polling, attachment, metadata mutation or real model run.
Agent persisted store version 1 and run/context schemas remain unchanged.

Code council reached CLEAN fixpoint with OpenAI native and Google via ask-agent
on `dee1b6a..947f6c3`; Anthropic was actually session-limit unavailable, not
approval or a substituted seat. A native post-merge audit confirmed T0-owned
files byte-identical after adding reviewed I2/P4 at `8757050`; their fixtures
import the shared protocol version. The aggregate passed the full 25-target
build and all 9 uncached targets: 671 tests across 53 files, owned virtual
topology 62.653 seconds and agent journey 3.676 seconds with cleanup confirmed,
and required external-process proof 3.2 seconds. All GUI verification used the
owned virtual desktop, never the user's physical display. No watched master
or running app adoption occurred. Hosted run `34017734482` failed; the user's
conditional all-local-verification waiver permits normal landing, not a claim
of hosted green. Final actual status and normal merge are in the PR and ignored
handoff. Actual failed hosted diagnostics are the inherited policy seed pipe
(`codexStarted:false`) and the required private-namespace prerequisite; local
joined proof and boundary tests pass. Neither is bypassed in product code.

T1 now has one exact provider/schema base; T2 has schema-valid fixtures and
stateless response validators. ROOT alone dispatches those consumers after
landing. T3 still requires the real Ditz-authored metadata/virtual UI proof
and task-only timeout lease; D2 still requires its own durable task-provenance
contract decision. Do not claim an unavailable stub is a populated backlog.

D1 provides the independently reviewed design and exact implementation sequence only. No
backlog provider, new UI, schema, YAML dependency or agent attachment exists as
a result of D1. The product's earlier source/run functionality is unchanged.
Review was one proportional native design pass, not a full code council;
foreign seats were not requested for this docs-only gate. No build, model or GUI
test was run or needed for these two document additions. Hosted CI must be
reported separately; its execution is not evidence of product implementation.
Update this section after each implementation landing; record the
actual commit, local evidence, hosted status and remaining boundaries separately.

## Context and Orientation


This is a Linux Electron application using a sandboxed React renderer. React has
no filesystem or process authority. `app/electron/preload.ts` exposes a typed
request bridge; `app/electron/main.ts` forwards validated requests to the local
core utility process in `core/worker-runtime.ts`. A core generation identifies
one lifetime of that process. Results from an older generation cannot replace
newer state. `protocol/common.ts` supplies the protocol version;
`protocol/schema.ts` validates requests/responses; `protocol/agents.ts` owns the
six existing prepare/launch/steer/cancel/snapshot/read agent commands.

`app/renderer/App.tsx` composes source tabs, graph instances, work panel and
instruments. Its “Dispatch queue” placeholder is the insertion point for Tasks.
Existing `file.watch`, `file.read` and the source-tab lifecycle perform explicit
file opening. `core/files.ts` validates contained canonical regular files,
including no-follow/nonblocking opens. Reuse these semantics, not a second reader
or renderer filesystem path. `app/renderer/agents/bridge-client.ts` and
`live-state.ts` retain fixed-focus drafts and uncertain operations; this first
release does not edit them.

Ditz records are YAML blobs at `.ditz/issue-<id>.yaml` on local
`refs/heads/ditz-metadata`; `.ditz/project.yaml` identifies the metadata project.
They are not source-tree files. A Git commit object freezes a complete metadata
tree. Its hash is independent of working source, build input fingerprint and
deployment version. A task identity is registered repository ID + `ditz` + full
ID. An observation includes the algorithm-tagged metadata commit and issue blob
hash. Full IDs use ASCII letters, digits, underscore and dash, at most 256 bytes;
no prefix lookup is permitted in the product.

Current coordination at D1: I2 owns first-agent integration and its shared plan;
P3 owns policy proof; W3 owns compact renderer layout. ROOT must retire/transfer
those exact shared seams before assigning overlapping edits. D1 owns only the
two new documents. No one pulls/restarts the watched master app implicitly.

## Plan of Work


### T0 — one small shared base before parallel consumers


Assign one contract owner `protocol/tasks.ts` (new), the necessary imports and
discriminants in `protocol/schema.ts`, next protocol version in
`protocol/common.ts`, and request-correlated result validation. Add
`core/tasks/contracts.ts` and an unavailable implementation, then a narrow
dispatch hook in `core/worker-runtime.ts`. This hook must never mutate workspace
focus or call an agent. Check main/preload validation and add only the exact
required wiring there. Existing workspace/agent response behavior stays intact.

Use two new read requests: `tasks.snapshot {worldId, refresh: boolean}` and
`tasks.read {worldId, metadataCommit, taskId}`. World IDs must match the core's
registered world; the renderer cannot provide a root, ref, executable or blob
path. `refresh: true` adopts one observed local metadata revision, not a network
sync. `false` checks the local ref and returns cached summaries/staleness without
parsing all issues. `tasks.read` reads the current cached snapshot only, with
strict identity/revision correlation. A wrong/expired revision returns
`TASK_REVISION_EXPIRED`; a missing ID is `TASK_NOT_FOUND`, never another task.

Add a task result discriminant alongside existing response data, not inside
`WorkspaceSnapshot`, `GraphSlice` or `AgentSnapshot`. Preserve existing response
envelopes and global sequence/lifetime handling; a task-only client must not
use incidental workspace data to retarget source. No new task event protocol is
needed: visible Tasks requests a ref-only check every 5 seconds and on window
focus/reopening, deduplicated by the core. Hide/dispose stops that timer. Initial
open and explicit Refresh perform the full bounded observation. Reconnect marks
old data stale and requests one observation, never replaying a mutation.

Define `TaskObservation` as attempt status plus nullable last successful snapshot,
not a single overloaded health color. Status is
`unobserved|loading|observed|stale|unavailable|malformed|limited|error`;
include a sanitized reason, check time, locally observed ref or null, and
monotonic observation sequence. The retained snapshot contains repository/world,
provider, commit, observed time and bounded summaries. `TaskSummary` contains
ID, blob, title, type, component, state and actual dependency/ref counts.
`TaskDetail` adds description, disposition, recorded dependency IDs and their
same-snapshot observed states/diagnostics, plus explicit file-ref candidates.
Result parsers bind each response to the request's world, task and revision.

T0 also owns `package.json` / `pnpm-lock.yaml` for one pinned direct `yaml` 2.x
dependency, needed by T1's safe document parser, and schema fixtures/new
`tests/task-contract.test.ts`. It must verify the exact parser API, dependency
materialization and existing Bazel source tracking. Publish the reviewed base
before consumers branch; no competing schema or dependency edits. Accept T0
when malformed/extra fields, wrong-world/revision/task results, output limits
and old protocol versions fail in tests, and normal UI honestly returns an
unavailable task provider without breaking existing source/run contracts.

### T1 — core reader, independent of UI work


From T0, one core owner creates `core/tasks/git-reader.ts`, `metadata.ts`,
`provider.ts`, plus `tests/task-metadata.test.ts` and `task-provider.test.ts`.
Use Node fixed-argv Git subprocesses only, with explicit registered repository,
scrubbed Git redirection variables, replacement objects/lazy fetch disabled and
transport protocols disallowed. Resolve only the local metadata branch to a
commit, enumerate its immediate `.ditz` entries, check regular blob types/sizes,
then read those exact blob IDs. No checkout, fetch, sync, shell, filters or
untrusted revision syntax. Confirm the ref after reading; advancement produces
a consistent-but-stale old observation, not a mislabeled new one.

Validate required project metadata and issue filename/full-ID correspondence.
Real Ditz states are unstarted/in_progress/paused/closed; types are
bugfix/feature/task. Required user-visible fields must have their declared type;
missing optional file_refs/blocks/blocked_by become empty arrays. References are
`{path,line:null|positive integer,note:null|string}`. Unsupported paths remain
literal disabled candidates; they do not authorize access. Other bounded fields
are ignored, not copied to the renderer. No description-to-link inference.

Use the pinned YAML document API with exactly one document, unique scalar string
keys, no aliases, explicit tags, merge keys or prototype-related keys. Inspect
syntax nodes before converting/projecting; errors and warnings about unsupported
syntax must not be ignored. Bound input before parse and bound depth/nodes before
conversion. Test hostile nesting for bounded runtime too; if the pinned parser
cannot meet that bound synchronously, isolate parsing in one owned worker with
a deadline, rather than pretending a timer can interrupt synchronous work.

Limits are 256 issues, 64 KiB each, 16 MiB total input/cache, depth 16 and 8,192
syntax nodes per blob, 256-byte IDs/components, 512-byte titles, 16 KiB desc,
32 entries per dependency direction, 32 refs with 1,024-byte paths/512-byte
notes, 512 KiB summary response and 64 KiB detail response. All text bounds use
UTF-8 bytes; exceeding one returns `limited`, never silent truncation. Only one
scan, at most 5 seconds per command and 10 seconds overall; terminate owned
subprocesses on timeout/disposal. A superseded operation cannot publish late.
Cache one complete successful normalized snapshot, retaining it across failures;
do not evict it just because a newer attempt is invalid. Discard the prior cache
only when a new complete snapshot replaces it. No source-cursor scan trigger.

Cross-check dependency endpoints and direction pairs in the same snapshot;
report missing, cyclic or asymmetric records without inferring readiness or
repairing them. Malformed YAML/duplicate IDs fail the whole new observation with
a sanitized diagnostic, rather than hiding tasks. Valid zero issues is observed
empty; missing project/ref/objects is unavailable; invalid YAML is malformed.
Inject this provider through T0's interface; T3 owns shared worker wiring unless
ROOT explicitly gives T1 that exact non-overlapping hunk.

### T2 — work-panel task inspection and deliberate navigation


In parallel with T1, one UI owner creates `app/renderer/tasks/client.ts`,
`TaskPanel.tsx`, `TaskDetail.tsx`, local styles and
`tests/task-client.test.ts` / `task-panel.test.tsx`. Use T0's schema-valid
fixtures in new `fixtures/tasks.ts`. After W3's reviewed layout is available,
that owner alone edits the small App composition and palette hooks, plus narrow
requested-line/error presentation in `App.tsx` and `EditorPane.tsx`. The existing
`openFile` has no line argument and currently hides broker details behind generic
text: implement these explicit obligations without replacing the tab lifecycle.
For an already-open dirty buffer, do not infer that metadata line numbers match
unsaved text; retain its cursor and report that line Reveal needs saved/current
source rather than moving to an unverified location. Keep Work
and Information panel IDs/buttons and mounted source/graphs; do not change
agent clients, durable context, reload guards or existing renderer layout rules.

Default to Open / All and title/ID text filtering, stable full-ID sorting.
Task selection changes only task selection and the selected information view.
It must not steal focus, pop open a hidden compact panel or alter source/camera.
Offer Show task details and Return to source information. Source interaction
foregrounds source instruments while retaining the selected task. Dependency
selection stays in Tasks. Refresh retaining an absent selected ID shows “Task
not present in this revision” instead of selecting a different task implicitly.

Reveal calls the existing explicit source opening flow, preserving dirty tabs.
Reject absolute/scheme/backslash/control/dot-segment/noncanonical paths before
request; the core remains final authority on containment, binary/size/regular
file checks. Source content is today's working file, not metadata-revision
source. Out-of-range lines get a visible notice after opening the valid file.
Multiple links stay choices, unsupported references remain text. Docs open as
text only. No HTTP fetching, Markdown scripts or automatic attachments.

Build distinct loading/no matches/true empty/unavailable/malformed/limited/stale
states. Use generation + sequence + selection tokens to discard late response
and old detail races. Expose revision and last-check time; builds cannot mark
Tasks fresh. No fake run/progress/readiness values and no first-release Dispatch
button. Show all task text safely as text, escaping confusing controls as the
existing agent display does. A supported reference is never labelled resolved
until the file broker actually succeeds.

### T3 — one reviewed integration and real-data proof


Assign one integration owner the exact worker/App handoff hunks, any necessary
new `tools/tasks-smoke.mjs`, `tools/tasks-smoke.sh`, `tools/BUILD.bazel` target
and root source tracking. Merge only reviewed committed T1/T2 heads; preserve
their ownership and run the joined tests. The proof uses the actual Git reader,
typed bridge and UI, not just fixtures. No product model is required.

Use an owned disposable Git repo with metadata authored by the real Ditz CLI:
two tasks, a dependency, a valid source ref, a documentation ref and an unsafe
ref that stays disabled. Its deterministic source/doc files are test inputs,
not edits to the user's project. The CLI smoke must be a Bazel-owned target
with a pinned Ditz executable supplied by Nix; the project's current flake does
not include Ditz, so T3 alone owns that explicit test dependency addition and
lock update. No runtime network installation/fetch in acceptance. Malformed
metadata/object faults can be synthetic test fixtures; never hand-edit the
user's live Ditz branch to test failures.

Demonstrate current repository tasks read without modifying refs/worktree, and
the isolated repo's explicit-link journey on the owned virtual desktop. Select
a task with source dirty and both graphs panned, then Reveal its doc/source.
Confirm unchanged text, camera/node instances and correct working-file target.
Advance isolated metadata with Ditz: ref check marks stale; Refresh adopts one
new revision. Missing/invalid metadata retains the prior revision with a clear
error. Empty versus filter-empty is distinguishable. Record zero agent prepare,
launch and mutation calls, zero provider calls, no fetch/sync and complete
owned process/desktop cleanup. Retain proof artifacts without sensitive task
bodies. This is the first releasable behavior, not a schema-only milestone.

### D2 — explicitly separate subsequent attachment gate


After T3, dispatch a small shared-contract design/implementation base before
parallel context/UI consumers. Add a typed optional task reference to
`agent.prepare` and immutable `LaunchContext`, with repository/provider/ID,
metadata commit/blob identity and exact core-materialized task bytes/digest.
Do not misuse `links.task` or add a seventh agent command. This requires a
reviewed durable-store compatibility decision and request/response validation
before consumers edit `core/agents/context.ts` and renderer agent draft files.

Keep fixed source focus, current source/config revalidation and five-minute
prepared-context expiry. Require unchanged metadata commit/blob at prepare and
launch; advance means refresh/reconfirm, not automatic run. Attaching offers
append/replace/cancel if a draft already has text and invalidates preparation
and confirmation. Task title/description are a bounded untrusted data section,
not tools or authority; no ref is implicitly dereferenced. Preserve 16 KiB task
and 128 KiB total context bounds and explicit overflow errors. Policy unavailable,
unknown admission/cleanup and disk-only context gates remain. Historical runs
retain the original task revision after metadata changes; no status auto-write.
D2 must specify legacy persisted-record handling and red/green tests before
implementation. These details are a deliberate next gate, not secretly settled
or implemented by the browsing release.

## Concrete Steps


Use the explicitly assigned feature worktree for each slice, never watched
master. ROOT provides its reviewed base. Materialize dependencies through the
project shell; builds/tests run only through Bazel:

    cd /home/tedks/Projects/swarm-ide/<designated-task-worktree>
    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //:quality --jobs=3 --nocache_test_results
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results

T3 creates the new supported `//tools:desktop-tasks-smoke` Bazel target. Until
it exists this is a planned command, not a currently runnable acceptance:

    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock env SWARM_VIRTUAL_DESKTOP_PORT=55174 nix develop --command bazel run //tools:desktop-tasks-smoke --jobs=3

Use the owned virtual harness only, never inherited physical DISPLAY=:0, never
unrelated port 5173 or watched port 55173. `flock --close` prevents child build
daemons from retaining the lock. Record test counts/targets, actual failures,
proof timings and `cleanup_complete=1`. Do not promise a fixed future test count.

For read-only metadata comparison use `git rev-parse refs/heads/ditz-metadata`
before and after `nix develop --command ditz list --json`; if the two revisions
differ, do not call that CLI comparison a coherent baseline. Product snapshot
acceptance instead proves its pinned revision through Git object IDs. Ditz is
available in the current operator profile, not yet a project-pinned test input.

## Validation and Acceptance


Schema fixtures cover every task attempt state and reject wrong world/ID/hash,
unexpected fields, UTF-8 limit overruns and mismatched response kinds. Parser
tests cover duplicate IDs/keys, conflict markers, multiple YAML docs, aliases,
tags, pathological nesting, invalid UTF-8, symlinks/submodules, invalid enums,
missing optional arrays, oversize blob/list/detail and line numbers. Git tests
prove branch advancement cannot mix object revisions, missing objects cannot
fetch, expired cache detail cannot silently reread a newer task, and timeout /
late completion cannot publish stale authority.

Core/UI tests cover missing/cyclic/asymmetric dependencies without false ready
labels; ref-only invalidation without rescans; coalesced refresh and disposal;
source changes/build green independent of task status; reconnect/out-of-order
responses; deleted selection; true empty versus no matches; unsupported or
escaping links; missing file, FIFO, binary, dirty editor and invalid line;
keyboard access and narrow panes without remounting source/graphs or destroying
draft state. Include a negative invocation ledger proving inspection never
calls any agent command, file write or metadata mutation. New tests must fail
against the placeholder/unavailable implementation and pass the joined slice.

T3's real metadata and virtual proof are required beyond unit-test success.
Council-review nontrivial code to fixpoint, with native and foreign-provider
seats honestly recorded. Normal merge via PR only. Hosted failure may be waived
only with all relevant local verification actually complete; inherited hosted
policy boundary failures are not green CI. No silent master/app adoption.

## Idempotence and Recovery


Reads never mutate metadata or source. Failed observations retain their pinned
snapshot and retry only on explicit refresh/visibility recovery, not a tight
error loop. Recreate only owned disposable test repositories/desktops; preserve
user data and never kill by port/name. Stop exact owned processes and release
locks on every test outcome. Never clean peer stashes or delete branches while
the wave is in progress. Integration uses reviewed commits, not peer working
files. A schema base lands once before independent consumers.

Use deterministic Ditz IDs for each dispatched implementation slice and sync
through the CLI. D1 issue `repo-task-surface-design-d1` closes only the delivered
design; unstarted implementation boxes remain open work. Commit/push branches,
open draft PRs early, retain clean pushed worktrees after normal merges and
record follow-ups explicitly. Shared ownership changes require ROOT coordination.

## Artifacts and Notes


The product contract is `docs/repo-task-surface.md`; D1's ignored evidence is
`artifacts/overnight-wave/task-contract/handoff.md` in the control worktree.
Implementation must place sanitized evidence under a new slice-specific artifact
directory and summarize actual tested topic/merge revisions. Do not copy private
task descriptions, person records or agent credentials into PR/CI logs.

## Interfaces and Dependencies


T0's concrete exported schemas are in `protocol/tasks.ts`: `TaskRequestSchema`,
`TaskObservationSchema`, `TaskSnapshotSchema`, `TaskSummarySchema`,
`TaskDetailSchema`, `TaskFileRefSchema`, `TaskDependencySchema`,
`TaskReadResultSchema`, `TaskResultSchema`, `TaskErrorSchema`, and
`TaskBoundaryErrorSchema`; all TypeScript types are inferred. `TASK_LIMITS`
shares reader/wire ceilings. `parseTaskResultForRequest` validates the exact
kind/world/task/revision; `parseCoreResponseForRequest` additionally binds the
request ID and registered repository. All objects are strict, and text/whole
payload limits count UTF-8 bytes. This is validation, not permission to launch.

`CreateTaskProvider(context)` receives only core-owned `{root,worldId,repositoryId}`
and returns a `TaskProvider` or promise. The privileged worker's `createTasks`
dependency is the only injection point. Its default unavailable provider never
reads that root. Each unavailable read returns a new observation sequence and
a sanitized reason rather than an empty task list; `dispose` is idempotent,
rejects future reads, and worker shutdown prevents late task publication.
The provider's `read` result includes `kind:"read"`, registered identity,
requested commit/ID, sequence/check time and either complete detail or typed
error. Main and preload already call shared request-specific validation, so no
separate Electron wiring is needed for the base.

Pinned dependency `yaml` 2.8.1 exposes `parseDocument`/`parseAllDocuments`,
document errors/warnings, node guards and `visit`, and bounded `toJS` options.
`tests/task-yaml-api.test.ts` proves those exact installed APIs. It is not the
safe metadata parser: T1 must still inspect forbidden aliases/tags/keys and
depth/node limits before conversion, enforce one document, and test hostile
runtime bounds. `fixtures/tasks.ts` covers the eight observation states,
retention and read errors for tests only and is never imported by production.

The implemented provider interface in `core/tasks/contracts.ts` is:

    interface TaskProvider {
      snapshot(input: { refresh: boolean }): Promise<TaskObservation>;
      read(input: { metadataCommit: GitObjectId; taskId: string }): Promise<TaskReadResult>;
      dispose(): Promise<void>;
    }

`GitObjectId` carries algorithm and validated full hex digest. `TaskReadResult`
is either a correlated bounded detail or a typed task error. Protocol requests
carry the registered world; the provider constructor receives the core-owned
repository/root, never a renderer path. Strict Zod schemas are the wire source
of truth; TypeScript types are inferred. Use existing IPC and file-open flows,
Node Git subprocess support and a pinned YAML document parser; no new service,
database, UI framework, Ditz mutation API or model dependency.

Revision note (2026-09-06, D1): initial plan records real Ditz capabilities,
read-only release staging, conservative complete snapshots and one shared base
before parallel core/UI work. No existing first-agent plan was edited.

Review note (2026-09-06, D1): independent light review was CLEAN. Added explicit
T2 ownership for the current opener's missing line/error presentation, including
dirty-buffer line ambiguity; all implementation milestones remain unstarted.

Revision note (2026-09-06, T0 in progress): recorded exact task wire/provider
seams, assumptions, preserved agent compatibility and the observed read-timeout
integration gate. T1/T2/T3/D2 remain unstarted; no usable task browsing claimed.

Verification note (2026-09-06, T0): recorded exact reviewed aggregate/local
evidence, council correction and missing seat, preserved agent storage schema,
and the filed timeout gate. Only the shared base milestone is complete; later
milestones remain unchecked. Final normal merge/Ditz/owned cleanup are archived
in `artifacts/overnight-wave/task-base-t0/handoff.md` in the control worktree.
