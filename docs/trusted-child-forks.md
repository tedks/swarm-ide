# Native child conversations

The trusted-local fleet can fork a ready IDE-owned Codex conversation through its
last successfully completed turn. This is Codex's actual `thread/fork`, not a
copy of displayed text or a terminal trick. It does not fork an external tmux
agent, create a Git worktree, or grant additional permissions.

The parent and child share the IDE's displayed working directory. Their Codex
histories branch at the pinned turn; their files do not. Both retain the normal
installed harness's tools, configuration and approvals. Use separate worktrees
when independent filesystem edits are needed; automatic creation is future work.

## Typed interface

`trusted.fork` carries the parent `token`, observed `expectedInstanceId`,
`expectedThreadId` and `expectedTurnId`, a fresh `childToken`, child `text`, and
`model` (null for normal inherited/configured behavior). The selected snapshot's
optional `forkPoint` advertises eligibility. Only a live, ready, successfully
completed parent exposes one. Failed/interrupted turns, pending acknowledgements,
stopped owners and restart-only history cannot fork.

Admission reserves one of eight live slots and stores requested lineage before
creating a provider. The child token is consumed, even if acknowledgement is
lost; a request must not be replayed. `trusted.snapshot` addressed to childToken
can inspect an uncertain outcome. A new core instance rejects stale fork requests.

The native response must name a distinct child, the exact `forkedFromId` parent
and the same working directory. The initial instruction is dispatched only after
that confirmation. The provider pins `lastTurnId` inclusively, so later parent
turns do not slip into the selected history. Large transcripts are not returned
through the fork response (`excludeTurns:true`). The child receives the actual
provider history, while the IDE output pane starts with the new child instruction.

Run summaries optionally retain `fork` with parent run/thread/turn, explicit
shared-workspace disclosure, inherited task reference and a confirmation flag.
Requested lineage is not provider-confirmed lineage. A child's own task reference
is null: the parent's task is historical context, not a new task assignment.
The fork defers automatic goal continuation, then clears and verifies any inherited
goal on the confirmed child thread before its first instruction. The parent's
goal is never modified. Goal-clear failure or uncertainty sends no child turn.
Completing either turn does not close a Ditz issue. Recursive forks use the same
operation with no depth rule; the existing fleet bounds still apply.

## Failure and recovery

Stop affects only the selected owned conversation. Pending child setup is
cancellable; late acknowledgements cannot send the initial instruction after
Stop. History is bounded to twenty records. Restart retains observations and
lineage, clears eligibility and never creates a provider or replays a command.
Legacy history without lineage remains readable.

Existing `trusted-failed-capacity-20260907` remains separate: a failed provider
whose cleanup has completed may retain a live slot until core restart. This
increment does not claim to repair that lifecycle class.

## Current join and verification boundary

`app/components/TrustedForkControl.tsx` provides an explicit form with
shared-directory disclosure and one-shot intent handling. ROOT released W6 PR73
and the trusted-run pane now mounts the control for the selected conversation.
The list labels children; the selected child links back to its retained parent.
Its `onFork` callback must reject non-ok or ambiguous bridge replies; resolving
means admission acknowledgement, not provider confirmation.

To use it, prepare and explicitly launch a normal trusted-local conversation.
After a successful turn reaches **ready**, enter a new instruction in **Child
instructions** and choose **Fork child conversation**. The new child becomes
selected after admission; its confirmed **Fork of … · shared workspace** marker
links back through **View parent**. Selecting either run restores its own
composer. Stop acts on that selected conversation only. Archived history is
visible but cannot fork or automatically resume.

Run focused local checks with
`nix develop --command bazel test //tools/trusted-forks:unit --jobs=3`.
The manual live proof is separately authorized and never part of ordinary tests.
Do not equate controlled unit/component evidence with a real provider turn or a
packaged GUI journey. Actual proof outcomes are recorded in the PR and ExecPlan.

The one authorized live proof at8af0d5a passed using two new Codex conversations
and three observed turns: native history recall, child Stop preserving parent,
parent follow-up, and retained lineage after restart with no replay. The child's
goal was already absent in that proof; active-goal removal remains controlled
test evidence. The UI join is separately verified using deterministic external
app-server peers, not extra real provider turns.

The manual `//tools/trusted-forks:gui-smoke` target exercises the real packaged
main/preload/core with two deterministic external peers and zero model turns.
Its accepted run verified Fork, exact lineage, independent Stops and retained
source/cursor/draft/graph cameras, then explicitly restored its disposable
buffer and cleared its own draft before normal window close. Both peer exits,
two persisted closed archives and owned desktop cleanup were confirmed. This
does not attest shutdown draining a still-running turn. The initial two runs
found test cleanup assumptions (uninstalled editor Undo and the correctly
protecting unsent-draft veto); those failures remain recorded, not product fixes.

API fields were checked against locally generated Codex 0.153.4 schemas and the
[official app-server documentation](https://learn.chatgpt.com/docs/app-server).
