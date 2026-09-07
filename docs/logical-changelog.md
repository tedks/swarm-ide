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
buffers remain authoritative and independent graph cameras stay in place.

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
