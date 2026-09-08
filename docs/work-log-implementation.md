# Online Work Log

This is the K7 implementation of docs/swarm-operator-hour.md. Activity is the raw event stream; Work Log is a concise account of completed actions and remaining work, generated at finished Codex turn boundaries.

## Ownership and data flow

`WorkLogPanel` owns only its new renderer surface. C7 mounts it below the agent list. Typed `workLog.read/start/stop/record` requests pass through `protocol/work-log.ts` and `core/worker-runtime.ts` to `core/work-log/service.ts`. The renderer cannot supply transcript paths or process commands.

`transcripts.ts` reads only the operator's private registered sessions, at most 512 KiB each. It checks the registered session header, ignores synthetic sessions and partial JSONL records, extracts short assistant/tool evidence, and schedules only finished turn boundaries. Initial Start considers the last 30 minutes, newest four sessions first, not all inherited history. Inputs are capped at 10,000 characters per session and are model data, not instructions. Private absolute paths and common credential assignments are scrubbed before inference and persistence; raw transcript files never become repository artifacts. The first direct real check found ROOT's latest completed turn 280 KiB behind its live tail, which exceeded the initial 128 KiB reader; the bounded window was increased without increasing model input.

`commands.ts` runs one bounded normal authenticated Codex exec owner at a time, default model `gpt-5.6-luna`, with structured output. Settings support the Codex harness and a model name, plus 10–600 second debounce. Start is explicit and is not persisted across core restart. Stop aborts the owned process group and waits for close. No observed worker is resumed, messaged or killed.

Private Git worktree state remembers attempted session/turn boundaries before inference. An unchanged input is not automatically retried after failure or restart. Kernel locks serialize producer runs across windows and Ditz note transactions across worktrees. `.swarm/work-log.json` is the human-readable repository artifact: outcomes, changed areas, checks, follow-ups and session/task links. It retains the latest 200 entries. A model summary never closes an issue or proves a check independently.

When the previous processed boundary is present in the bounded tail, only subsequent evidence is sent. Empty startup turns are ignored. If the prior boundary has scrolled outside the finite tail, the latest bounded context is used rather than scanning the entire inherited transcript. Normal CLI structured-output behavior follows [Codex non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode).

Explicit Record outcome requires an exact completed Ditz issue. If registration supplied a task ID it must match. Ditz is read, checked for the stable entry marker, and commented while holding the same mutation lock; a repeated request does not duplicate the note. A successful write marks that outcome completed. Owner/ROOT continues to own issue closure and Git commit/sync of generated artifacts.

## Build connections and checks

The implementation is included by `//:quality_sources` in `//:desktop-bundle`. `//tools/work-log:check` runs node/renderer typechecks and dedicated Work Log tests. `//tools/work-log:proof` is an explicit operator-authorized direct producer/Ditz demonstration, never an automatic test model call. Changes to this path must keep this data flow, controls and build mapping accurate.

## Prototype limits

Codex is the only implemented harness. Completed turn summaries are not per-tool summaries. A process failure records an attempted boundary and displays a short error rather than auto-retrying paid inference. Input batching and the finite tail can omit older work; this is an operator summary, not an exhaustive audit. User reviews generated notes before explicit Ditz recording. No automatic issue close, commit, push, global transcript scan or deployment authority.

## Direct verification (2026-09-08)

The real proof invoked Codex `gpt-5.6-luna` once over the registered current sessions. It generated a concrete ROOT account of accepted activity contracts and cockpit integration, and wrote the human document in the owned worktree. Two empty startup turns were also summarized in that first successful call; the subsequent reader correction excludes those inputs, with an exact regression, without another paid call. A disposable closed Ditz issue received one generated note; requesting the same note twice and reading the issue back found exactly one marker. The test artifact was archived outside the worktree after verification, rather than shipping current private session history as seeded product data.

Focused node/renderer typechecks and Work Log producer/UI tests pass. Native review found and corrected batch overflow loss and multi-window stale-state/history overwrites; fix-delta review and the later finite-tail/incremental-input delta are CLEAN. C7 owns the actual cockpit mount and joined GUI acceptance; isolated mounted component tests do not claim that join is complete.
