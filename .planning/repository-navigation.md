# Browse the actual registered repository

This ExecPlan is maintained according to `.planning/PLANS.md`. It is a living
implementation plan prepared by N0, a design-only department. ROOT must accept
the design before dispatching N1; publication does not authorize execution.

## Purpose / Big Picture


A person can open the working tree graph, enter `core/`, open `files.ts` in the
existing editor, and return Up without losing a service camera, dirty source or
agent draft. It works in another local Git repository with a committed HEAD and
no FraudCheck example. This replaces a fixed example inventory with a bounded
directory projection: one directory and its immediate children, not all files
of a monorepo. Builds remain independent.

## Progress


- [x] (2026-09-06) N0 inspected the T3 base, actual navigation seams and unclosed foundations.
- [x] (2026-09-06) N0 drafted the navigation contract and closure ledger.
- [ ] N0 finish design review, local document checks, normal merge and Ditz sync.
- [ ] ROOT evaluate the published contract and dispatch N1 if accepted.
- [ ] N1 implement the vertical, prove actual packaged behavior, review and land.
- [ ] ROOT verify N1 and separately decide runtime adoption and next consumers.

## Surprises & Discoveries


`core/provider.ts` hardcodes project identity and every repository node. Its
`markWorkingWorldChanged`, `startReconciliation` and failure paths reconstruct or
recolor that graph. Replacing only initialization would revert browsing on the
next build/event. `WorkspaceSnapshotSchema` in `protocol/schema.ts` requires every
mapping candidate's `nodeId` in the target slice. `App.tsx`'s `selectFocus` opens
any `focus.path`, including a future directory unless activation is separated.
`GraphPane.tsx` now fits only on mount or an explicit control, not interface zoom;
keep that guarantee. Existing `core/fingerprint.ts` scans working changes and
requires a committed HEAD: this plan does not make it Google-scale.

## Decision Log


On 2026-09-06 N0 chose one mono-agent vertical because protocol, provider events,
mappings and App activation are coupled. A separate contract-only landing would
not fix the user's inability to browse. Filename search follows a proved path
activation seam rather than inventing a recursive index inside this increment.

On the same date N0 chose explicit directory observations and Refresh, with stale
labels, to avoid per-focus repository rescans. An observation is a dated bounded
listing, not an atomic filesystem snapshot or a successful Bazel build.

## Outcomes & Retrospective


N0 delivers design and open-issue accounting, not a repository browser. T3 task
integration is already complete and must not be repeated. The earlier gap was
mistaking real example source plus graph mechanics for a completed repository
experience. N1 completion therefore requires visible production behavior.

## Context and Orientation


The renderer cannot read files directly. `app/electron/preload.ts` validates
requests; `app/electron/main.ts` routes them to `core/worker-runtime.ts`.
`core/provider.ts` owns the coherent `WorkspaceSnapshot`, meaning the focus,
graphs, mappings and instruments delivered together. `app/renderer/state.ts`
rejects late sequences/epochs. `app/renderer/GraphPane.tsx` renders each graph and
`graph-adapter.ts` converts shared data into React Flow nodes. `App.tsx` owns
source tabs, `openFile`, explicit task Reveal and draft composition. The existing
`core/files.ts` validates relative paths and the actual opened descriptor, rejects
symlinks/aliases and nonregular files, then reads bounded UTF-8 content; reuse it.

The canonical design is `docs/repository-navigation.md`; its limits and behaviors
are incorporated below so a new implementer does not need previous sessions.
`docs/foundation-closure.md` distinguishes remaining requirements from this step.

## Interfaces and Dependencies


N1 owns the additive module `protocol/repository.ts`, new `core/repository.ts`,
and necessary wiring in `protocol/common.ts`, `protocol/schema.ts`,
`core/provider.ts`, `core/worker-runtime.ts`, Electron validation/routing,
`app/renderer/App.tsx`, `GraphPane.tsx`, `graph-adapter.ts`, `state.ts` and new
`app/renderer/repository/` helpers. Add tests and one owned packaged acceptance
target under `tools/repository-navigation/`; its Bazel inputs must include all
new source files. No dependency additions or provider/plugin framework.

Advance protocol version 4 to 5 together across production and fixtures. Add a
strict `repo.list` request carrying `requestId`, version, `directory` (`""` is
root), page (nonnegative), optional observation ID and bounded local name filter,
and `refresh` boolean. Page/filter reuse an observation; mismatched IDs report
stale and require Refresh, never mix captures. The core caps page size at 200,
capture at 4,096 entries/1 MiB and filter at 256 characters. Define
`RepositoryEntry` with stable ID, canonical path, display label, entry kind,
Git classification (`tracked | untracked | ignored | unknown` for leaves), and
eligible/traversable or a bounded unsupported reason. Directories do not claim
whole-subtree tracked status. Provide `RepositoryObservation` with directory,
observation ID, capture time, state, completeness, page count, entries and notice.
Core method `list(request): Promise<RepositoryObservation>` is read-only and
disposable; all errors are bounded typed results, never raw arbitrary Git stderr.

Add an optional, runtime-validated directory observation to the repo `GraphSlice`
and `repo` result to its matched `CoreResponse`. Validate request/result directory,
page and observation identity at the existing bridge boundaries. Only a
`topologyId: repo` slice may use this observation. Its `reconciliation` is gray
and neutral; its observation state is separately labeled. Its input fingerprint
is coordination context, not a directory content digest. For this explicit slice
only, exempt the build-specific green-graph provenance branch of
`WorkspaceSnapshotSchema`; validate repo provenance against observation identity
instead. Preserve every existing green invariant for all other graphs and the
workspace's build/deployed revisions. A directory refresh never turns global
reconciliation green or advances a build epoch.

Mapping candidates retain focus/confidence/reason and have exactly one of
`nodeId` or `revealPath`. The latter is legal only for a repository file target
with canonical path equal to `focus.path`. Validate all loaded node IDs as now;
count both candidate forms for ambiguity. `adaptGraph` highlights only loaded
IDs, while off-slice links remain explicit. Update `core/service-topology.ts`
only where required to produce path identities/recipes without demo-node coupling.
No silent dropping of candidates, imaginary hidden nodes or whole graph union.

Use existing sequenced workspace publication for a committed repo slice and
matched responses only for acknowledgement, not a second authoritative renderer
replacement. At the provider, capture an intent generation on each navigation;
obsolete completions do not commit. Merge the new repo slice/mappings into the
latest snapshot rather than a captured pre-build snapshot. Renderer and core
generation checks also reject late responses after replacement. Working-revision
changes retag focus but do not erase the directory or claim a refreshed listing.

## Plan of Work


N1 first commits schemas and red regressions for candidate alternatives, neutral
directory provenance, stale navigation and directory/file activation. Existing
fixtures continue obeying strengthened validation. This commit is not a separate
department or claim of user-visible completion.

Next implement bounded, no-follow directory observation. Canonical root identity
is established once by the privileged process; never accept an absolute root
from the renderer. Use a no-follow directory descriptor and verify canonical
descriptor identity/containment, including parent aliases and swaps; close it on
every outcome. Limit streaming names/metadata before allocation; no recursive
enumeration. Sort captured entries directories first then bytewise name order.
Tracked and untracked/dot entries are visible; ignored entries remain dimmed and
labeled, `.git` is excluded. Git queries use fixed argv/literal paths with 1 MiB
output and 2-second deadline; classification failure yields unknown status, not
loss of the directory. Symlinks, gitlinks/nested repositories, special files and
invalid names are nonactionable. Do not read file bodies until activation. A
2 MiB file limit, binary/UTF-8/permission/missing errors use existing broker
behavior. Open path additionally rejects traversal through repository boundaries.

Keep only the active captured listing. Explicit navigation/Refresh reads it;
page/filter operations do not. Mark stale after five seconds or existing
relevant file/working-world hints; never automatically rescan on focus or timer.
Return typed failure while preserving the last displayed directory and offer
Retry/Up. Root startup failure must show unavailable, not an eternal loading
screen. Maintain only 32 navigation/camera records; old pages/history may require
fresh observation when revisited.

Then replace all fixed repository-graph reconstruction sites in the provider
with retained directory composition. Derive project ID/name from canonical root.
On unfamiliar repos keep missing service topology honestly unconfigured or
unavailable; do not require a build or seed FraudCheck nodes to browse. Add
repository controls and accessible ordered entries using the same bounded data
as the graph. Directory activation/Up/Back/page changes are deliberate navigation;
file activation reuses `openFile`. Exact relative Open path can address outside
the captured set and reveals its parent where possible. Buttons and scoped
keyboard actions share one intent controller. Task details alone never navigate;
only explicit Reveal does. Failed parent reveal does not destroy a successfully
opened source tab, and “outside partial slice” is not “file missing.”

Keep graph component keys stable. Save camera per directory/page (bounded 32);
explicit first descent/page frames once, Back restores. Refresh preserves camera
and surviving node positions; new entries get free positions. Source open,
service events, resize and 100/150 interface zoom never refit. Preserve exact
dirty text, logical cursor, tab identity and draft, not merely text length.

Finally prove actual packaged production against two owned repositories, review
to fixpoint and normal-merge. N1 is one owner/PR, no parallel departmental seam.
After ROOT verifies this vertical, filename search may become a separate bounded
consumer of canonical identity/path activation; it needs its own coverage/index
contract. Do not dispatch that consumer or contextual-view work from N1.

## Concrete Steps


After ROOT dispatch, work only in the explicitly assigned N1 worktree, not this
design branch or watched master. Start `repository-navigation` via Ditz. If
dependencies are not materialized, use:

    nix develop --command pnpm install --frozen-lockfile

Create a draft PR early, make granular commits and push. Add production/unit
regressions under Bazel, then run in the implementation worktree:

    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results

Implement a Bazel-owned `//tools/repository-navigation:smoke` target and run it
under that same lock. It must create its own Xvfb/Openbox display :90 and port
55174, launch the actual packaged application with its registered fixture root,
and close only its own processes. Do not inherit or automate the physical display.
Commands are a plan, not tests run by N0. Hosted CI is ignored/nonblocking by
user directive; do not query, wait, repair or claim it green.

## Validation and Acceptance


Unit/contract tests reject escapes, aliases, symlink/submodule traversal,
unsupported filenames, directory/file confusion, duplicate/dangling IDs, wrong
recipe paths and partial ambiguity. Prove bounded enumeration/output/deadlines,
empty/large/permission/deleted directories, classification failure, stale page
IDs, newer B beating slow A, and concurrent service publication preserving both
projections. Prove new protocols are wired into production, not just a fixture.

The owned packaged GUI proof must browse the real Swarm root to `core/files.ts`
and an owned unfamiliar committed Git repo. Create tracked, untracked, ignored
and hidden entries using real filesystem/Git operations. Exercise a >4,096-entry
directory, exact path outside the captured subset, deletion/invalidated refresh,
keyboard Enter/Up/Back and off-slice explicit Reveal. Pan both graphs; leave a
dirty source buffer and agent draft; traverse directories/files and refresh at
100/150 zoom. Assert unchanged service graph DOM/camera, exact dirty text/logical
cursor/draft, correct repo-camera restore and no resize refit. Fail on **any**
renderer exception. Record screenshot, structured assertions and cleanup=1.
Mocks are necessary regressions, not substitutes for this visible proof. No real
agent launch, credentials, runtime policy bypass or fixture called inference.

## Idempotence and Recovery


Navigation is read-only. Refresh retries observation, never a build or model
turn. Dispose obsolete directory handles/Git children and timers; retain source
and draft after failure or core replacement. Own temporary repositories and
virtual processes explicitly, preserve evidence and worktrees, never clear shared
stashes or kill unrelated listeners. Land only scoped commits through a normal
PR merge after local relevant gates and review; Ditz sync and successful push
are required. ROOT owns any integration lease or watched-app adoption.

## Artifacts and Notes


N0's exact scope is three new Markdown files plus CLI-managed Ditz metadata.
Record review, local whitespace/link/symbol checks, merge and open follow-ups in
its executive recap. N1 must retain actual packaged proof and local gate logs.
Do not close `repository-navigation` until useful behavior above is delivered;
close only `repository-navigation-contract-n0` for this design.

Revision note (2026-09-06): initial N0 plan corrects foundation accounting and
selects a single visible vertical over another infrastructure-only split.
