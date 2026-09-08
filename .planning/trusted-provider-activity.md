# Readable trusted-provider activity

This living ExecPlan follows .planning/PLANS.md.

## Purpose / Big Picture

The local Codex conversation currently exposes only chat text and approvals. Add a compact history of commands, file edits, tool calls and turns so the fleet can show what an agent is doing without extracting it from prose. This increment exposes a core accessor; the fleet/UI departments join it separately.

## Progress

- [x] (2026-09-08 00:35Z) Read the assigned ownership, session event routing and official app-server item lifecycle documentation.
- [x] (2026-09-08 00:39Z) Four new cases failed against old implementation (4 RED/16 PASS); implemented projection passed 20 session tests.
- [x] (2026-09-08 00:44Z) Final session21 and quality1801/134 files PASS, including typecheck and node/renderer builds; native code/fix/test convergence CLEAN.
- [x] (2026-09-08 00:43Z) Exactly one actual authorized Codex turn emitted command/file/turn completion and created the correct disposable file; owned cleanup confirmed.
- [x] (2026-09-08 00:46Z) PR71 ready, documentation pushed and Ditz synchronized; ROOT owns merge/adoption and issue closure.

## Context and Orientation

core/agents/trusted-local-session.ts owns one app-server conversation and validates JSON-line messages. It already checks thread and turn identity, buffers early item events, rejects malformed input, and closes only its owned transport. tests/trusted-local-session.test.ts uses a controlled transport. No production service, wire protocol or renderer change belongs to this increment.

## Assumptions and Decision Log

Provider started/completed events contain full items; completion may arrive before start, and duplicate or old-turn messages must not resurrect work. Activity is explanatory observation, never authority for task completion, approval or dispatch. Keep snapshot() unchanged. Add activity() returning cloned records with id, at, turnId, kind (command/fileChange/tool/turn), status (running/completed/failed) and summary. Bound count and encoded bytes without splitting Unicode. Summaries omit raw output, tool arguments, diffs, error bodies, credentials and configuration. Unsupported items remain ignored. Keep inherited trust and approval choices unchanged.

## Plan of Work

First add tests using existing controlled session transport to show readable exact-turn lifecycle, out-of-order terminal precedence, output privacy and bounds. Then add local activity storage and narrow projection helpers in the owned session file, reusing existing notification fences. Turn closure must not invent success for unfinished items. Add an independent focused Bazel target if needed and optional owned live evidence driver, never a model call in default tests.

## Concrete Steps and Validation

Run from /home/tedks/Projects/swarm-ide/trusted-provider-activity. Materialize with nix develop --command pnpm install --frozen-lockfile. Run nix develop --command bazel test //tools/trusted-local:session-unit //tools:quality --jobs=3 --test_output=errors. On executable/test head 8ffe786, both targets passed in 60.635 seconds: session21, quality1801 tests/134 files with types and node/renderer builds. Existing snapshot assertions remain unchanged. Controlled tests are not live evidence. UI verification is unnecessary for this core-only increment; no user display was touched.

The manual-only //tools/trusted-local:activity-live target requires SWARM_ACTIVITY_LIVE=1 and SWARM_ACTIVITY_EVIDENCE naming a private owned directory. It is intentionally pinned to the approved local Codex 0.153.4 executable; it is not a portable installer check. A consumed marker prevents accidental reuse of that evidence destination. Do not execute it again without a new explicit product-turn authorization. The one authorized run is complete, with inherited configuration, explicit gpt-6-astra, no approval answers, one provider start and one turn/start. Command/file/turn completion came from the actual provider; the exact hello file was independently read before owned workspace removal. MCP/dynamic/collaboration/web activity and adversarial ordering are controlled-test evidence only.

## Surprises & Discoveries

Existing correlation and early-event buffering already supply the activity admission boundary; no second event transport or security layer is needed. Installed 0.153.4 schema confirms webSearch has no status field and uses notification lifecycle; collaboration call completion does not mean child completion. Initial implementation passed all new cases. Main inspection then found inherited action-label keys and growth when unfinished rows gain terminal explanations; fixed with own-property lookup and re-bounding, and added a dedicated regression. These latter checks were added with their fixes, not independently historical RED. Native review found no further important issue and confirmed fixes plus final test delta CLEAN.

## Idempotence and Recovery

No storage migration or global changes. Tests use owned transports/workspaces, and live proof is explicit manual-only with no retry. Failures remain evidence, not an instruction to repeat a model turn. Preserve branch/history; ROOT merges normally and adopts.

## Outcomes & Retrospective

PR71 supplies the session accessor with no service/UI changes. Following explicit ROOT clearance it incorporates only the exact F1 contract a6e7c8c, not unfinished runtime/store. The smallest join is F1 publishing session.activity() through its approved optional activities field. The feed now holds at most 100 rows (aligned to the cleared wire limit) and 64KiB encoded; rows are first-observed order, stable opaque local IDs, original observation timestamps and copied objects. Known terminal item evidence is sticky even after trimming. Unsupported items are ignored. Structural labels intentionally omit arbitrary command text, tool names, outputs, paths and diffs; approval and chat surfaces are unchanged, not newly redacted. Failed activity can mean observed failure/decline/interruption or explicitly unconfirmed outcome on lost completion; its summary distinguishes these. A tool completing never changes task state. UI and fleet adoption remain ROOT/peer work, not evidence claimed by A2.

## Artifacts and Interfaces

Coordination is /tmp/swarm-ide-real-swarms.Djy75P/provider-activity/seam.md. The local activity interface deliberately matches the shared wave shape without importing unreviewed peer protocol code. Baseline, initial and final local logs are in that private role directory. Actual one-turn outcome is /tmp/swarm-activity-a2-proof.AzfSIq/activity-live.json. Native seat CLEAN; foreign seats unfilled per Codex-only user directive. Hosted CI ignored by explicit user authority. Ditz trusted-provider-activity-20260907 tracks normal landing. Main read official OpenAI app-server documentation and installed schema, rather than guessing provider fields: https://learn.chatgpt.com/docs/app-server.

Initial plan: bounded core event projection only, to preserve independent parallel implementation.

Completion update: actual provider proof and exact local/native evidence recorded; no broader UI or security-platform work added.

Contract continuation: ROOT cleared a6e7c8c, composed normally as dda4f62 without conflicts. Comparing exact producer schema found its 100-row maximum versus A2's former128. Directly parsing the 128-row accessor result through that schema reproduced1RED/20PASS. Lowering only the retention count to100 corrects the concrete dependency mismatch; a focused schema test guards it. Prior full quality/live evidence remains attributed to its original head; no duplicate product turn or full legacy test run is authorized or needed for this bounded join.
