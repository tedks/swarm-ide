# Register known workers without hand-editing the observer registry

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can register an exact known Codex rollout, optionally resolve its
exact tmux pane, and see that session through the existing hierarchy, activity
and steering surfaces. Retirement removes tmux authority but keeps history.
Nothing launches an agent or sends a message. ROOT adopts the helper separately.

## Progress

- [x] (2026-09-08 01:44Z) Read scope, observer schema and exact handoff checks; claimed Ditz `session-registration-g1-20260907`.
- [ ] Implement shared schema extraction and bounded CLI with cooperating writer lock.
- [ ] Prove actual CLI concurrency and owned tmux identities through the existing observer.
- [ ] Native review to convergence, relevant local gates, push PR and hand off.

## Context and Orientation

`core/external-agents.ts` currently embeds a strict version-1 registry schema:
64 unique session IDs and rollout paths, bounded labels/context links, optional
exact tmux authority. It reads parentage from each rollout's first JSONL record,
not from operator descriptions. `core/external-agents-handoff.ts` validates a
socket/window/pane/PID/start-time/open-rollout tuple without controlling the
observed process. New code lives in `tools/session-registration`; the only
existing production edit extracts Registration/Registry into a core-only module.

## Plan of Work

First share the existing schema unchanged. Add a Node CLI bundled by a Bazel
target with register and retire operations. Registration reads only the first
bounded metadata line of an explicitly named rollout, or discovers one uniquely
open rollout beneath one explicitly named tmux pane. It never scans the account.
Missing/mismatched live identity yields historical-only registration when the
rollout is known. Final authority uses the existing handoff validator.

Use an owned mode-0700 registry directory, mode-0600 regular registry and stable
lock file. A finite `flock` acquisition on an inherited descriptor serializes
cooperating CLI writers; OS descriptor close releases the lock even on a crash.
Under that lock, read/validate/preserve unrelated rows, update by session ID,
revalidate bounds and publish a synced temporary file by rename. Never unlink
the stable lock. No transcript content belongs in the registry.

Next add controlled tmux holders and actual subprocess CLI tests, including two
concurrent writers. Read the written registry through ExternalAgentService to
prove integration, rather than adding new renderer code. Native review and
focused Bazel tests plus relevant typechecks/build are the final local gate.

## Concrete Steps

From the designated `session-registration` worktree:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test --jobs=3 //tools/session-registration:unit
    nix develop --command bazel run --jobs=3 //tools/session-registration:register -- --help

The public usage document will include opt-in post-spawn commands using the
existing rollout receipt and exact tmux pane; global spawn tooling stays intact.

## Validation and Acceptance

Actual CLI tests must show repeat registration yields one row, two concurrent
different registrations both survive, old metadata is preserved, retirement
keeps the row without tmux, malformed/oversized/insecure paths leave bytes
unchanged, and a closed or mismatched target never gets live authority. An
owned real tmux/file-holder process proves exact process/start/open-file checks;
the existing observer must read its registered parentage and activity. This is
controlled evidence, not a model turn or a live ROOT registry adoption.

## Idempotence and Recovery

All registry writes cooperate on a stable lock descriptor with a finite wait.
Crashes release the kernel lock. A crash before rename leaves the old registry;
after rename the command reports any durability uncertainty without retrying.
Private temporary files from a hard kill may remain for deliberate cleanup.
Repeating register/retire is safe, but callers never automatically send messages.

## Interfaces and Dependencies

Use existing Node built-ins, installed `tmux` and util-linux `flock`, Zod and the
existing validator. No new dependency, renderer contract or provider authority.
CLI stdout is one bounded JSON receipt containing action, session/actual parent,
changed status and checked-live versus historical-only authority, not transcript
text. Existing observer revalidates authority independently when sending.

## Surprises & Discoveries

The observer already derives true parentage from the rollout header; putting a
parent field in the registry would duplicate truth and violate its strict schema.

## Decision Log

Use one PR: the helper and schema extraction are one independently usable unit.
Prefer kernel-released descriptor locks over stale lock-directory recovery.
Require an explicitly private operator directory instead of silently changing
permissions on an existing registry. No UI proof is required to re-test unchanged
rendering when the actual existing observer proves the written format end-to-end.

## Outcomes & Retrospective

Implementation pending. ROOT retains normal merge and managed-window adoption.

## Artifacts and Notes

Step receipts and review evidence are under
`/tmp/swarm-ide-self-hosting.wkSErV/register-workers`; no transcripts are checked in.

Plan created for this bounded G1 increment; no broader runtime work is included.
