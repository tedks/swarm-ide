# Reconcile newly appearing tmux agents while Swarm stays open

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this file in accordance with `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can open Swarm against one project and one tmux session, then start another supported Codex CLI in that same session and see its real worktree and recorded rollout ancestry appear in the already-open IDE. No restart, manual registration, model call, or process-wide scan is required. If an observed owner disappears or is replaced, Swarm retains its recorded conversation row but no longer treats the old pane/process identity as live steering authority.

The visible proof uses an owned disposable Git repository, worktrees, tmux socket, descriptor-holding Codex-shaped processes, and registry. It starts the observer first, creates a worktree and supported owner afterward, waits for the same registry to gain that session, then removes or replaces the owner and verifies that the history remains without stale tmux authority. These are controlled harnesses, not real model executions.

## Progress

- [x] (2026-09-11 01:16Z) Read the task/common instructions, repository instructions, planning rules, and relevant launcher, project, registration, observer, documentation, test, and build mappings.
- [x] (2026-09-11 01:16Z) Confirmed the designated clean worktree `feature/live-tmux-discovery` at base `f08c75d5` and wrote the required fresh-session startup note.
- [x] (2026-09-11 01:18Z) Added a focused regression and captured RED: 39 existing CLI tests passed and the new later-pane/worktree test failed at the original zero-owner one-shot exception.
- [x] (2026-09-11 01:28Z) Extracted one-scan registry reconciliation and added a non-overlapping, abortable installed-launch lifetime poller with serialized registry updates and rate-limited whole-scan errors.
- [x] (2026-09-11 01:31Z) Added asynchronous same-identity Git worktree membership refresh without changing explicit-versus-automatic project scope semantics.
- [x] (2026-09-11 01:33Z) Updated runtime, agent, install, evaluator, registration, and `.swarm/plans.json` source/target explanations to match the implementation.
- [x] (2026-09-11 01:36Z) Passed focused CLI/registration tests and packaging from the dedicated Bazel output root; the registration target includes one bounded owned late-worktree/tmux-owner observer proof.
- [ ] Push a ready draft PR, run the required provider-diverse council review to a clean convergence round, and address or file every finding.
- [ ] Update and sync Ditz, clean only owned resources, pull/rebase, push, verify the branch is clean/up to date, and write the final handoff artifacts.

## Surprises & Discoveries

- Observation: The renderer already polls `externalAgents.snapshot` every three seconds while visible, and the core reparses the configured registry on every snapshot.
  Evidence: `app/renderer/external-agents/client.ts` sets `registryInterval = 3_000`; `core/external-agents.ts` loads the registry for snapshot requests. Continuous tmux discovery therefore needs no renderer protocol or state mutation.

- Observation: `tools/cli/associateTmux` creates a new registry generation and scans once; a zero-agent scan throws, so even a valid explicitly selected empty session cannot remain open awaiting a later owner.
  Evidence: `tools/cli/tmux.mjs` throws when `registered.length` is zero, and `tools/cli/launcher.mjs` invokes it only before spawning Electron.

- Observation: Registration already preserves an old row when retiring by removing only its `tmux` field, and unchanged registration input avoids a registry rename.
  Evidence: `tools/session-registration/registry.ts` implements `retire` by destructuring away `tmux`, compares serialized before/after state, and publishes only when `changed` is true.

- Observation: Recurring worktree discovery could not safely reuse the synchronous startup helper because it would block the launcher's event loop and delay signal handling.
  Evidence: Production now uses `refreshProject`, which runs fixed-argument Git subprocesses asynchronously with timeouts and a shared abort signal; the owned integration proves a post-start worktree is admitted.

- Observation: The broad living-design bundle has an unrelated planning-UI failure even though its index parser and component graph tests pass.
  Evidence: `//tools/living-design:checks` reported 89/102 passing, including all 60 `plans-reader`, all 13 component-stability, and all 15 living-design tests; 13 failures were confined to untouched `planning-ui.test.tsx` and `demo-plan-actions.test.tsx`, whose mocked reads returned “Could not read the plan.”

## Decision Log

- Decision: Place the reconciler in the installed CLI process rather than Electron main, local core, or renderer.
  Rationale: The launcher already owns the selected tmux and project scope and remains alive until Electron closes. The observer already rereads the registry. This keeps privileged discovery outside the sandboxed renderer and requires no new protocol.
  Date/Author: 2026-09-11 / Codex

- Decision: Resolve the socket and numeric tmux session ID once, then use only that canonical socket and exact session ID on later scans.
  Rationale: A session name, pane label, or new server at a reused socket path must not silently broaden or transfer authority. Socket ownership/canonical path and inode identity are checked again.
  Date/Author: 2026-09-11 / Codex

- Decision: Recompute accessible worktrees from the original Git common-directory identity before each automatic scan, but leave explicit tmux selection without the automatic same-project allowlist.
  Rationale: New linked worktrees must appear without restart. Automatic selection has always excluded other projects in the current tmux session, while explicit project/session flags intentionally select them independently.
  Date/Author: 2026-09-11 / Codex

- Decision: Keep registry rows as durable history and retire only their `tmux` target. Treat a whole-scan failure as inconclusive, immediately retire a row when its pane is authoritatively absent or a checked replacement is admitted, and tolerate one present-pane discovery miss before retirement.
  Rationale: Exact handoff checks already fail closed immediately for dead/reused identities. One grace miss avoids permanently changing the useful record during a short rollout/process race; retirement itself is reversible and does not delete history.
  Date/Author: 2026-09-11 / Codex

- Decision: Keep the existing 64-session/65,536-byte generation bounds for this increment.
  Rationale: They are shared observer safety contracts. Long-running generations can eventually fill with history; changing archival/schema policy is a separate design decision and will be recorded as a concrete boundary rather than hidden scope expansion.
  Date/Author: 2026-09-11 / Codex

## Outcomes & Retrospective

Implementation and task-owned verification are complete before council review. A running `ExternalAgentService` observed an initially empty generated registry, then saw a controlled descriptor-backed owner created in a new tmux window and new linked worktree, with the rollout header's actual parent ID. Repeating the scan retained the registry inode and modification time; removing the pane retired only live authority; disposing the reconciler left the selected tmux session alive. The existing 64-session/65,536-byte per-generation capacity remains the declared boundary and will receive a follow-up issue rather than an unreviewed schema/archive expansion.

## Context and Orientation

`tools/cli/launcher.mjs` parses the installed `swarm` command, prepares a project, optionally associates a tmux session, puts a private registry path into `SWARM_EXTERNAL_AGENTS_REGISTRY`, spawns the fixed Electron bundle, forwards termination signals, and waits for Electron to exit. `tools/cli/project.mjs` resolves a project identity: for Git repositories that identity is the canonical common Git directory shared by linked worktrees. Its `discoverProject` function lists and validates current worktrees.

`tools/cli/tmux.mjs` resolves either an explicit named tmux server/socket and session or the current tmux socket/session. `selectPanes` uses fixed tmux arguments and caps a selected session at 64 panes. `associateTmux` currently creates a private registry generation, discovers supported owners once, derives each owner’s canonical working root, and invokes the bundled session-registration API.

The registration API is bundled from `tools/cli/registration-api.ts`, `tools/session-registration/identity.ts`, and `tools/session-registration/registry.ts`. A supported owner is proven by the exact same-user process ID and Linux process start time, ancestry back to the selected tmux pane, and an open descriptor for the exact Codex rollout JSONL file. The rollout header provides the session UUID and optional `forked_from_id`; it is the only automatic logical parent evidence. Tmux window names, process ancestry, timing, labels, and the fact that panes share a server do not establish logical hierarchy.

The registry row stores the rollout and optional checked tmux target. `updateRegistry({ action: "retire" })` removes only that target, preserving the session ID, rollout, label, worktree context, and therefore readable history and header ancestry. `core/external-agents.ts` still validates the exact handoff immediately before terminal selection or message queueing, so a stale, exited, replaced, or PID-reused owner cannot remain steerable merely because a prior row exists.

`app/renderer/external-agents/client.ts` polls the core for the registry snapshot while the UI is visible. Once the launcher keeps updating the same configured registry, a running window sees new rows automatically. Caller-provided `--agent-registry` and `SWARM_EXTERNAL_AGENTS_REGISTRY` paths bypass tmux association and must remain untouched. Each tmux-associated invocation continues to create a new generation so a restarted application does not silently mix a different server/session into older saved scope.

## Plan of Work

First extend `tools/cli/tmux.test.mjs` around an injectable reconciler seam. The initial regression will establish an association against an empty or one-owner selected session, change the returned pane set and project worktree set after startup, trigger another scan, and expect a new registration in the same registry. Separate cases will assert unchanged scans yield no registry changes, a transient scan/discovery failure does not erase history, confirmed disappearance or replacement retires the prior target while preserving the row, non-agent and wrong-scope panes remain excluded, exact socket/session identity cannot drift, concurrent timer ticks never overlap, and disposal prevents new work and drains the in-flight owned work.

Then refactor `tools/cli/tmux.mjs` into three small responsibilities: create one private empty association registry, perform one bounded scan/upsert/retirement reconciliation against a retained exact tmux selection, and schedule scans serially until disposal. Discovery of panes may remain bounded-parallel, but registry mutations will be ordered so duplicate IDs cannot create nondeterministic authority. Whole-scan failures retain the prior active set and are surfaced through a rate-limited launcher callback. Expected per-pane skips stay summarized instead of becoming repetitive log noise.

Add abort propagation only where needed for reconciler-owned `tmux` and registration work. Disposal will clear the timer, abort the current scan, await its completion, and never signal an observed Codex/tmux owner. Before any post-await registry mutation, the scan will check that it is still current. Existing fixed process, descriptor, socket, rollout, ownership, size, and time bounds remain the authority boundary.

In `tools/cli/launcher.mjs`, build a refresh callback from the original project identity. For automatic current-tmux association it will provide the newly validated worktree allowlist; for explicit selection it will refresh project data only for exact bare-parent mapping and keep the existing independently chosen session semantics. Start the poller only after a tmux association has configured the child registry, stop it in the launcher's `finally`, and leave explicit/saved registry launches unpolled.

Update `docs/design/runtime.md`, `docs/linux-install.md`, `docs/evaluator-install.md`, and `docs/session-registration.md` to describe continuous bounded scans, exact retained scope, worktree refresh, historical retirement, disposal, failure/grace behavior, and the controlled proof. Update the runtime component in `.swarm/plans.json` if source paths or target roles change; do not alter unrelated peer mappings.

## Concrete Steps

All commands run from `/home/tedks/Projects/swarm-ide/live-tmux-discovery`. Project tooling runs only through Nix and Bazel.

After adding the initial regression, run:

    nix develop --command bazel test --jobs=3 //tools/cli:checks

The new live-discovery case should fail against the one-shot implementation for the expected missing API/behavior, while existing checks remain interpretable. After implementation, run:

    nix develop --command bazel test --jobs=3 //tools/cli:checks //tools/session-registration:unit

Then run the relevant package/type gate through its declared Bazel target:

    nix develop --command bazel build --jobs=3 //tools/cli:registration-bundle //:desktop-bundle

Use one owned disposable end-to-end harness, either within `//tools/cli:checks` or a narrowly declared Bazel target if isolation requires it. It must create its own temporary Git bare repository and worktrees, tmux socket/session, rollout descriptors, registry, and processes. It must never use display `:0`, the Goals registry/profile/processes, ROOT's application, or a production model. Expected evidence is: the initial registry is observable; a later worktree plus pane/owner adds a row with that exact `contextRoot` and header parent; an unchanged scan does not alter registry bytes/metadata; removing/replacing the owner makes the old row historical-only and admits the replacement; disposing the watcher leaves the external holder alive and performs no later scan.

After implementation and documentation commits, push the feature branch and update its draft PR. Run the provider-diverse council review according to the repository skill, using the native Codex seat and foreign Claude Sonnet and agy seats. Fix all Critical/Important findings, resolve or file every other actionable finding, and rerun review only on each fix delta until a round is clean. Run relevant tests after each material fix.

Finish with:

    git pull --rebase
    nix run github:tedks/ditz -- comment swarm-live-tmux-discovery "<implemented behavior and verification>"
    nix run github:tedks/ditz -- sync
    git push
    git status --short --branch

The Ditz issue remains in progress for ROOT to land. The last status must show a clean branch up to date with its origin. Remove only temporary sockets, worktrees, processes, displays, and files created by this worker.

## Validation and Acceptance

The focused regression must demonstrate the original limitation before implementation and pass afterward. The changed behavior is accepted when the same live reconciler and same registry discover a supported owner and a worktree created after association; metadata-derived `forked_from_id` remains the only hierarchy evidence; repeated unchanged scans cause no publication; one transient whole-scan or present-pane discovery failure preserves the prior row; confirmed absence, out-of-scope ownership, or checked replacement removes stale tmux authority but preserves history; unrelated sessions/projects and non-agent panes are never registered; socket/session replacement stops reconciliation rather than transferring scope; timer callbacks cannot overlap; and disposal prevents further writes while leaving external agents and tmux alive.

The launcher tests must also show that caller-provided registries keep their previous behavior, automatic selection retains its same-project filter with refreshed worktrees, explicit tmux flags retain independent project/session selection, and zero-agent initial association can open a watched empty generation. Existing `//tools/session-registration:unit` checks must continue proving exact same-user PID/start/pane/open-rollout identity and checked handoff rejection.

## Idempotence and Recovery

Creating a new association generation is intentionally not idempotent across app launches; rescanning within one launch is idempotent because `updateRegistry` publishes only changed rows. Registering the same session again refreshes exact live fields without duplicating its ID. Retiring an already historical known row is unchanged. A whole-scan failure leaves registry/history as-is and the serial scheduler retries after the normal interval with rate-limited reporting.

If the selected tmux socket inode or numeric session identity changes, the reconciler fails closed and does not adopt the replacement. Restart Swarm with explicit selection to create a new generation. If the 64-row or byte bound is reached, existing history remains unchanged and later admissions report a bounded failure; archival beyond that existing observer contract is follow-up work. Disposal can be repeated and awaits only commands the reconciler owns.

## Artifacts and Notes

The task-owned evidence directory is `/tmp/swarm-ide-live-awareness.UonFxG/discovery`. Keep `seam.md` current, record commands/results and owned cleanup in `verification.md`, and finish `final-recap` with the exact required marker. Do not place private rollout content, registries, session IDs from unrelated live agents, or model output in the repository.

## Interfaces and Dependencies

`tools/cli/tmux.mjs` will export an association/reconciler interface usable by `launcher.mjs` and deterministic tests. The returned association retains `registry`, canonical `socket`, numeric `sessionId`, `registered`, `skipped`, and `terminalCommand`, plus a polling lifecycle with asynchronous disposal. Its scan inputs include a callback returning the current validated project object and optional automatic `allowedRoots`. Timing, command execution, registration API, and root resolution remain dependency-injectable for tests.

`tools/cli/project.mjs` remains the only Git worktree enumerator. `tools/session-registration/identity.ts` and `registry.ts` remain the only owners of live process/rollout validation and atomic private registry changes. No new npm dependency, renderer request, provider abstraction, OS process tracer, model inference, or tmux naming convention is introduced.

Revision note (2026-09-11 01:16Z): Created the initial self-contained plan after source orientation. It chooses a launcher-lifetime reconciler because the existing observer already refreshes registry state, and records exact selection, retirement, disposal, and capacity boundaries before implementation.

Revision note (2026-09-11 01:37Z): Updated progress, discoveries and outcomes after implementation and owned verification. The recurring project refresh became asynchronous to preserve launcher responsiveness; exact RED/GREEN and the unrelated broad planning-test failure are retained for handoff.
