# Repository navigation: first useful slice

Implemented by N1 in PR37 after ROOT accepted N0 at `abf149d`. The actual
packaged Swarm and unfamiliar-repository journeys pass; final local gate and
normal-merge records belong to the PR and executive handoff. See the living
[implementation plan](../.planning/repository-navigation.md). N2/PR39 adds
[bounded filename search](repository-file-search.md); an interactive project
picker remains separate.

## Human journey

Open the registered Swarm IDE working tree. The repository graph shows its root
and immediate children, including `app/`, `core/`, `protocol/`, and `docs/`.
Activate `core/`, then `files.ts`: the existing source editor opens that file.
The service graph stays mounted, with exactly the same camera. Up and clickable
breadcrumbs return to ancestors; Back returns to the previous directory/page.
Directory browsing does not close or replace source tabs. Repeat on an owned,
unfamiliar Git repository containing no FraudCheck directory.

Tab reaches the repository controls and an accessible ordered entry list;
Up/Down selects an entry, Enter activates it, Alt-Up ascends and Alt-Left goes
Back **only while repository navigation owns keyboard focus**. Editor, palette
and agent-draft bindings retain ownership elsewhere. A directory activation
navigates; a file activation calls the existing source opener. No generic
“every focus path is a file” shortcut. Ctrl-K offers Repository root, Up,
Refresh, and an exact repository-relative Open path command. Filename search
across the repository is now the bounded N2 consumer of this same activation path.

## Identity, observations and limits

The registered root comes from privileged startup, never renderer input. The
initial scope is a local Git working tree with a valid committed HEAD; an invalid
root reports unavailable rather than waiting forever. Canonicalize the root once;
derive project identity from that canonical root and display its basename, not
`project:swarm-ide`. Root/HEAD registration must not await the whole-world
fingerprint: a dirty-world limit or unsupported filename leaves navigation usable
with explicitly unavailable working/build evidence, never fabricated green truth
or agent admission. Root directory path is `""`; other paths are canonical,
case-sensitive relative slash paths, without empty, dot, parent or backslash
segments. Never derive authority from labels. Node identity includes entry kind
and encoded relative path under the registered project; it survives refresh and
revision changes. Renames are remove/add in this increment.

A slice contains its current directory and at most 200 immediate children, with
contains edges only. Breadcrumbs live outside the graph. Capture at most 4,096
directory entries and 1 MiB of names/metadata; use bounded streaming enumeration,
not unbounded `readdir` followed by truncation. Sort the captured set directories
first, then bytewise path order, and page it. Stop at the cap and explicitly say
“partial directory”; never imply this is a complete or globally sorted inventory.
A local name filter searches only that captured set. Exact Open path remains
available for an entry beyond the cap. No recursive filesystem scan or Git
descendant expansion on a focus change; Git classification has bounded output
(1 MiB), time (2 seconds), fixed argv and literal paths, never a shell command.

Show tracked and untracked entries, including dotfiles. Tracked files remain
visible even if a current ignore rule matches. Ignored entries are visible but
dimmed and labeled; do not descend them automatically. `.git` administration is
omitted whether file or directory and rejected as a navigation path segment.
Directories are labeled as directories, not
falsely wholly tracked/untracked. If bounded Git classification fails, keep the
filesystem listing with an explicit unknown Git-status notice. No Git fetch,
write, checkout or hook execution belongs to navigation.

Symlinks, submodules/nested repositories and special files are visible but not
traversable/openable here. Detect repository boundaries without interpreting their
configuration as commands. Regular files are *eligible* for the existing broker:
UTF-8, no prohibited binary control bytes, at most `MAX_EDITABLE_FILE_BYTES`
(currently 2 MiB). Do not read every file to classify it. Binary, invalid UTF-8,
oversize, permission-denied or deleted files produce explicit errors on open;
existing dirty buffers remain intact. Invalid/non-UTF-8 filenames get a bounded
escaped unsupported-entry notice, never a lossy actionable alias.

Reuse `core/files.ts` containment and error authority. Directory enumeration adds
the analogous no-follow directory descriptor check: the opened descriptor must
still identify the requested canonical directory beneath the root, including
parent-alias/race checks, before publishing. Never follow a symlink or descend a
submodule through Open path. Listing is advisory; `file.read`/`file.write` remain
the authority at actual use. A failed directory change retains the previous
slice, names the failed request and offers Retry/Up; deleted current directories
do not silently redirect focus.

An observation has its own ID, directory, capture time, completeness and
`loading | observed | stale | error` state. It is not an atomic repository-wide
snapshot or Bazel fingerprint. Capture on explicit navigation/Refresh; retain one
directory observation, page without rereading, and mark it stale after 5 seconds
or a relevant existing file/working-world hint. Refresh is explicit, not a timer
that rescans. Close handles and bounded Git children, and invalidate obsolete
requests on navigation/core replacement. Late A must never replace newer B.
Retain a bounded 32-entry camera/history cache, not an unbounded directory cache.

## Coordinated projections, not coupled lifetimes

Keep topology IDs `repo` and `service` stable. Explicit descent/page change may
frame the new repository slice once; returning restores its saved camera.
Refresh preserves the camera and surviving-node positions. Resize, interface
zoom, file activation and service publication never refit either graph. A
directory observation has neutral observation styling, not a green build dot.
Service yellow/red and its last consistent artifact remain unchanged by browsing.

Opening a path from a service link, task **explicit Reveal**, or exact Open path
requests its parent slice and selects it if present. It must not synthesize nodes
outside the listing budget: if captured, reset the local filter and select its
page; if genuinely uncaptured, report “outside this partial directory capture.”
Reading task details alone still moves neither graph. Unrelated task/agent-draft
state, dirty text, cursor and source tab identity are preserved.

`WorkspaceSnapshot` currently rejects every mapping candidate whose `nodeId` is
absent. Preserve that rule for loaded targets. Extend candidates additively with
an exclusive alternative `revealPath` for **repository file** targets; validate
canonical path equality with the candidate's repository focus, disallow both
fields or neither, and retain all candidates when computing ambiguity. A
`revealPath` is a navigation recipe, not a fictitious node or read permission.
The provider emits `nodeId` only when that target is in the current slice;
otherwise it emits `revealPath`. The adapter highlights loaded nodes and offers
off-slice links without claiming a unique match merely because one is visible.
Explicitly following a recipe loads the parent slice and then revalidates the
file. Old recipe revisions are rebound only through an explicit current-working
navigation action, never relabeled as new build evidence.

## One implementation owner, then consumers

N1 is one reviewed vertical PR: typed directory request/observation and mapping
changes, bounded core reader, provider composition, renderer navigation and real
packaged proof. Shared protocol changes are its first commit, not a separately
declared product completion. No independent core/UI builders until these coupled
semantics work together. [Foundation closure](foundation-closure.md) preserves
the subsequent order: file finding, contextual information, meaningful views.

Later filename search may reuse canonical entry identity and explicit path
activation after N1; it needs its own bounded index/query contract and honest
coverage. Symbol search, global project picker, function/call/service semantic
drilldown and plugin discovery are not smuggled into N1.

## Implemented coordination details

Protocol v5 uses `repo.list` with an optional exact parent-scoped `revealPath`
to select a captured off-page file. No fabricated node is needed for an exact
path outside a partial capture. Initial registration uses `unobserved:<root
SHA256>` coordination IDs with an empty working fingerprint; these IDs are not
content evidence. `working.evidence = unavailable` also revokes a retained old
digest after a later observation failure. Green publication and agent context
preparation/revalidation remain denied until genuine observation recovers.

Repository presentation keeps one latest coherent pane frame and commits it
before node measurement. Core events still reduce normally; headers, controls,
nodes and camera intent are presented together. Service rendering is unchanged.
This removes rapid page-replacement ResizeObserver errors without suppressing
errors, remounting graphs or granting local graph deletion.

`//tools/repository-navigation:smoke` verifies the ordinary packaged main,
preload and core on owned virtual X11. It covers two committed repositories,
4,096-entry partial coverage, actual CLI-authored Ditz Reveal, exact dirty
source/cursor/draft retention, both cameras and 100/150 zoom. Separate invalid
filename and fingerprint-budget cases prove degraded browsing with denied
context authority. All four cases passed at `5af87b8`, with zero renderer
errors and all owned processes cleaned up. No model execution is claimed.
