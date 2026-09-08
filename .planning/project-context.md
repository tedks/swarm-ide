# Discover useful context automatically

This ExecPlan is maintained according to `.planning/PLANS.md`. Progress, discoveries, decisions and outcomes below remain current as the implementation proceeds.

## Purpose / Big Picture

Opening a project should show the running development servers and containers that actually belong to it, with usable links, status and resource use. The IDE should infer these from existing package manifests, process metadata and Docker Compose ownership, rather than asking users to configure each repository. A scan of the user's existing projects supplies examples, not a hardcoded whitelist.

## Progress

- [x] (2026-09-08 04:41Z) Confirmed isolated feature worktree and started `swarm-project-context`; two bounded native inventory helpers launched.
- [x] (2026-09-08 04:49Z) Recorded actual project inventory; chose generic Node/socket and Compose ownership defaults.
- [x] (2026-09-08 05:06Z) Implemented validated observation, providers and standalone panel. Native review converged after finite Docker metadata admission, pinned daemon and retained-source fixes.
- [x] (2026-09-08 05:10Z) Added only the coordinated import/panel mount and native HTTP(S) browser handoff in this worktree. ROOT still owns merge/adoption; no peer files or shared app changed.
- [x] (2026-09-08 05:12Z) Verified 38 focused tests plus both typechecks and shell/JavaScript syntax; native review converged. Actual packaged Node/HTTP link scenario passed in 664ms with zero renderer errors and owned cleanup. PR is pushed; ROOT owns normal merge/adoption.

## Surprises & Discoveries

Pure Sky's development frontend runs from a Bazel runfiles directory. A process-cwd-only match would omit it; the implemented detector follows the exact output symlink and source backlink. The actual probe found its Node PID2018898/port5173. Goals has three real healthy containers in effort-pace-model and none attributable to master. Existing Chaos containers reference old absent worktrees; they are correctly not assigned to current checkouts.

Native review found that a cancelled filesystem read can still occupy a native worker; repeated refreshes must not enqueue more indefinitely. Docker metadata admission now remains closed until that read settles. A lost Docker connection retains that provider's last readings and original timestamp independently of Node discovery.

## Decision Log

Use existing manifests and concrete process/container ownership for automatic defaults. Missing cloud authentication does not block local instruments. No project scripts, credentials, environment dumps or container mutations are needed. Data is observed runtime state, not build or deployment truth.

## Outcomes & Retrospective

Core discovery is implemented and demonstrated against real Pure Sky/Goals runtime metadata. The panel is connected through production main/preload/core and the typed bridge. An actual disposable Node listener appeared automatically and a real native click reached the browser handoff; the test recorded that handoff without launching a browser. All 38 focused tests and typechecks passed, and scoped native review reached a clean fixpoint. The virtual desktop and test processes were cleaned. ROOT still owns normal merge and managed-app adoption. Python/FastAPI and cloud observations remain filed follow-ups, not live integrations.

## Context and Orientation

`core/worker-runtime.ts` owns privileged request dispatch. `protocol/schema.ts` validates bridge requests and their corresponding results. `app/renderer/context/GlobalContext.tsx` is the intended neighboring widget, while a separate `ProjectContextPanel` will avoid changing existing Context attention and source selection. `BUILD.bazel` already includes new core, protocol and renderer files in `//:quality_sources`.

## Plan of Work

Record a concise private project inventory with evidence paths, then implement generic Node and Docker detectors under `core/project-context/`. A dedicated protocol describes timestamped server/container observations and partial or unavailable coverage. The renderer panel requests observations only while its opened repository and core are current, retains stale values on temporary failure and clears them on identity change. Coordinate the small App mount with C7. Keep actual design documents and graph mappings aligned with the touched repository/runtime components.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/project-context`, materialize dependencies using `nix develop --command pnpm install --frozen-lockfile`. Implement the files above and run focused tests through a new `//tools/project-context:checks` Bazel target with `--jobs=3`, then build `//:desktop-bundle`. Use an owned virtual X11 display and unused port for a packaged observation of a disposable project. Never automate physical `:0`.

## Validation and Acceptance

The panel must list a genuine local server or matched container, while unrelated processes/containers are absent. Manifest-only values cannot appear as live measurements. Changing repository or core generation must prevent late observations from populating a new project. Tests exercise missing commands/access, finite reads, cancellation, partial scans and invalid metadata. Focused native review checks these boundaries and the maintained component docs before ROOT lands the PR.

## Idempotence and Recovery

All discovery is read-only. Requests coalesce, expire and stop with the core; no background daemon is installed. Failed observations keep their last timestamp as stale only within the same project. Test processes/displays use owned disposable paths and are cleaned by their owner. Existing repositories and the managed app remain untouched.

## Artifacts and Notes

The worker's concise handoff files are under `/tmp/swarm-ide-project-context.4Mi48a/`; `seam.md` identifies integration boundaries, and later inventory/verification files record actual findings and proof.

Actual packaged evidence is also retained in `artifacts/project-context-proof/project-context/run.F0luLM/`. The scenario reports `realNodeServer: true`, the exact browser handoff URL, zero renderer errors and 664ms elapsed. The enclosing owned virtual harness reported `cleanup_complete=1`; physical `:0` was never automated.

## Interfaces and Dependencies

Use Zod for the new `projectContext.observe` request/result. The request carries repository and world identity, never arbitrary filesystem roots or executable commands. Node filesystem APIs and bounded fixed Docker read commands live only in local core. The renderer consumes typed data and uses small reusable server/container rows. No new package dependency is intended.

Revision note (2026-09-08): updated the living plan from intended discovery through observed runtime behavior and focused verification. Native review drove endpoint pinning, retained-source timestamps, bounded abandoned filesystem reads and complete Bazel verifier input declarations. No broader provider framework was added.
