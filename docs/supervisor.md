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

Launchers must publish `rollout-path`, `recap-cursor` and the pre-compaction
`startup-cursor`. A spawn-agent version supporting `--startup-cursor-file` can
export its existing `compact_after` value immediately before requesting compaction.
Older ad-hoc launchers may need that receipt added before adoption. Do not invent
it after the fact or replace live supervisors to try this tool. Missing receipts
time out with a failure wake; launcher adoption remains separate from this package.

## Configuration and launch

Save the following as a private configuration file; paths resolve relative to
that file. Command arrays contain an executable followed by fixed arguments.
Use absolute executable paths when not intentionally relying on the Nix PATH.

```json
{
  "parentSession": "YOUR-PARENT-SESSION-ID",
  "generation": "implementation-v1",
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

- `task-prompt`: exact UTF-8 assignment as queued, including final newlines and
  all other whitespace. A differently spaced or newline-terminated message is
  not the same assignment.
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
zero (`queued`, not consumed; legacy `sent` has the same enqueue-only meaning).
An interrupted/failed submission is unconfirmed, not success, and is never
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

Initial local verification passed 17 standard-library tests via
`//tools/supervisor:unit`, including actual CLI execution with a fake queue,
split JSONL appends, inherited/wrong-model startup rejection, catch-up after
steering, watcher failure followed by recap, ambiguous delivery without replay,
status routing and TERM-resistant owned-helper cleanup. The catch-up regression
was first reproduced as one failing test alongside 16 passes; latching the
verified assignment turn made all 17 pass. Native fix-delta review is clean.

## Bounded status delivery and continuations

The supervisor now leaves **one unanswered automated status request per child**.
Further ten-minute ticks refresh `current.json` but do not enqueue another request
until the assigned status file contains five newline-terminated lines. A response
file is a report receipt, not a claim that a task is complete. Files include a
persisted supervisor-instance identifier so old files cannot answer a new request.

ROOT also has only one outstanding **routine checkpoint wake**. Its short message
points at `stateDirectory/current.json`, whose role outcomes and response paths
continue to update. After reading it, explicitly acknowledge its current token:

```sh
nix develop --command bazel run --jobs=3 //tools/supervisor:run -- \
  ack-status /absolute/path/supervision-state TOKEN-FROM-CURRENT-JSON
```

This writes a local receipt for this tool's routine checkpoint, not a Codex queue
acknowledgement. An old token cannot acknowledge a newer checkpoint. After ROOT's
receipt, the next ten-minute checkpoint can wake ROOT again even if a child still
has one unanswered request. Without that receipt, current state continues updating
and true completion/error wakes remain enabled. This preserves the cadence without
building an ever-growing queue of identical pending requests.

Completion during the checkpoint grace period cancels an **unqueued** routine
wake when no participating assignment remains active. It does not delete an
already-enqueued message. Startup, completion and error messages identify their
generation and point to current state/evidence, not old embedded landing orders.
No human steering, real assignment or completion/error is discarded by text or age.

Use a new descriptive `generation`, fresh state directory and fresh step directory
for an authorized continuation, with a unique marker and a recap cursor captured
before that assignment. Preserve the old ledger and final recap. A resumed child
can reuse its validated original startup cursor/lineage; the new exact assignment
must still appear after that compaction with the configured model. Changing the
generation in an existing ledger is rejected, preventing old done flags or
acknowledgements from suppressing a new completion.

For an old ledger, completed roles remain completed; legacy `sent` notifications
are not replayed. Previously queued status requests are conservatively treated as
outstanding until their recorded response files contain the report; role completion
does not imply delivery of an earlier status request. When a legacy receipt lacks
child identity, fresh child requests are held across that ledger until those
responses arrive. Current-state reporting and completion/error wakes continue.
An operator must reconcile abandoned legacy asks explicitly; this tool does not
infer consumption from age, completion or missing history.
Legacy checkpoint receipts need explicit ROOT acknowledgement, because enqueue
success alone cannot establish whether ROOT read them. Never delete history or
clear a Codex queue to make this migration look clean.

The delivery ledger records new `attemptedAt`/`queuedAt` times, never a fabricated
`consumedAt`. Local diagnosis found two direct worker milestone messages with
successful queue receipts roughly 49 minutes before ROOT recorded them, after
their PRs had already merged. Those were not duplicate supervisor recap sends.
The upstream scheduling cause is not established, and this repair cannot retract
existing messages or fix Codex delivery latency. The installed CLI offers enqueue,
not a supported coalescing/cancellation API; the
[official app-server documentation](https://learn.chatgpt.com/docs/app-server)
does not establish the CLI queue scheduling observed here.

Operational recommendation: routine worker milestones belong in the current seam
file; direct ROOT messages should be reserved for necessary decisions/blockers or
otherwise-unwatched handoffs. This is guidance for future assignments, not authority
to broadcast, replace live supervisors or suppress already queued worker messages.

The notification-lag increment is covered by the focused supervisor test target:
backlogged requests across several ticks, explicit ROOT receipt, actual receipt
CLI, completion overtaking a grace period, restart/legacy deduplication, distinct
continuation recap generations and shared-child transport slots. Existing exact
startup, enqueue-ambiguity and owned-helper cleanup tests remain in that target.

Task-text regressions additionally cover final LF, repeated LF, CRLF and
surrounding whitespace, plus rejection when the observed text differs. Reading
`task-prompt` without trimming fixes false startup failures for queued messages
that retain their final newline; it does not normalize mismatched assignments
or change the parent, model and fresh-compaction gates. The fixture queue remains
local and fake; these checks do not launch or message actual sessions.
