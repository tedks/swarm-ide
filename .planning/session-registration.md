# Register known workers without hand-editing the observer registry

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can register an exact known Codex rollout, optionally resolve its
exact tmux pane, and see that session through the existing hierarchy, activity
and steering surfaces. Retirement removes tmux authority but keeps history.
Nothing launches an agent or sends a message. ROOT adopts the helper separately.

## Progress

- [x] (2026-09-08 01:44Z) Read scope, observer schema and exact handoff checks; claimed Ditz `session-registration-g1-20260907`.
- [x] (2026-09-08 01:54Z) Shared schema/CLI implemented; PR78 pushed116073c and discovery correction58559a2.
- [x] (2026-09-08 01:54Z) Actual CLI concurrency, lock owner SIGKILL, owned tmux and existing observer integration: focused61 and all typechecks passed20.4s.
- [x] (2026-09-08 01:59Z) Real known G1 read-only metadata registration proved exact ROOT parent/checked-live, idempotent repeat and retirement in disposable registry only.
- [x] (2026-09-08 01:59Z) Final61/typechecks PASS20.6s and desktop bundle PASS4.7s on02f1b0f; Nix resolves declared tmux3.7c. Native code/dependency/test convergence CLEAN.
- [x] (2026-09-08 02:03Z) Docs receipt clarification native CLEAN; implementation ready for ROOT handoff, with normal merge/adoption ROOT-owned.

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

Native review found Linux children lists are per task, not per process. The
first regression was1RED/59PASS (local2.log); bounded all-task enumeration and
direct pinned-PID validation fixed it. A second mixed-holder ambiguity regression
was added with the correction; it is green, not separately historical RED.

The Nix shell had relied on ambient tmux. ROOT approved precisely adding tmux
to flake.nix and the source-only root Bazel edge for this package. No lockfile
or unrelated environment changes. The outer Nix shell's startup banner is not
part of the CLI JSON receipt and is documented as such.

## Decision Log

Use one PR: the helper and schema extraction are one independently usable unit.
Prefer kernel-released descriptor locks over stale lock-directory recovery.
Require an explicitly private operator directory instead of silently changing
permissions on an existing registry. No UI proof is required to re-test unchanged
rendering when the actual existing observer proves the written format end-to-end.

Explicit PID means exact validation, not discovery; it needs no descendant scan.
Automatic discovery enumerates at most32processes/256tasks/256FDs per process
within a finite deadline. An incomplete scan yields no steering authority.

## Outcomes & Retrospective

The operational vertical works through the real CLI and existing observer. No
renderer, provider or trusted-run contract was changed. Actual G1 metadata was
read-only; no product model turn, message or live ROOT registry edit. Final
relevant gates and native code convergence passed. Documentation distinguishes
ROOT's custom ready receipt from the generic launcher's rollout-path receipt.
ROOT retains normal merge and adoption.

## Artifacts and Notes

Step receipts and review evidence are under
`/tmp/swarm-ide-self-hosting.wkSErV/register-workers`; no transcripts are checked in.

Plan created for this bounded G1 increment; no broader runtime work is included.
Updated after actual61-test proof/native correction and real known-worker receipt,
so historical RED and later added green coverage stay accurately distinguished.
