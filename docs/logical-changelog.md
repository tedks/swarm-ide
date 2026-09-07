# Logical changes: evidence to operator understanding

Journal compresses a recorded work span into a few expandable logical changes.
It is not a live agent transcript, scheduler, causal proof or telemetry feed.
The summarizer is a supervised external agent; the production IDE only reads
and validates its output. No provider capability or credential is enabled.

## The operational loop

From the Swarm IDE checkout, export a small real Git span from your target repo:

    nix develop --command bazel run --jobs=3 //tools/demo-journal:author -- export /absolute/target/repo EXACT_FROM_COMMIT EXACT_TO_COMMIT

Use full 40/64-character object IDs. The range includes the starting commit and
up to 24 first-parent successors. This captures actual commit metadata and up
to 32 changed paths per commit; it does not evaluate commit messages as facts.
The printed SHA-256 digest binds the exact `.swarm/changelog-bundle.json` bytes.
Optional `.swarm/changelog-reports.json` contains an array of explicit attributed
records in `JournalEvidenceSchema` (`protocol/changelog.ts`). Git observations
cannot be supplied through that file. Never insert private raw transcripts.

Give only the bundle, printed digest and `docs/journal-summarizer.md` to a
supervised agent. Ask it to return JSON satisfying `ChangelogDocumentSchema`.
Preserve the actual output as `.swarm/changelog-candidate.json`; the schema has
generator/run/instructions provenance, generated time and cited claims.
Do not label hand-authored or deterministic test output model-generated.

    nix develop --command bazel run --jobs=3 //tools/demo-journal:author -- validate /absolute/target/repo

Validation rejects unknown citations, wrong input digest, invalid schemas and
oversized artifacts before atomically materializing `.swarm/changelog.json`.
Open the target repo in Swarm: the existing Recent activity area contains the
compact logical-change feed. Click its heading to open the Activity document
in the main text area, or click an entry to expand who/on-what-task/actions and
evidence there. Source tabs and graph instances remain mounted. Click Refresh.
Exporting a newer
bundle invalidates an older generation: the UI retains the previous observation
with an error until a new valid summary is materialized. Current source links
explicitly open the working file, not the historical commit bytes. Dirty editor
buffers remain authoritative. Deliberately opening a source uses the existing
repository Reveal flow (the repository graph may navigate to that file);
unrelated graph cameras are not commanded. Inspecting and refreshing the
Activity document never navigates source or graph focus.

## Trust and scope

All narrative text is untrusted plain text. Citation validation proves that
an evidence ID exists, not that the prose is entailed by it. Generated claims
need human inspection; reconstructed relationships are explicitly labelled.
Recorded-check and agent-report items are attributed imported records, not
checks the IDE reran. Commit ancestry binds the recorded span to the opened
Git history, not to a particular worktree path; working edits are outside the
recorded span even when HEAD equals its end. Git/report paths omitted by bounds
are counted, and coverage/limitations are always inspectable.

No arbitrary path/command comes from renderer or artifact. Reader paths are
fixed; file reads reject symlinks, special files and path escapes. The author
command writes only two fixed filenames under a held canonical `.swarm`
directory descriptor. Explicit Refresh performs bounded reads, not a watcher.

The initial included Swarm story is a recorded task-context span. Its history
proof uses deterministic execution; it is not evidence of production model
launch. A supervised summarizer turn in the authoring session is real model
synthesis but does not establish an autonomous in-app summarizer.

## A one-minute walkthrough

1. Open Swarm's own checkout. Click Recent Activity for the Activity log, or select an entry.
   It opens expanded in the main text area, alongside retained source tabs.
2. Read the task-context story: design and base, deliberate one-slot attachment,
   pinned context resolution, then immutable admitted-history evidence.
   The cards distinguish earlier agent reports from later Git observations.
3. Expand Evidence to see the recorded agent/task IDs, source revisions and
   affected files. Open a working file deliberately; this is current source,
   not a claim that the old recorded bytes are still on disk.
4. Return to Activity log → Changes. Inspect the generation provenance or filter by
   an exact affected file. Refresh reads a newer validated artifact when one
   has been authored; it never launches an agent or submits a draft.

The included account was initially produced by a supervised gpt-6-astra
summarizer, then rewritten for clarity by the native Codex summarizer identified
in the document. Both used the same bounded exported Git observations and
explicitly supplied, sanitized reports; citation membership was preserved.
The current author's run and input provenance are in the document itself.
The generated account even notes an older design-status paragraph; that is a
recorded documentation discrepancy, not something the summarizer silently fixed.

The Bazel-owned `//tools/demo-journal:smoke` proof requires explicit authoring
inputs in `SWARM_JOURNAL_AUTHORING_PROOF`; it does not fabricate a model output
when they are missing. It exercises two real disposable Git revisions and
two actual supervised summaries through the packaged app on an owned virtual
desktop, including stale/invalid citation refusal and source/draft retention.
Synthetic unit fixtures test contracts separately and do not prove synthesis.

## GitHub pull requests

The Activity log's Pull requests view is a separate, explicitly refreshed GitHub
observation. Install the ordinary GitHub CLI (`gh`) and authenticate it normally
with `gh auth login`. Swarm does not read or copy token files. The opened checkout
must have one github.com `origin` using HTTPS or Git SSH syntax. GitHub Enterprise
and arbitrary repository selection are not supported by this first slice.

Click **Refresh PRs** to read up to 20 recent PRs across all states, with title,
number, author, update time and up to 100 changed-file paths per PR. Coverage is
shown; this is not the complete repository history or a CI/review verdict. File
buttons open the current working file, which may differ from or be absent in the
PR. URLs are selectable text, not unvalidated external navigation. No task/agent
relationship is inferred from proximity or matching names.

Reads use the installed `gh` behind the typed local core and the existing private
PID owner, so closing/killing the core also ends its GitHub command descendants.
This owns process lifetime, not a separate credential/filesystem/network sandbox.
The feature requires the same Linux `node`, `unshare` and `setpriv` tools already
used by the owned build-query path. Missing tools/auth, bad or moved origins,
malformed data and a four-second read deadline leave any previous same-workspace
result explicitly retained; core recovery requires a new deliberate Refresh.

The optional actual-network proof is `nix develop --command bazel run
//tools/activity-prs:smoke --jobs=3`, with `SWARM_VIRTUAL_DISPLAY` and
`SWARM_VIRTUAL_DESKTOP_PORT` set to an owned free pair. It uses the authenticated
GitHub origin of a disposable local clone, not a fake PR provider. Synthetic
unit data are labelled separately. It does not run in hosted CI automatically.
