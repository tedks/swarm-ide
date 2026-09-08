# Browse the selected agent's worktree

This plan follows `.planning/PLANS.md` and is kept current with implementation.

## Purpose / Big Picture

An operator selects an agent and explores its registered checkout without replacing the original editable workspace. Directories and changed files lead to read-only source and a comparison against a locally available master/main branch. The existing editor, conversation, and graph cameras stay mounted by the conversation owner's App integration.

## Progress

- [x] 2026-09-08: inspect current file broker and agree bounded ownership.
- [x] 2026-09-08: Add typed read-only directory/change listing and master comparison.
- [x] 2026-09-08: Add standalone browser and publish the small App seam.
- [ ] Prove two owned worktrees, retained editor, focused checks and native review.
- [ ] Push ready PR, document outcomes and sync Ditz.

## Assumptions and boundaries

Private registry `contextRoot` is authoritative; the renderer supplies a session id, never an absolute root. Git reads use `queryRepositoryGit`, with no fetch, checkout, index refresh, staging, or writes. Compare against origin/master, master, origin/main, then main when available, displaying the actual choice. Existing single-file callers keep HEAD comparison unless they explicitly choose master. A captured commit pins each comparison; missing branch, binary, large, unsafe and untracked files have concise distinct outcomes. Directory listings are bounded and do not follow symlinks or nested repositories.

## Context and Orientation

`core/worktree-inspection.ts` currently resolves the private registry and reads one file with HEAD diff. `protocol/worktree-inspection.ts` contains the request/result. `protocol/schema.ts` and `core/worker-runtime.ts` validate and route the command. `app/renderer/WorktreeInspection.tsx` is the isolated read-only surface. Add `AgentWorktreeBrowser.tsx` around it; App remains owned by the conversation agent.

## Plan of Work

First retain the existing inspect route and introduce an additive browse route carrying directory, branch, selected base, changed paths and bounded entries. Next build a standalone session-selected browser using the same bridge and generation fences as inspection. Publish `AgentWorktreeBrowser({sessionId, bridge, generation, onReturn})`, allowing an optional initial path. Finally test actual Git worktrees plus mounted navigation and an owned virtual path, update the living repository design and push the increment.

## Concrete Steps

From this designated worktree run project commands under `nix develop --command`. Materialize dependencies with `pnpm install --frozen-lockfile` if necessary. Run focused tests through the new Bazel worktree checks target, and build the desktop bundle through Bazel. A disposable virtual X11 test must never target inherited DISPLAY.

## Validation and Acceptance

Two real disposable checkouts containing identically named files must return their own bytes; committed changes after branching and dirty changes both appear against master. Untracked files are listed separately. Deletions, renames, binary files, missing bases and invalid paths are explicit. Original source/index bytes remain unchanged. Mounted browser and existing editor coexist so Return preserves original dirty text. Native review examines the final change and any fix delta; no broad historical sweep is needed.

## Idempotence and Recovery

All product operations are reads with bounded output/lifetime and response identity checks. Test resources are created in owned temporary directories and cleaned. No peer worktree or managed app adoption happens here.

## Surprises & Discoveries

Current inspection compares only HEAD to the checkout, so committed agent work is absent from its diff. The existing component never enters the editable buffer store, providing a small safe composition point.

Native review found destination-only rename comparison, per-operation budgets exceeding the bridge deadline, and focus following freshly allocated selection objects. Corrections preserve both rename paths, apply a total four-second browse budget and focus only on session/path changes. Focused tests cover these mechanisms. The first virtual wrapper put its test controls over the ordinary command button; the corrected wrapper moves only those test controls and preserves the failure evidence.

## Decision Log

Keep the old route backward compatible and add browser-specific data rather than replacing the global repository provider. Whole graph rebinding is deferred to avoid turning this slice into a multi-repo platform.

## Outcomes & Retrospective

The standalone explorer and typed routes are implemented. Initial 32 checks and both TypeScript boundaries passed; rename/focus corrections passed 33 checks. Native fix-delta review is CLEAN. The ordinary App entry remains the conversation owner's independent mount, while this slice proves the actual browser and core through a labelled controlled renderer wrapper. Whole graph rebinding and editable agent checkouts remain deferred.

## Artifacts and Notes

Control and concise handoff live in `/tmp/swarm-ide-finish-loop.0vkfJQ/worktrees`. ROOT owns final normal merge and app adoption.

## Interfaces and Dependencies

No new packages. Reuse Zod, the typed `SwarmBridge`, registry schema, source broker and bounded Git subprocess wrapper. Add a standalone browser plus scoped CSS; do not edit App or EditorPane.
