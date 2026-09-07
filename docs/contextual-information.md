# Context: facts about this thing, links to its evidence

Q0 is a design-only gate based on PR39, `0313fa7`. It does not deliver these
instruments. ROOT must approve the Q1 implementation described below before
dispatch. [The executable plan](../.planning/contextual-information.md) supplies
the next slice; [foundation accounting](foundation-closure.md) remains open.

## The first useful result

Open `core/files.ts`, then
`examples/checkout-world/services/fraudcheck/fraudcheck.ts`. Context identifies
each exact file and its observed source state. Only the second receives the
service relationships supported by the built example artifact. Neither receives
invented deployments, latency, bugs, or lessons. The first may have separate,+visibly dated captured Bazel references; these are not current ownership.

Context is composed from intrinsic facts and relationships to independently
meaningful artifacts. It does not make files, tasks, builds, and services one
kind of graph node. Keep the user-approved Directory/Agent runs/Tasks sidebar,
enclosing-directory map, independent graph/document tabs, wider resizable
Context, and simultaneous three-part bottom dock. No new layout/configuration
engine, pinning, graph remounting, automatic builds, or agent calls belong here.

## Attention is explicit, not whichever response arrived last

Introduce one renderer `ContextSubject` chosen by the last deliberate semantic
inspection. It identifies repository and world plus a file path, directory path,
service/interface identity, graph edge identity, task identity, or no selection.
File identity is the exact validated repository-relative path, never a label,
basename, symbol text, or a service focus's optional path. Revision belongs to
each observation, not to the permanent file identity.

| User action | Context authority |
| --- | --- |
| Activate a source tab, explicitly open a file, or interact with its visible editor | That exact foreground file, even if a different graph item remains selected. |
| Inspect a graph node/edge or a directory | That explicit graph/directory subject, even while source remains visible. Editor focus later returns attention to that file. |
| Select a task, Show details, or activate its document tab | That exact task. Detail must match task ID and its independent metadata revision. |
| Begin asynchronous Reveal | Prior subject remains; show a pending notice, not the candidate's facts. Only a successful, still-current foreground activation changes the subject. |
| Hover, pan, resize, palette typing/highlight/Escape, background file loading, task refresh, or graph publication | No change of subject. New evidence may refresh only the existing subject. |
| Close the inspected document | Choose the document deliberately made foreground by the close operation; otherwise the explicitly selected graph subject, or “Nothing selected.” Never resurrect the last file as a hidden fallback. |

The Context header always names its subject and kind. Existing source/task
display controls become events into this decision, rather than a second,
competing attention store. Keep navigation intent and core generation checks.
`Show system graphs` is a deliberate graph inspection, not permission to alter
source selection. A failed open leaves prior attention intact; an already open
file that becomes unavailable keeps its identity and retained buffer notice.

## Exact Q1 instruments

**Source.** Show full path, editor state, last broker-read content SHA-256, and
whether current text is an unsaved buffer. A locally assigned buffer generation
identifies edits; it is not a Git, build, or deployment revision. Label the hash
“last read from working file,” not “current disk” after observation loss. Loading,
deleted, unreadable, conflict, and uncertain save remain distinct. Do not add
language inference, Git history, file size telemetry, or cursor metrics in Q1.

**Service relationships.** Exact membership in a published artifact's
`implementationPaths` supports “Implementation member of FraudCheck” and its
declared owning target. Exact `interfaceDeclarationPaths` membership supports
“Declares provided/required interface” with the recorded request/response types
and related service identity. These are different relations: `payments.proto`
declares a required interface, not a FraudCheck-owned implementation. A file can
have both relations. Do not use directory proximity, the adapter's preferred
file, or stringified widget values to infer membership.

The current producer covers one validated example target, not all services in
the repository. An unmatched path says “No association in the retained example
artifact; other service coverage unavailable.” An unbuilt/unavailable producer
says so. Neither says “This file has no services.” Implementation and interface
links open their recorded source paths; the known manifest may be identified as
“Service configuration,” not conflated with implementation or RPC definition.

**Captured build references.** Reuse `fileBuildTargets` on the checked-in capture
only when its registered repository ID matches. Say “Direct references in
CAPTURE,” with capture revision, date, and command available inline/details.
Absence means no direct references in this capture, not no current owning
targets. This does not turn the Build lens into a live provider. Do not use the
capture's package endpoints as precise source definitions.

**Task attention.** Reuse `TaskDetail` for literal type/status/component,
dependencies, and explicit source references. Its metadata commit and issue blob
remain separate from working source and builds. Missing/malformed/limited/stale
details retain their existing honest states. For file attention, reverse task,
bug, design, and lesson lookups are explicitly unavailable in Q1: task summaries
contain counts, not a complete reverse index. Do not fetch every task detail on
each file selection or show only the last selected task as a supposed backlink.

**Other subjects and unsupported facts.** Directory inspection uses the matching
observed directory page and its coverage, not service summary widgets. Service,
interface, and edge inspection may use the same exact service evidence when
identity matches. The edge is a declared requirement, not an observed call.
Deployment/runtime/function metrics and knowledge links share a compact
“Providers not available” notice; absent data is never numeric zero or an
assertion that nothing is deployed. Explicit demo cards stay in a separate,
conspicuously MOCK-labelled block, never mixed into factual sections.

## Minimal ownership seam: publication, then local composition

The current defect is `RealWorkspaceProvider.selectFocus` in `core/provider.ts`:
it appends `serviceWidgets` to every path. `adaptServiceTopology` in
`core/service-topology.ts` already consumes the required typed artifact but
publishes a lossy, global `Widget[]`. `WidgetSchema` has neither a subject nor
coverage; its single provenance revision cannot represent this panel.

Add `protocol/context.ts` with a runtime-validated `ServiceContextObservation`
and typed `ContextSubject`, `ContextEvidenceRef`, `ContextLink`, and
`ContextSection` contracts. Add an optional `serviceContext` to
`WorkspaceSnapshotSchema`; absence is unavailable, for compatibility with old
snapshots and mocks. Do not change `FocusRef` domains or overload Widget values
with serialized objects. The optional publication contains one retained service
record, exact implementation/declaration associations, and build evidence; it is
not an arbitrary graph or plugin registry.

`adaptServiceTopology` returns this typed observation from the already validated
artifact. `RealWorkspaceProvider` publishes it atomically with that artifact's
graph and built revision, retains its original evidence during working changes,
and does not retag it through `retagSnapshot`. Declared manifest identity must
come from the existing validated producer, not renderer path guessing. Invalid
or oversized contextual material yields a typed unavailable observation without
claiming coverage or destroying unrelated browsing. No second filesystem read,
Bazel invocation, Git scan, context RPC, or worker is necessary.

Each fact/link inherits a section evidence reference only when all its values
share that reference. Separate sections when they do not. Evidence must name
provider, repository/world, origin URI or artifact identity, revision kind/value,
observation time, availability/freshness, and coverage scope/completeness.
Permitted evidence kinds are broker source observation, local buffer generation,
built artifact plus its source fingerprint, dated capture, and Ditz commit/blob.
An unsupported section has a reason, no invented revision/value. Capture coverage
is explicitly unknown outside its recorded entries. A declared target's complete
artifact is not complete repository coverage. An empty row set is “known empty”
only inside a named complete scope; partial/unknown never becomes zero links.

In `app/renderer/context/`, a pure subject reducer and composition function join
these independently validated inputs. Renderer-local buffer facts never cross
into privileged evidence. Reuse existing task client/read contracts and source
broker; source bytes are not copied into another request. The new panel replaces
unconditional `snapshot.widgets` and duplicate “Truth source” rendering for real
subjects. Legacy widgets may remain on the wire for compatibility, but cannot
serve as a factual fallback. Do not change existing graph layouts or build-follow
semantics to achieve this correction.

## Bounds, stale data, and races

Validate a maximum of one service record with the existing artifact ceilings:
64 implementation paths, 64 declaration associations, 32 provided and 32 required
interfaces. Paths use the canonical repository path contract. Cap the serialized
contextual publication at 256 KiB; overflow is unavailable, not a truncated
success. A capture adapter accepts at most 4,096 links and 1 MiB; reject excess
without copying or repeatedly indexing it. New fact labels/reasons are bounded
to 512 characters, paths to existing path limits. Render at most 32 relationship
rows per section with an explicit partial-display count. This is not a claim of
unbounded monorepo scalability.

Build reverse indexes once per accepted publication/capture identity, replacing
the previous indexes. There is one current index per source, not a per-path cache
that grows forever. Source lookup uses already-open tabs; task detail uses the
existing bounded TaskBridgeClient. No new timers, asynchronous lookups, scans,
or requests are driven by focus/cursor changes, so there is no new cancellation
protocol. Disposing/replacing the view drops its indexes and subscriptions.

The subject reducer increments an attention generation. Existing async source
activation/detail results must match repository/world, subject identity, request
intent, and live core generation before they can change attention or populate
it. Pure composition rechecks the subject on every render; an old A result never
fills B, including A→B→A and source/task switches. A different repository/core
generation clears current authority; retained historical evidence is explicitly
stale until current inputs have been revalidated. HMR/restored state is not new
evidence. Do not restore a green badge from persisted UI memory.

A built relationship is current only when working evidence is observed, its
input fingerprint exactly equals the current working fingerprint, and the
matching publication remains green. Dirty editor text gets an additional
“Unsaved buffer is not represented by this build” warning; it does not change a
disk-derived graph into a measurement of the buffer. Yellow/red keep last-built
facts with their original build hash/fingerprint. Unavailable fingerprint keeps
those facts historical, never green even if strings happen to match. A source
deletion/error similarly prevents claiming that retained relationships describe
the current file. Capture stays CAPTURE forever; Ditz freshness follows its own
observation, not the service reconciliation epoch.

## Link gestures and deliberately missing callsites

Use typed links: source path plus relation/evidence, task ID plus metadata
commit/blob, or an exact existing graph identity. These are destinations, not
commands, HTML, arbitrary URLs, file-read authority, or model instructions.
Explicit source activation reuses the broker-backed Reveal path and checks the
current destination; failure preserves source, logical cursor, draft, and
attention. Dirty existing buffers are retained and labelled, never overwritten
to match an old link. Unrelated graph instances/cameras do not move; the repo
view may deliberately reveal the activated file under existing navigation rules.

Q1 offers labelled implementation and interface-declaration links. It does not
change service single-click into source opening or implement call highlighting.
A later small consumer can make the user's service-click gesture open the
explicit recorded definition with ambiguity choices. There is no exact callsite
consumer yet: `Payments.Authorize` is declared by the manifest, while
`fraudcheck.ts` contains no matching call expression and no Payments
implementation. Keep `ui-service-source-navigation` open. A call highlight
requires a real source digest and range provider plus revalidation; declaration
edges cannot satisfy it.

## Implementation decision for ROOT

Approve **one Q1 owner** for publication, attention, panel, and its packaged
acceptance. These changes share `App.tsx`, snapshot validation, and selection
semantics; a contract-only base followed by nominally parallel consumers would
add an integration round without an independent useful result. Narrow read-only
review helpers are useful, separate builders are not yet justified.

Q1 closes only the ordinary-file/mapped-file Context acceptance, not the entire
`contextual-information` or `ui-context-linkages` roadmap. Later reverse Ditz/docs
providers, live build links, service-click navigation, meaningful lenses, and
scoped configuration require separately approved slices. First settle real
evidence and its attention contract; only then add composable layouts and deeper
hierarchies. Real-agent policy/credential/process gates remain entirely unchanged.
