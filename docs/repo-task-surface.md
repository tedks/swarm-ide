# Repo-native task surface

Status: D1 design only. The first implementation delivers **real task browsing
and explicit source navigation**, independently of provider availability. A
separate, subsequent contract gate adds task provenance to an agent draft.
Neither is implemented by this document. See the
[execution plan](../.planning/repo-task-surface.md).

## The useful increment

Replace the unconnected “Dispatch queue” placeholder with **Tasks** in the work
panel. Read this repository's actual Ditz titles, states and dependencies. Select
a task to inspect its description and explicit file/document references without
moving the editor, source cursor or either graph camera. Choose **Reveal** on a
reference to open its working file through the existing source observatory.
An open task is a planning artifact, not a queued run or proof that work is ready.

The initial filters are text over title/ID and Open / All; Open means every state
except `closed`, not “ready.” Sort by full ID for deterministic initial behavior.
Show real `unstarted`, `in_progress`, `paused`, `closed`, type and component. A
count names the loaded snapshot/filter, never an inferred dispatch queue.

Task detail occupies an explicitly selected information-panel view, with a
**Return to source information** action. Existing source and agent draft state
remain mounted. Clicking source returns its instruments to source information;
the task selection stays retained in the work panel. On compact screens, use
the existing Work / Information panel controls; do not invent another overlay.
Task selection may select that information view but must not steal keyboard
focus or automatically open a hidden compact pane. Provide a deliberate
**Show task details** action. Native buttons, labelled filter input, Tab and
Enter suffice initially; add palette commands for Tasks and Refresh tasks,
without installing new global shortcuts.

## Ground truth and supported Ditz shape

The canonical identity is `(registered repository ID, provider "ditz", full issue
ID)`. A particular observation adds the full `ditz-metadata` commit object ID
and issue blob object ID. Git object IDs are algorithm-tagged SHA-1 or SHA-256,
not the application's SHA-256 working fingerprint. Never use an issue title,
prefix match, source HEAD or file path as task identity.

Read-only inspection on 2026-09-06 found installed `ditz 0.1.0-ocaml` supporting
`list --json`, `show ID --json`, `ref ID PATH[:LINE] --note ...`, `blocks` and
`deps`. JSON contains `id`, `title`, `desc`, `type`, `component`, `status`,
`disposition`, `file_refs`, `blocks` and `blocked_by`, among other fields.
`file_refs` is an array of `{path, line: integer|null, note: string|null}`;
`references` is a different array of strings and is not promoted to file links.
Existing metadata may omit `file_refs`, `blocks` or `blocked_by`; these mean
empty arrays. The observed repository had 79 issues before creating D1 and no
structured file references: an honest “No explicit file references” is useful.

The inspected local Ditz source at `3e2a5800794c316541da8c575481ced4a30fea17`
(`ocaml/lib/types.ml`, `storage.ml`, `git.ml`) corroborates this shape. It is
source evidence, not a claim that the installed executable was reproduced from
that checkout. Its list reader loads individual files from the moving branch
and logs/skips parse failures. The installed list/show help exposes no commit
selector. Consequently the product must not turn a bare successful CLI list
into a complete, revision-consistent observation.

## One bounded metadata reader

Use a local-core read adapter over **Git objects**, not a Ditz checkout, remote
service or new database. Resolve only `refs/heads/ditz-metadata` in the registered
repository to commit `M`; enumerate `.ditz` at `M`, then read validated regular
blob IDs from that tree. Require a valid `.ditz/project.yaml` and matching
`issue-<full-ID>.yaml` names/IDs. Missing local metadata is `unavailable`, never
an empty successful list. Do not fall back to origin or a working `.ditz` folder.

Use fixed argv, no shell, explicit registered Git context and a scrubbed Git
environment. Disable replacement objects and lazy fetching; disallow transport
protocols for these reads. No object fetch, hooks, checkout, filters, external
diff, text conversion, auto-sync or renderer-supplied ref/root/argv. Missing
objects are unavailable. Bind all paths to tree entries and use their object
IDs for `cat-file`; don't concatenate untrusted task IDs into revision syntax.
Reject symlinks, submodules, nested issue directories, duplicate IDs, unsafe
names, invalid UTF-8, conflict markers and invalid field shapes.

Add a pinned direct `yaml` 2.x dependency during the shared base, not this design
step. Use its document API and inspected syntax tree, not a home-grown YAML
parser. Require one document, unique scalar string keys, no aliases, explicit
tags, merge keys or dangerous object keys, bounded nesting/node count, and strict
projection validation. Check parser errors before conversion and sanitize
diagnostics without quoting task contents. The [parser documentation](https://eemeli.org/yaml/)
describes document errors and syntax-tree inspection; the implementation must
test its exact pinned version. Unsupported metadata fails visibly, not by
silently skipping an issue. Unused fields, including people/logs, are never sent
to the renderer; bounded ordinary values can be ignored after syntax checks.

Prototype ceilings: 256 issue blobs plus project metadata; 64 KiB per blob;
16 MiB total input; depth 16 and 8,192 syntax nodes per blob; 256-byte ID and
component; 512-byte title; 16 KiB description; 32 entries in each dependency
direction and 32 file references; 1,024-byte link path and 512-byte note. Count
UTF-8 bytes. Publish at most 512 KiB of summaries and 64 KiB for one detail.
An exceeded ceiling is `limited`, not “all tasks loaded.” Do not silently shorten
the description or drop refs to fit. A future indexed reader can lift the roster
ceiling; this prototype is not yet a Google-scale task index.

One scan at a time, no queued refresh backlog, owned Git subprocesses with a
5-second command / 10-second whole-observation deadline and bounded output.
Reuse the last normalized snapshot; details come from that same snapshot, not
new moving-ref reads. Cache only the latest successful snapshot (at most 16 MiB
normalized data); older detail requests return `TASK_REVISION_EXPIRED`.

## Observation and change

First Tasks opening requests one local observation. **Refresh tasks** explicitly
requests another. A core-side 5-second ref-only check while Tasks is visible,
plus a check on reopening/window focus, can flag advancement; it does not parse
every issue again. Cursor movement and source/build events do not scan metadata.
This is inexpensive product invalidation, separate from ROOT's push-completion
orchestration. A newer ref marks the retained observation stale; Refresh adopts
it. An explicit snapshot response includes its check time: “Observed at M; local
ref checked at T,” never a guarantee that another commit cannot happen next.

Read the branch again after a scan. If it advanced, the snapshot at `M` is still
internally consistent but marked stale; do not relabel it with the newer commit
or enter an unbounded retry loop. Build green has no effect on task freshness.
Working source and deployed versions remain separate observations.

The read model distinguishes `unobserved`, `loading`, `observed`, `stale`,
`unavailable`, `malformed`, `limited` and `error`. Retain any last successful
snapshot with its original revision, plus the latest attempt status. A valid
project with zero issue blobs is the only unfiltered successful empty backlog;
zero filter matches says “No matches.” An unreadable/absent ref never becomes
empty truth. Core generation and task observation sequence reject late responses;
Git commit hashes are not sortable sequence numbers. Reconnect marks cached data
stale and requests one fresh observation; it never dispatches an agent.

Dependency rows show recorded IDs and states from `M`, with missing endpoints,
cycles or one-sided `blocks`/`blocked_by` records flagged as inconsistent. Do not
repair metadata or infer readiness. Clicking a dependency selects its task only.

## Explicit file and document links

Only `file_refs` becomes a source-navigation candidate. A doc is opened as a
source text file in this release, not rendered HTML or another graph node. Do
not infer paths from prose, fetch URLs, expand globs or traverse directory trees.
Display unsupported references literally with an explanation, not as links.

Normalize nothing silently: paths must already be relative to the opened source
root, with no absolute prefix, scheme, control characters, backslash, empty,
`.` or `..` components. `line` is null or a positive safe integer. At Reveal,
route through `file.watch`/`file.read` and the canonical contained-file broker;
a syntactically valid reference is not proof that the file exists. Missing,
nonregular, binary, too-large and escaped files retain the task and report the
existing typed error. If the line no longer exists, open the valid file with a
visible “referenced line unavailable” notice, without inventing a location.
Show “Opens current working file; link recorded at metadata M.”

Do not overwrite a dirty source tab or bypass its read/save lifecycle. For an
already-open dirty buffer, retain its cursor and explain that the recorded line
cannot be located reliably until source is saved/current; never treat unsaved
line offsets as an exact metadata link target. Successful
Reveal uses the existing explicit file-navigation mapping: the repo projection
may follow, the service camera stays put, and ambiguous mappings remain choices.
Multiple refs are individual choices, never an inferred default attachment.

## Later explicit task-to-draft contract gate

The bounded D2 decisions and subsequent implementation gates are now specified
in [Attach a pinned repository task to a source draft](repo-task-draft.md) and
its [execution plan](../.planning/repo-task-draft.md). These are design, not
delivered attachment behavior; ROOT evaluates them before builders proceed.

First release stops before draft enrichment: no inert “Dispatch” button. The
next gesture will be **Attach this task to draft**. It captures the user's fixed
working-source target, independently of task selection; if there is no unique
supported target, ask for an explicit source choice. Existing draft text must
not be overwritten: offer an inspectable append/replace/cancel choice and clear
preparation/confirmation when accepted. Neither attaching nor refreshing launches.

The current six agent commands stay six. However, `AgentLinksSchema.task` is a
normalized source path, **not** a Ditz ID. Do not smuggle a metadata identity
into it or make up a fake repo file. A subsequent shared-contract owner must add
an optional typed task reference to `agent.prepare`, immutable launch context
and durable validation together before context/UI consumers work in parallel.
That reference needs repository/provider/full ID, metadata commit and issue blob
identity; the core rereads/resolves it, not renderer-asserted authoritative text.

The core materializes bounded title/description into a clearly separated task
data section, recording exact bytes/digest and provenance in the submitted
context hash. Links do not auto-attach their targets. Preserve the current
16 KiB task and 128 KiB total explicit-context limits; oversize composition is a
visible error, never silent truncation. At prepare and launch revalidation,
require the same metadata commit and issue blob as well as current source and
config evidence. Unrelated metadata commits conservatively require refresh and
confirmation in this first extension. A running or historical run retains its
original context when Ditz later advances; it does not rewrite history.

Task text, docs and repo instructions are untrusted data, not permission to read
arbitrary paths, change executable/model policy, run Ditz or grant new tools.
`ADAPTER_POLICY_UNAVAILABLE`, unknown admission/cleanup, no replay, disk-only
attachments and deliberate launch confirmation remain intact. No model output
can automatically start/close a task or change its dependency graph.

Writes, automatic queues, recursive plan generation, live authority changes,
wiki publication, plugin frameworks and multi-worktree task aggregation are
explicitly deferred. This slice connects one real intelligence consumer to the
cockpit without pretending the rest already exists.
