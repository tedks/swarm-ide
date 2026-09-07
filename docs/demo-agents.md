# External agent lineage and conversation

Swarm can observe explicitly registered existing Codex JSONL sessions. These are
**external supervised sessions**, not managed runs: observing them does not enable
the unavailable managed provider, send a model request, launch an agent, or alter
agent instructions. Their role and task labels are operator descriptions; only
the actual first `session_meta.payload.forked_from_id` establishes fork ancestry.

## Register a local session

Create a private, operator-owned JSON file **outside the repository** and launch
Swarm with `SWARM_EXTERNAL_AGENTS_REGISTRY` set to its absolute canonical path.
The registry must be owned by the current user and not group/world writable.
Use exact session IDs and canonical, nonsymlink `.jsonl` paths you intend to expose
locally. There is no account-wide discovery. Do not commit this registry or copy
private transcripts into a release.

```json
{
  "version": 1,
  "sessions": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "label": "Example implementation agent",
      "rollout": "/operator-private/example-session.jsonl",
      "evidence": "local",
      "role": "Implementation",
      "task": "Explicitly associated task ID",
      "contextRoot": "/absolute/registered/repository",
      "contextPaths": ["docs/design.md"]
    }
  ]
}
```

The paths and ID above are placeholders, not a bundled agent. For deliberately
synthetic JSONL examples set `evidence` to `synthetic`; the UI keeps that label
visible. This format currently understands Codex structured rollouts only.
Context links are usable only when `contextRoot` exactly matches the registered
repository's canonical root, and source opening still goes through the existing
contained file broker. No transcript path becomes a clickable file capability.

The registry is read on explicit Refresh. It admits up to 64 unique registrations,
a 64 KiB registry and first metadata record, a 256 KiB tail, 120 visible events,
and 4096 characters per message. Larger conversation history is intentionally not
loaded. Partial/malformed/oversized tail records are omitted and coverage stays
visible. Missing or unsafe metadata revokes transcript and handoff availability.
The observer reads only current-user-owned regular files and rejects symlink
aliases, noncanonical paths, wrong session IDs and duplicate registrations.

## Walk through the UI

In **Agent runs → External sessions**, press Refresh and select a session. Its
main information panel shows proven parent ID, authored role/task, observation
time, and a chronological worklog. The conversation tab shows actual bounded
assistant messages as **read-only** recorded text. User input prompts, reasoning,
tool arguments and raw tool outputs are not displayed. Tool calls/results are
named events, not verification of a successful test, changed file or commit.
Assistant claims remain assistant-reported; no worktree-wide edit attribution is
invented. The observer does not claim to capture all effective context.

Source buffers, draft text and graph instances remain open. Click **Return to
source information**, select a source, or follow an explicitly associated context
file to return to ordinary navigation. Explicit Refresh observes new records;
there is no periodic polling. Core recovery invalidates in-flight observations
and requires a fresh observation before handoff.

## Optional interactive handoff

Without a `tmux` registration, the read-only conversation remains useful and the
interactive action is unavailable. Operators may additionally register:

```json
{
  "socket": "/operator-private/tmux.sock",
  "windowId": "@12",
  "paneId": "%14",
  "panePid": 1234,
  "processPid": 1240,
  "processStart": "987654"
}
```

This object goes under a session's `tmux` key. Obtain these exact values from the
known target, not guesses: tmux's `window_id`, `pane_id`, `pane_pid`, the actual
Codex descendant PID that holds this rollout open, and field 22 of its Linux
`/proc/PID/stat` (kernel start ticks). The observer rechecks the owned Unix socket,
pane/window tuple, process start identity, bounded ancestry to the pane, and the
actual open rollout inode before accepting **Open conversation in tmux**. tmux
must be available in the launch environment. Closed/replaced targets are not
resumed or replaced. Selection is a fixed-argument tmux command, never keystrokes.

tmux does not offer an atomic process-identity-and-selection operation. A small
visual-only race remains between the final validation and selection; successful
selection is not acknowledgement from an agent. An uncertain handoff must be
checked visually, not replayed as an agent command. Closing Swarm never kills
observed agents. The only subprocesses the observer owns are short-lived tmux
query/selection CLI invocations.

## Local verification

`nix develop --command bazel test --jobs=3 //tools/demo-agents:unit` checks the
reader, schemas, stale/lifetime guards and Linux owned-target identity. The
dedicated packaged proof runs with the owned virtual desktop:

```sh
flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock \
  nix develop --command bazel run --jobs=3 //tools/demo-agents:smoke
```

Its generated sessions are explicitly synthetic. It uses the actual production
archive and bridge, an eight-level tree, real source bytes and a disposable tmux
holder; no provider/model turn. Actual local Swarm metadata ancestry is recorded
separately in ignored operator evidence, never mislabeled as the synthetic GUI
proof or committed into public examples.
