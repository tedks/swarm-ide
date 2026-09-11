# Register a known worker in Swarm

This opt-in command connects an existing Codex session to Swarm's existing agent
hierarchy, recent activity and checked steering controls. It neither launches an
agent nor sends a message. It does not scan your session directory. Parentage
comes from the rollout's actual `session_meta.forked_from_id`; labels, roles,
tasks and repository links are operator descriptions, not inferred facts.

## Quick start

From a Swarm checkout, materialize dependencies once and create a private registry
directory **outside the repositories you will browse**:

```bash
nix develop --command pnpm install --frozen-lockfile
registry_dir=$(mktemp -d /tmp/swarm-workers.XXXXXX)
nix develop --command bazel run --jobs=3 //tools/session-registration:register -- --help
```

Register an exact known rollout as history, without interactive authority:

```bash
nix develop --command bazel run --jobs=3 //tools/session-registration:register -- \
  register --registry "$registry_dir/registry.json" \
  --label 'Runtime department' --role 'Implementation' --task 'Runtime milestone' \
  --rollout /absolute/known/rollout.jsonl \
  --context-root /absolute/project/worktree --context-path core/runtime.ts
```

Point an IDE launch at that registry with
`SWARM_EXTERNAL_AGENTS_REGISTRY="$registry_dir/registry.json"`. Registration does
not change a running IDE's configuration. Once an IDE is configured for this
path, its existing observer refresh reads new rows. This command does not adopt
ROOT's running visualization or alter ROOT's private registry automatically.

An installed launch made with `--tmux-server`/`--tmux-socket` plus
`--tmux-session`, or selected automatically from the invoking tmux pane, maintains
its generated registry while that window is open. It repeatedly checks only the
initially resolved canonical socket and numeric session ID. Newly appearing
supported owners are registered through this same helper; unchanged rows are not
rewritten. Automatic selection refreshes only linked worktrees under the original
Git common directory, while explicit selection keeps its independent project/session
scope. No process name, window label, timing or OS parent/child relationship supplies
logical ancestry: only `session_meta.forked_from_id` does.

When a pane disappears or a checked replacement arrives, reconciliation uses the
`retire` operation below, keeping the old rollout row and removing its live target.
A present pane gets one inconclusive discovery grace scan, but exact handoff/send
validation rejects stale process, start-time, pane, socket or rollout identity on
every action regardless. A failed whole scan changes nothing and retries later.
Exiting Swarm aborts and drains only its short-lived tmux, Git and registration
commands; the observed session and agent continue running.

The registration helper continues to treat `--context-root` as an explicit
canonical browsing root, independently of the process cwd. For the supported
bare-parent plus sibling-worktrees layout, the installed launcher's automatic or
explicit tmux-session association can derive that browsing root by matching the
bare Git common directory to the opened project and revalidating its selected
worktree. Neither path changes the running agent's cwd.

For a live target, additionally give `--socket /absolute/tmux/socket --pane %17`.
These are exact tmux identities, not a window-name search. The helper searches
only that pane's bounded process tree and open file descriptors, then reuses the
IDE's exact process/start-time/ancestry/open-rollout validation. You may pin
`--process-pid 1234 --process-start 567890` from an existing launch receipt. With
an explicit PID, there is no process-tree discovery; the validator proves its
ancestry to the pane. `--session-id UUID` pins the rollout to a known session.

A pane may be supplied without `--rollout` only if it resolves to exactly one
open rollout. Multiple holders/files, missing or unsupported identities,
incomplete/changing process discovery and exceeded bounds do not confer live
authority. Supply the known rollout and, if needed, exact process identity to
disambiguate deliberately. The IDE independently rechecks before every Send or
terminal handoff; a `checked-live` receipt is not a lifetime guarantee.

## Opt-in after a successful spawn-fork receipt

The following example uses ROOT's custom startup supervisor: it writes `ready`
with an `id` after verifying ancestry, assignment and compaction, alongside the
launcher's requested `rollout-path` receipt. The generic spawn skill does **not**
write that `ready` file. With a generic launch, use its requested rollout-path
receipt and omit optional `--session-id`, or supply an independently known UUID.
No change to the globally installed spawn skill is required:

```bash
step_dir=/absolute/spawn-step
read -r worker_rollout < "$step_dir/rollout-path"
worker_id=$(jq -er '.id' "$step_dir/ready")
worker_pane=$(tmux -L personal display-message -p -t swarm-ide:my-worker '#{pane_id}')
worker_socket=$(tmux -L personal display-message -p '#{socket_path}')
nix develop --command bazel run --jobs=3 //tools/session-registration:register -- \
  register --registry "$registry_dir/registry.json" \
  --label 'My worker' --role 'Implementation' --task 'Current bounded step' \
  --rollout "$worker_rollout" --session-id "$worker_id" \
  --socket "$worker_socket" --pane "$worker_pane" \
  --context-root /absolute/project/worker-worktree
```

The CLI prints one JSON receipt (the outer Nix shell may also print its startup
banner; do not parse the entire `nix develop` output as one JSON document).
`authority: "checked-live"` means the exact
current target was checked; `"historical-only"` means no tmux authority was
written. Both can be successful registrations. Do not equate either with a
message delivered or work completed. A missing pane with an explicit valid
rollout yields historical-only; a missing pane without a rollout fails unchanged.

Repeat the command to update supplied metadata. Same input yields `changed:
false`; omitted role/task/context fields retain prior values. `--context-path`
can repeat up to twelve times. An explicit empty `--role ''` or `--task ''`
clears that description. Registering without a checked pane deliberately removes
any previous live target; it does not silently retain stale authority.

Retire after the worker finishes, even if its process or rollout has disappeared:

```bash
nix develop --command bazel run --jobs=3 //tools/session-registration:register -- \
  retire --registry "$registry_dir/registry.json" --session-id "$worker_id"
```

Retirement removes only the tmux target. The row, descriptions and rollout path
remain, and a readable rollout still supplies history. Retiring twice is safe.
It does not stop a process, select a window, delete a transcript or declare a task
complete. An unknown ID is an error, not an implicitly fabricated history row.

## Bounds, ownership and recovery

Linux, installed `tmux` and util-linux `flock` are required for live registration.
The Nix environment supplies the supported tooling. Registry parent must be a
canonical owned mode-0700 directory; existing registry and lock must be owned
regular mode-0600 files, not symlinks, hardlinks or FIFOs. The helper will not
silently change permissions. No registry is allowed under the current workspace
or the explicitly named context root. Use a private operator state directory for
persistent installations; the quick-start `/tmp` directory is disposable.

The unchanged observer schema caps 64 unique session IDs/rollout paths, 120-char
labels/roles, 200-char task descriptions, twelve bounded repository-relative
links and 65,536 registry bytes. Rollout reads inspect only a complete first
metadata line within 65,536 bytes; no transcript text is copied into registry or
repo. The CLI's receipt contains actual parent ID but does not add a competing
parent field to the registry. `--evidence synthetic` explicitly labels a
demonstration row and never grants it a live target.

Cooperating CLI writers share a permanent `registry.json.lock` inode, wait at most
five seconds to acquire its kernel lock, and preserve unrelated entries. A
synced private temporary file is renamed atomically, then the directory is
synced. Do not unlink/replace the lock while writers may run, or hand-edit the
registry concurrently: arbitrary same-user noncooperating edits are outside this
small helper's transaction guarantee. This is the trusted local operator model,
not protection against a hostile account with your own machine permissions.

Process termination releases the lock. A hard kill before rename can leave an
unused private `.registry.json.UUID.tmp` file, but never a partially written
published registry. Inspect and remove only such known orphan files once no
writer is running. If directory sync fails after rename, the CLI reports
**published but durability unconfirmed**; inspect the registry before retrying.
Errors before publication leave the old registry intact. No operation retries a
message, because no operation sends one.

## Local proof

```bash
nix develop --command bazel test --jobs=3 //tools/session-registration:unit
```

This required-positive target checks types, actual bundled CLI commands, two
concurrent registrations, finite contention and kernel-lock release after an
owned holder is killed. Owned disposable tmux/Node holders prove process and
open-file identity, including descendants started from worker threads. The
existing `ExternalAgentService` reads the produced registry and checks true
header parentage, assistant activity and retirement. These holders are controlled
Codex-shaped fixtures, not real model sessions. No GUI, model turn or managed
ROOT registry is needed to verify this unchanged observer interface.
