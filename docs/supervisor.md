# Supervise steerable worker sessions

This small local tool packages ROOT's startup, completion and ten-minute status
watching. It observes existing Codex forks; it does not launch, register, resume,
steer their implementation, or terminate them. It sends only startup/completion,
failure and optional status messages through the configured Codex queue command.
The operator remains responsible for reviewing results and merging PRs.

## Assumptions and boundary

Use Node from this repository's Nix shell and the Bazel entry points. No additional
dependency is installed. Configuration and launch receipts are trusted local
operator inputs. Transcript text, paths and messages are data, never shell code.
The tool does not inspect credentials or mutate the running agent's files.

A startup is accepted only when the rollout's first session identity names a
different child of the configured parent, a **fresh** compaction follows the
pre-compaction cursor, and the exact task appears in a newly started turn with
the configured model. Historical inherited compaction/model records alone are
insufficient. This verifies logged task consumption, not eventual task success.

The existing ad-hoc launcher writes `rollout-path` and `recap-cursor`, but does not
export its pre-compaction cursor. For future launches, also persist its existing
`compact_after` value as `startup-cursor` immediately before requesting compaction.
Do not invent that receipt after the fact or replace the live supervisors to try
this tool. Missing receipts time out with a failure wake. This narrow launcher
adoption remains separate from this package.

## Configuration and launch

Save the following as a private configuration file; paths resolve relative to
that file. Command arrays contain an executable followed by fixed arguments.
Use absolute executable paths when not intentionally relying on the Nix PATH.

```json
{
  "parentSession": "YOUR-PARENT-SESSION-ID",
  "model": "gpt-6-astra",
  "codexCommand": ["/absolute/path/to/codex"],
  "stateDirectory": "./supervision-state",
  "startupSeconds": 1050,
  "recapSeconds": 3000,
  "pollSeconds": 0.25,
  "commandSeconds": 30,
  "statusSeconds": 600,
  "statusGraceSeconds": 45,
  "roles": [
    {
      "name": "implementation",
      "window": "project:implementation",
      "stepDirectory": "./implementation",
      "marker": "UNIQUE-STEP-ID COMPLETE — EXECUTIVE RECAP"
    }
  ]
}
```

Each step directory is owned by that launch and contains:

- `task-prompt`: exact assignment, ignoring final newline characters only.
- `rollout-path`: the child JSONL path (absolute, or relative to step directory).
- `startup-cursor`: byte offset after the last complete record **before** the
  child's requested compaction, captured by the launcher in the child rollout.
- `recap-cursor`: complete-record byte offset after compaction and before the
  assignment, so an old final answer cannot close the new step.

Capture cursors with the launcher's existing `codex-jsonl-watch.py cursor` helper.
Never use a parent-rollout cursor or guess a byte count. A caller passing zero
is asserting the step began at byte zero; that is not valid for inherited logs.

```sh
nix develop --command bazel run --jobs=3 //tools/supervisor:run -- /absolute/path/config.json
nix develop --command bazel test --jobs=3 //tools/supervisor:unit --test_output=errors
```

To run unattended, use an explicitly named **owned** user service from this
worktree (substitute the actual absolute paths):

```sh
systemd-run --user --unit=my-project-supervisor --collect \
  --working-directory=/absolute/path/to/worktree \
  nix develop --command bazel run --jobs=3 //tools/supervisor:run -- /absolute/path/config.json
systemctl --user stop my-project-supervisor.service
```

Stopping that supervisor stops only its own queue/helper subprocesses. Existing
tmux windows, Codex sessions, their work and application previews stay alive.
Do not stop another operator's service or kill a worker to clean up monitoring.

## Recaps, status and recovery

Only newline-terminated JSON objects are consumed. A recap must be an assistant
`response_item` message with `phase: final_answer` whose text starts with the
unique marker. User quotes, commentary, incomplete writes and pre-cursor recaps
cannot complete a role. Malformed complete lines are skipped. Replacement,
truncation or a record over 4 MiB fails visibly rather than silently rereading
history. The built-in reader follows bounded chunks without a model polling loop.

An optional `watcherCommand` argument array can name the existing executable
`codex-jsonl-watch.py` helper. It receives `recap PATH MARKER SECONDS --after-byte
CURSOR`. Its exit/output never establishes completion: the built-in JSONL reader
does. A helper failure sends a separate failure wake and tracking continues, so
a broken helper cannot swallow a later complete recap. Usually omit this option.

Ready proof and `final-recap` are atomically written in the step directory before
their respective parent wakes. Status requests ask each verified active child
for five lines: accomplished/proof, next, blocker, scope growth, and pushed PR.
After the grace period ROOT receives a collection wake; it must distinguish
pending status responses from completed work. Set `statusSeconds: 0` (the default)
to disable status requests. Recap deadlines are per role, starting at readiness.

Only one supervisor may own a state directory. Its `supervisor.lock` contains its
PID. Graceful stop removes the lock; after a crash, verify that PID/service is
gone before removing **that lock file only**. Preserve state and recaps.

The queue CLI does not offer transactional delivery receipts. `state.json`
records each notification as pending before submission and sent only after exit
zero. An interrupted/failed submission is unconfirmed, not success, and is never
blindly retried. Check the parent's actual queue/session and reconcile manually;
do not delete the ledger to force another message. Successful completion wakes
are not resent on restart. A tracking deadline writes `push-status`, wakes ROOT
and ends that role; the observed worker is left running. Invalid configuration or
an unconfirmed old ledger exits nonzero without starting new tracking.

## Progress and decisions

This implements the optional `swarm-supervisor-tool` increment of
[the operator-hour plan](swarm-operator-hour.md). One standard-library Node CLI
and focused fake-session tests replace hardcoded per-wave paths, rather than
introducing a scheduler platform. Native review identified inherited startup
evidence and checkpoint failure cleanup as risks; fresh cursor/turn correlation
and unconditional owned-child cleanup address them. Live services are not adopted
or restarted by this change. Registering sessions remains the separate existing
session-registration tool.
