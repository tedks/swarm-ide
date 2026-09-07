# Explicit file-to-Ditz backlinks

Q3 is **design only**, based on Q2 normal `7562668`. Nothing in this document
publishes backlinks yet. ROOT must evaluate this contract before authorizing the
single Q4 implementation in [the ExecPlan](../.planning/task-backlinks.md).
The broader [foundation gaps](foundation-closure.md) remain open.

## Useful behavior and assumptions

Inspect a file and see the actual tasks whose structured Ditz `file_refs`
mention that exact path, even if none of those tasks has been opened before.
Choose a row to inspect the referenced task revision. Source, dirty text,
logical cursor, agent draft and graph cameras do not move. This is another
instrument about the inspected file, not another graph or a dispatch queue.

The local metadata branch is an independent source of truth. A recorded link
does not prove that today's file exists, contains the reported bug, belongs to
the task, or is represented by a build. Task text remains untrusted data.
No metadata writes, task-to-draft enrichment, agent launch, wiki rendering,
inferred callsites or application adoption are authorized by Q3/Q4.

## Reuse one observation, publish one bounded association set

`core/tasks/provider.ts` already scans and parses the complete bounded issue set
at one commit and atomically caches summaries and details. `TaskSummary` currently
has only `counts.fileRefs`; renderer discovery by fetching details would be
incomplete or expensive. Q4 adds optional `backlinks` to `TaskSnapshot` in
`protocol/tasks.ts`, constructed from those already validated details during
the existing full refresh. No additional Git command, parser, worker or timer.

The wire representation is a canonical flat association list, reversed once in
the renderer into a path index. It does not repeat descriptions, titles, notes,
line offsets or blob IDs already available in the same snapshot/cache:

    TaskBacklinks =
      { status: "complete", entries: TaskBacklinkEntry[] }
      | { status: "unavailable", reason: "projection-limit" }
    TaskBacklinkEntry = {
      taskId: TaskId,
      refIndex: integer,  // zero-based index in that task's literal fileRefs
      path: string,
      navigation: "candidate" | "unsupported"
    }

For a complete set, include **every** explicit `file_refs` entry, including
unsupported paths and duplicates. Order by full task ID (code-unit order), then
`refIndex`. Runtime validation requires exact one-to-one coverage of each
summary's `counts.fileRefs`, contiguous indices from zero, no foreign IDs or
duplicate pairs, and literal path/navigation validation matching
`TaskFileRefSchema`. All identities, commit and observation time are inherited
from the containing snapshot; issue blobs come from its exact summaries.
The renderer trusts the validated provider's projection, not task prose; a
requested detail must additionally agree with its projected paths/classification.

The complete source scope is all explicit references in the entire successfully
parsed local metadata revision, including closed tasks, independent of sidebar
filters. There is no independently refreshing association cache. A successful
scan atomically replaces summaries, details and backlinks together; its existing
after-scan ref check may mark that internally consistent revision stale.

## Exact ceilings and compatibility

Projection, envelope and cache byte limits count UTF-8 `JSON.stringify` bytes,
including escaping, keys, punctuation and array/object overhead. Existing scalar
text/path limits remain raw UTF-8 string-byte limits, not character counts.

| Boundary | Q4 decision |
| --- | --- |
| Existing reader/detail capacity | Unchanged: 256 issues, 32 refs each, 1,024-byte paths, 64 KiB detail-result envelope, 16 MiB normalized base cache. No truncation. |
| Projection | At most 8,192 entries and **256 KiB** for the entire `backlinks` value. The byte limit will normally bind first. |
| Original task payload | Strip only `snapshot.backlinks` and enforce the existing **512 KiB** snapshot/observation/result budget, including worst-case retained failure reason and sequence. Do not take backlink bytes out of existing task capacity. |
| Augmented payload | Snapshot, observation and **whole `TaskResult`** each at most **784 KiB**: 512 KiB base + 256 KiB projection + 16 KiB explicit structural reserve. Provider preflights the full retained-failure envelope with maximum sequence width, 512-byte reason, dates and registered identities. Receiver independently validates actual bytes. |
| Normalized cache | Existing base snapshot/details accounting stays at 16 MiB after stripping backlinks. Whole augmented serialized cache at most **16 MiB + 272 KiB**; projection also independently at most 256 KiB. |
| Display | At most **32 distinct tasks** for the focused path, sorted by full ID; show `Showing N of T tasks` and per-task explicit-reference count. This is a display cap, never a coverage cap. |

If the extra projection cannot fit, publish the new usable task snapshot with
`{status:"unavailable",reason:"projection-limit"}` and **no entries**. Do not
keep old backlinks under new summaries, emit a partial success, or reject a
previously admissible task roster merely because its backlinks overflow. If the
base reader/metadata itself fails or exceeds its old limits, use the existing
failed-attempt state and retain the old whole snapshot with old provenance.

The 784 KiB cap is on the task-result envelope, not a fabricated cap on the
entire IPC message: `CoreResponse` also carries an independently validated
`WorkspaceSnapshot`. Q4 measures the complete task-bearing response in boundary
tests and asserts its added bytes are the serialized task value plus its field
overhead; it must not duplicate backlinks in the workspace. Establishing a
global byte ceiling for every workspace projection is separate work, not hidden
inside this slice. Existing request correlation and task-only 12-second outer
deadline remain unchanged.

Strict v5 receivers reject unknown snapshot fields; this is not a rolling-wire
compatible extension. Q4 increments `PROTOCOL_VERSION` **5 → 6** and updates
schema-bound fixtures/version expectations together. v5/v6 mismatches fail
explicitly; no dual-protocol path or global schema leniency. A v6 snapshot may
omit `backlinks` (older mocks or restored state): that means **provider has not
published associations**, never a complete empty set. No persisted data becomes
fresh by migration. A given provider lifetime must not change missing/complete/
unavailable content for the same commit; replacement requires a new validated
connection lifetime and observation, not an in-place compatibility exception.

## Matching, coverage and evidence

Index only entries satisfying **both** `isTaskSourcePath` and
`isRepositoryPath(path)` (non-root). These existing grammars differ, notably for
`.git` components and some Unicode; do not loosen either or normalize strings.
Match case-sensitive literal equality to the canonical repository-relative
`ContextSubject.path`. No basename, prefix, glob expansion, rename following,
directory/service aggregation, Unicode folding or prose extraction. A literal
`*` in an otherwise supported filename is a literal character, not a pattern.

Each distinct matching task is one row, even with several refs to that path.
The relation is **Explicit file reference**, not ownership, blame or readiness.
Docs are ordinary referenced text files; Ditz has no structured source-versus-doc
role, so Q4 does not infer one from extension or note. Unsupported references
remain literal in task detail and are excluded from actionable file matching.
Opening a task grants no filesystem authority; a later explicit Reveal still
uses the existing contained-file broker and current-working-file warnings.

Section evidence names provider `ditz`, repository/world, local metadata ref,
algorithm-tagged metadata commit, producer `observedAt`, last local-ref check
time and exact coverage. Each task row exposes its full ID and algorithm-tagged
issue blob through accessible evidence/details, without copying full details.
The matching file identity remains separate from source digest/buffer generation,
build fingerprint and deployment revision.

A complete empty lookup says **“No explicit file references in observed metadata
M”**, with the named scope and time; it does not say “No bugs.” When stale, say
**retained metadata M** instead. Unobserved/loading without a snapshot,
missing/invalid/partial metadata, projection-limit, disconnect and failed refresh
never become empty success. Partial parsing is a failed full observation, not a
partial backlink index. An old complete set can remain visible through failed
refresh, but latest attempt status/reason and retained provenance stay prominent.

Freshness requires a connected, validated task observation at its checked local
ref with no client/transport error. While refresh is pending, label the previous
set retained/checking; do not clear an existing failure warning. A later ref-only
check cannot erase a failed full-scan warning. A reconnect marks retained data
stale until its existing initial full observation succeeds. Source edits, cursor
movement and build green cannot refresh Ditz evidence. “Observed” describes the
last successful check, not a guarantee that the branch cannot move next.

## Once-per-publication indexing and consumer visibility

Keep one bounded `Map<path, task rows>` keyed by provider/repository/world,
connection epoch and commit plus canonical association content. A ref-only check
may update timestamps/status but reuses the accepted index. Repeated file/cursor
movement does only a map lookup; no task detail fanout, scanning, ref check or
unbounded per-path memoization. Same-commit summary **and association** mutation
(including coverage mode, entry order/content) is `INVALID_CORE_MESSAGE`: reject
the replacement, retain prior data with an error, and revoke pending navigation.
Legitimate check/observation timestamps are not immutable content. Dispose or
replace the client lifetime to drop its index and pending authority.

One existing `TaskBridgeClient` serves the sidebar, task document and Context.
Its existing visibility input becomes the union of visible task consumers:
sidebar Tasks, visible task document/detail, or visible file Context backlinks.
Respect the window's document visibility too. Compact Context must not depend
on the hidden sidebar to become observed. Opening the first consumer in a client
lifetime permits the existing initial full observation; subsequent consumer
switches reuse it and only false→true aggregate visibility/window focus invokes
the existing cheap ref check. Coalesce through the same in-flight request and
single 5-second ref-check timer. Never schedule per-path/cursor work or a second
timer. Explicit **Refresh tasks** in Context uses the existing refresh method
without selecting a task, opening sidebar panes, or switching Context. If all
consumers become invisible stop the timer; recovery does not force a pane open.

## Deliberate revision-pinned activation

Replace the stringly task variant of renderer `ContextLink` with the shared
runtime-validated `TaskBacklinkTarget`: provider/repository/world, task ID,
algorithm-tagged metadata commit and issue blob. The click also captures the
current file subject, attention generation, navigation intent, client epoch and
index identity. Use a new **pinned inspection** client path, not `select(id)`
(which reconciles against whichever snapshot is newest).

Before requesting detail, require a connected adopted snapshot and exact match
of every target field and summary blob, with a still-valid complete association
to the captured path. Recheck after awaiting the existing `tasks.read` with the
clicked commit; it remains a cache read, never a historical object scan. Validate
the detail against summary/blob and that task's projected reference entries.
Cache expiry, changed commit, mismatch, invalid response or newer user intent
must leave the existing source/task presentation and attention unchanged, with
an explicit **“Link revision unavailable; refresh and select again”** notice.
Refresh is a separate action; never automatically retry at a newer revision.

The pending click leaves the current subject/doc intact. Only a successfully
validated result whose tokens still match may atomically adopt the pinned detail
and inspect the task in Context. Ordinary click/Enter **does not open a document
tab**; the existing deliberate Show task document gesture can do so using that
same pinned detail. Return to source information returns to the retained active
source; task-only document Return/close keeps the existing UI sprint behavior.
No source Reveal or graph `focus.select` is sent by task inspection.

Pin the resulting task selection, not just the request. Background task refresh
may mark that visible detail retained/stale but must not substitute a newer
commit under it. Explicit selection from Tasks may leave pinned mode; using
Refresh alone cannot. An open pinned task document and its Context share the
pin. Reopening it after a refresh shows the retained revision notice, not silently
rebased contents. No multi-revision core cache is added: the UI already retains
one detail, and an expired pin requires reselecting from a current observation.

Retained links can inspect the exact still-cached revision while connected, with
the stale warning intact. Unknown transport/invalid-message state blocks new
inspection until refreshed; domain stale/failed-attempt evidence is not by itself
permission to call it current. A concurrent refresh may expire the cached commit:
the pinned read then fails visibly. Every later intent, even A→B→A, invalidates an
earlier pending click. Connection/core generation replacement cancels old tokens
even when repo, path and commit strings repeat. No late response can steal focus
or resurrect a tab. Keyboard activation follows native button behavior; pending
or failed work never moves keyboard focus asynchronously.

## One next vertical, with a hard implementation gate

Q4 should have **one owner** across protocol/provider, task client, Context/App
and packaged acceptance: bounds, selection and visibility share these seams.
There is no useful independent UI builder before the atomic projection and pin
are settled. Native read-only reviewers/test auditors can work independently.
Use existing schemas/YAML worker, no dependency or global tooling changes.

Q4 must show an actual CLI-authored, previously unopened task appear for its
file through packaged main/preload/core/UI, then deliberately inspect that exact
task while source/draft/cameras survive. Same-basename and prose-only negatives,
stale/failed refresh, malformed/missing/overflow/unsupported metadata, reconnect,
same-commit mutation and revision/attention races must be proved at their honest
layers. The ExecPlan specifies the finite proof; Q3 claims **no new executable,
GUI, provider or model evidence**. ROOT evaluation, local gates and substantive
review precede Q4 landing; hosted CI remains ignored and human canvas55175 stays
untouched. D2, wiki/instructions, generic build links and live-agent admission
remain separate unimplemented gates.
