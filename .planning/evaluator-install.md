# Rehearse and document the evaluator installation


This ExecPlan follows `.planning/PLANS.md` and remains a living account of the
bounded L2 documentation and installation lane.

## Purpose / Big Picture


An evaluator should be able to clone the private repository, install its pinned
dependencies with Nix, open the actual desktop and its own source, and distinguish
missing optional data from a failed installation. The existing install smoke is
the real behavior proof; this lane does not invent another installer.

## Progress


- [x] (2026-09-07 21:32Z) Verified clean assigned branch `docs/evaluator-install`
  from merged `b1db2b9`; read common instructions and existing launcher/harness.
- [x] (2026-09-07 21:33Z) Started Ditz issue and unchanged installation smoke on
  owned display :134 / port 55214 with retained evidence.
- [x] (2026-09-07 21:38Z) Drafted README update and self-contained evaluator guide.
- [x] (2026-09-07 21:38Z) Smoke exited zero; three real-source cases passed with
  owned cleanup, and the checkout source screenshot was visually inspected.
- [x] (2026-09-07 21:38Z) Light native documentation review CLEAN, no findings;
  diff whitespace checks passed and initial documentation commit pushed.
- [x] (2026-09-07 21:40Z) Draft PR #62 opened; evidence and reviewed documentation
  complete for ready handoff. ROOT owns merge and final Ditz closure.

## Surprises & Discoveries


The README already contained a useful public launcher but described older feature
coverage and required building every target for first launch. The existing smoke
uses `//:desktop-bundle`, a smaller sufficient build. Opening the separate Build
graph also evaluates repository-controlled definitions; trust guidance must not
imply that only the Build button can execute repository-controlled loading.

## Decision Log


Decision: keep production and existing smoke unchanged unless an actual narrow
proof fault is observed. Reason: this lane owns evaluator documentation, not a new
platform. Date/author: 2026-09-07, L2.

Decision: the quick path fetches the local Ditz branch before first launch and
builds only the desktop bundle. Reason: tasks should work on a fresh clone without
an expensive unrelated test run. Date/author: 2026-09-07, L2.

Decision: record fresh local clone/new dependency directories and shared download
caches separately. Reason: a warm development machine cannot establish a cold
network or new-account installation claim. Date/author: 2026-09-07, L2.

## Outcomes & Retrospective


The unchanged install smoke passed at b1db2b9: desktop-bundle build, workspace
tests, missing-workspace/occupied-port refusal, and checkout/non-Bazel/Bazel target
GUI cases (21.1s/20.8s/18.1s after each desktop started). Each case recorded owned
cleanup. The external wrapper stayed unexecuted on opening and executed once on
explicit Build; all three source trees were clean. This is fresh local source
with warm download caches, not GitHub authentication or a cold-network test.
Native documentation review is CLEAN with no findings. Foreign seats were
intentionally omitted under the user Codex-only directive; no hosted-CI claim.
PR #62 carries the documentation; remaining action is ROOT's normal landing.
No product code, dependency,
credential, visibility or shared app changes occurred. ROOT owns normal merge
and final issue closure.

## Context and Orientation


`tools/dev-entry.mjs` implements the public `//:dev` launcher and validates a
committed Git root and free port before launching Electron. `tools/demo-install/`
already creates fresh temporary Git repositories, installs frozen dependencies,
and invokes that launcher on a privately owned virtual X11 desktop. The desktop
is a separate test display, not the user's existing window. The local Git branch
`ditz-metadata` contains the issue YAML records read by the IDE; a remote-tracking
ref alone is not sufficient. `README.md` is the short entry point and
`docs/evaluator-install.md` owns detailed setup and failure guidance. Another lane
owns `docs/demo.md`, so this lane links to it without editing its tour.

## Plan of Work


First establish the merged source's installation behavior with the existing smoke.
Then adjust README's tested scope and shortest launch command, and add the guide
covering prerequisites, private access, Ditz metadata, ports/workspaces and safe
stop/restart. Finally compare every advertised command to the launcher and actual
proof, obtain a light native review, push a ready PR and report boundaries to ROOT.

## Concrete Steps


All project commands run in the assigned feature worktree through Nix and Bazel.
The exact exercised installation proof is:

    SWARM_VIRTUAL_DISPLAY=:134 SWARM_VIRTUAL_DESKTOP_PORT=55214 SWARM_ARTIFACT_DIR=/tmp/swarm-ide-demo-polish.HjpljW/install-rehearsal/proof nix develop --command bazel run --jobs=3 //tools/demo-install:smoke

It must exit zero, open actual source in all three cases and record per-case
`cleanup_complete=1`. The guide reproduces the inner frozen install, desktop-bundle
build, Ditz fetch and dev commands. A local Git transport, not GitHub credentials,
is tested. Check the final doc diff with `git diff --check`; no product change
means no unrelated full-suite rerun is needed.

## Validation and Acceptance


Accept only actual successful self/non-Bazel/Bazel-target launch, real file opening,
unchanged occupied-port rejection and external-wrapper authority sentinel. Inspect
the source screenshot to verify visible evidence rather than just a process exit.
Run a light native documentation review for copyability, unsupported claims and
safe failure handling. Record exact proof scope, not a claim of all feature tests.

## Idempotence and Recovery


The smoke uses unique temporary directories and owns cleanup of its desktop and
clone's Bazel server; it retains checkouts/logs for diagnosis. Never kill shared
processes or retry an unchanged failure to relabel it fixed. Git metadata fetch
instructions are for a fresh/missing local branch and never force overwrite.
Only this lane's branch receives edits and pushes; ROOT merges and adopts it.

## Artifacts and Notes


Operational evidence is in
`/tmp/swarm-ide-demo-polish.HjpljW/install-rehearsal/`, beginning with
`install-smoke.log` and `proof/run.OrgZq0`. These local files are not release
assets and may contain local paths. The public guide gives reproducible relative
evidence locations instead of committing private evidence.

## Interfaces and Dependencies


No interfaces or dependencies change. Use the pinned flake, existing Bazel
desktop-bundle and demo-install smoke targets, Ditz CLI, and a native Codex review.
Foreign reviews are intentionally omitted by the current user constraint, not
claimed clean. Hosted CI is not a gate under the current local-only directive.

Revision note: updated with the completed installation evidence and native review;
the product remains unchanged and ROOT alone will merge the documentation.
