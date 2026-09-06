# Connect real repository tasks to the packaged cockpit

This living ExecPlan follows `.planning/PLANS.md` and records the bounded T3
integration. The designated branch is `feature/repo-task-integration`, based on
ROOT-reviewed normal merge `7642eb663565ce0e1f97590acf55e21b761c7320`.

## Purpose / Big Picture


A human opens Tasks in Work and sees the registered repository's actual local
Ditz backlog. Search, selection and literal details preserve the open source,
draft and graph cameras; only deliberate Reveal opens a declared working file.
The production application, including its unpacked archive, must serve these
revision-pinned reads without depending on the source checkout's node_modules.
This is read-only browsing, not task dispatch or attachment to an agent draft.

## Progress


- [x] (2026-09-06 15:09Z) Read repository instructions, approved design, reader/UI seams and ROOT-reviewed authority; materialize frozen dependencies.
- [x] (2026-09-06 15:09Z) State assumptions and split narrow deadline tests and CLI-fixture work into independent native helpers.
- [ ] Compose real task provider and package the isolated parser dependency.
- [ ] Prove task-only deadline and real CLI-authored pinned/cache/disposal behavior.
- [ ] Prove packaged application bridge and ordinary task UI on owned virtual X11, including source/draft/camera/keyboard preservation at 100/150 percent.
- [ ] Complete full local gates, provider-diverse review to fixpoint, normal merge, reviewed integration, Ditz sync and owned cleanup.

## Surprises & Discoveries


T1 intentionally leaves production composition unavailable. Its fixed worker
source string requires `yaml` through a resolved module path; the current app
archive does not contain that external module. A passing source-level test does
not prove packaging. The supervisor's existing five-second read timeout also
precedes the reader's ten-second whole-observation bound.

## Decision Log


Keep protocol v4 and every agent contract unchanged. Install the reviewed
constructor only at `core/worker.ts`; constructor failures retain the existing
unavailable fallback. Extend only `tasks.snapshot` and `tasks.read` to twelve
seconds, leaving file/agent timing and unknown-outcome protections intact.

Input metadata, Git configuration and source references are untrusted. Preserve
the reader's fixed argv, local-only revision pinning, parser isolation and
ceilings. Missing metadata must remain unavailable; invalid updates retain the
last good revision and never become an empty successful backlog. No renderer
provider selector or new metadata authority is introduced.

## Outcomes & Retrospective


Implementation and acceptance remain pending. Existing T1/T2 evidence establishes
the independent consumers, not this joined production behavior. Hosted namespace
prerequisites remain failed; the user's conditional local-gates waiver is not
a hosted-green claim. Watched master/app remains untouched throughout.

## Context and Orientation


`core/tasks/provider.ts` reads one complete Ditz observation from immutable local
Git objects and caches details at that commit. `core/tasks/metadata.ts` runs a
terminable worker program from `metadata-worker.ts` so parser stalls cannot
block core timers. `core/worker-runtime.ts` already has the typed `createTasks`
constructor seam and disposal. `app/renderer/tasks` already displays observations
and explicit source references; its behavior is frozen for this integration.
`tools/build-app.sh` builds the production archive; `tools/dev.mjs` provides the
stable-window hot-reload path. `app/electron/core-supervisor.ts` owns request
deadlines and process-generation correlation.

## Plan of Work


First connect the real provider, package its pinned YAML parser, and add focused
deadline regressions. Demonstrate the actual CLI's output against the real
reader in an owned temporary repository, covering ref advancement, expired
details, malformed updates, missing metadata and cancellation. Then add a
`tools/task-integration` Bazel-owned acceptance harness that unpacks the actual
production archive outside the checkout and drives its ordinary UI on an owned
virtual desktop. No production test hooks are needed. Publish screenshot,
structured revision/state/geometry assertions and cleanup evidence.

After all relevant local tests and independent review pass, normal-merge the
feature PR. The sole leased `integration/first-agent-run` checkout may consume
only ROOT-cleared committed heads and this reviewed landed result. Verify and
push that exact integration tree without moving watched master or its app.

## Concrete Steps


Work in `/home/tedks/Projects/swarm-ide/repo-task-integration`:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel build //... --jobs=3
    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //... --jobs=3 --nocache_test_results

The new task acceptance target and human launch command will be recorded here
when their executable entry points exist. All automated GUI commands must use
the existing owned Xvfb/Openbox harness, never inherited DISPLAY or user ports.

## Validation and Acceptance


New fake-clock supervisor tests must allow task reads beyond five seconds,
settle at twelve seconds, reject old/out-of-order replies, and preserve restart,
stop and non-task deadlines. Actual Ditz CLI authoring must produce metadata
that the registered provider serves with exact Git commit/blob identities.
Cheap checks report stale without adoption; explicit refresh adopts one new
revision. Invalid metadata leaves readable retained data and honest failure.

Actual packaged UI acceptance must see these same tasks without injected
metadata, show hostile text literally, explicitly reveal source through the
existing broker, preserve dirty cursor/text and graph/draft state, exercise
missing references and metadata failure/recovery, and prove all owned processes
are cleaned up. CodeMirror and React Flow node identities and camera transforms
are measured, not inferred from screenshots. Existing topology, agent journey,
rehearsal, external-process and policy tests stay enabled and unchanged.

## Idempotence and Recovery


Create one unique temporary directory per acceptance run and author only that
repository's metadata. Retain useful evidence; remove only owned temporary
processes/data after identity checks. Preserve feature/integration worktrees,
branches and sessions. Unknown or failed outcomes are not replayed as success.
Do not run a model, inspect credentials or activate any live-agent capability.

## Artifacts and Notes


Live seam: `/tmp/swarm-ide-task-integration-t3.n2TyZE/seam.md`. Final sanitized
handoff: `master/artifacts/overnight-wave/task-integration-t3/handoff.md`.
Record exact tested trees, local cache status, actual review verdicts, hosted
failures, Ditz status and owned cleanup. The completion recap is the final action.

## Interfaces and Dependencies


Preserve `createDitzTaskProvider: CreateTaskProvider`, `snapshot({refresh})`,
`read({metadataCommit,taskId})` and awaited `dispose()`. Retain pinned `yaml`
2.8.1 and all protocol/agent formats. `AgentLinks.task` remains a source path,
never a Ditz identifier. Later task-to-draft provenance is a separate contract.

Revision note: initial T3 plan records exact ownership, failure assumptions and
joined product/package proof before implementation.
