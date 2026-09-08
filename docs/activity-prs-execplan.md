# Readable Activity and explicit GitHub pull-request observations

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Clicking Recent Activity opens a readable central Activity log without disturbing the source editor, its draft, or graph cameras. A separate Pull requests section explicitly refreshes up to 20 recently updated PRs from the opened workspace's GitHub origin. It does not monitor CI or change GitHub. Recorded summaries remain recorded; PR observations show their fetch time and scope.

## Progress

- [x] (2026-09-07) Read current journal, worker, protocol and ownership instructions; designated `feature/activity-pr-instruments` from reviewed 83e53e7.
- [x] (2026-09-07 23:08Z) Implemented cleaned Activity entry and actual native outcome-first recorded wording with unchanged citations.
- [x] (2026-09-07 23:15Z) Implemented typed GitHub origin observation and client, separate Changes/PRs views and parent-death-safe owned commands.
- [x] (2026-09-07 23:26Z) Actual owned packaged GitHub20 PR/source/typed-draft/camera/stale-failure journey passed3.1s, zero errors and cleanup1. Malformed/foreign/late and hard owner-death tests passed; native final fixpoint CLEAN8608a47.
- [x] (2026-09-07 23:34Z) Full60-target build passed; focused Activity gate64tests/5files passed2.7s. Final aggregate quality1693pass/1fail in unchanged agent-owned-process.test.ts:152 remains an explicit ROOT disposition gate, not a J2 fix or waiver.
- [x] (2026-09-07 23:36Z) Pushed final handoff, marked PR64 ready, synced Ditz and stopped the owned Bazel server. ROOT retains the aggregate-test disposition/merge gate; no merge or app adoption by J2.
- [x] (2026-09-08 00:01Z) ROOT accepted the exact historical PID690372 uncertainty as open/nonblocking. Normally composed ROOT-verified 1fa5005 as 2db8672, preserving all task/trusted/Context/UI seams. Native composition CLEAN; one joined quality1796/134 and focused65/5 passed, plus the actual packaged20-PR journey3.214s/zero renderer errors/cleanup1. ROOT still owns PR64 merge/adoption.

## Surprises & Discoveries

The existing Journal is a real core read of a repo-authored bounded evidence export, not an automatic live summarizer. It already preserves the source document when opened. PRs therefore belong beside it as a separately timestamped observation, not fabricated journal evidence.

Native review found that ordinary app quit kills core without its async shutdown path; an initial detached gh could survive it. Reused the existing PID owner and collector, then exercised the actual GitHub command function from a killed disposable caller with a detached descendant. Unknown cleanup blocks another read and cannot acknowledge shutdown.

The first UI proof clicked the middle of a long editor outside its visible scrollport; the driver now intersects clipping ancestors before a checked native click. A later diagnostic initially unpacked the bridge envelope incorrectly; review corrected that diagnostic separately. Neither is a production editor fix.

Owned GitHub command probing worked outside Electron but failed in the disposable GUI profile. The virtual harness replaces XDG_CONFIG_HOME, changing gh's ordinary config lookup. Preserving the incoming GH_CONFIG_DIR before that override made the unchanged owned command path pass. No credentials were inspected, copied or supplied to the renderer.

## Decision Log

Use only the opened workspace's single validated `origin` on github.com. Supporting operator-selected arbitrary repositories or enterprise hosts can follow later. This keeps identity obvious and allows exact changed-file links to use existing source navigation.

Use ordinary installed `gh` authentication and fixed read-only argv. GitHub errors are sanitized, stdout bounded and commands cancelled/drained on core shutdown. Never read credential files or forward raw errors. No new dependencies or background polling.

Reuse the already tested private PID process owner for hard parent death, not a new full-isolation policy. The shared collector caps total command output at4MiB; parsing/publication additionally rejects GitHub output over512KiB. Preserve a four-second provider deadline and the existing five-second bridge timeout. Fail closed and visibly unavailable if ownership tooling cannot operate.

The current user mandate is Codex-only native council and local-only checks; foreign seats and hosted CI are intentionally omitted.

ROOT's final integration authority requires normal composition of reviewed 1fa5005, mutually exclusive githubPrs/taskActivity/trusted results, one joined quality/focused run and one owned Activity journey. No historical full-suite rerun, shared test instrumentation or retry-to-green is authorized. The exact old PID690372 result stays open and is not fixed or waived by a later passing tree.

## Outcomes & Retrospective

The vertical is usable: Recent Activity opens readable Changes; Pull requests is an explicit separate view with actual GitHub state and bounded file links. Recorded narrative remains explicitly recorded and is not used to invent PR/agent/task associations. Final handoff records exact gates and the deliberately limited github.com-origin-only scope.

Final aggregate quality observed a transient namespace member after another unchanged agent test's confirmed cleanup. The test records an unpinned namespace-number string and separate PID state, so identity reuse is an ambiguity, not an established cause. ROOT was asked to dispose of this exact boundary or authorize narrow test-only identity instrumentation; no retry-to-green or assertion weakening occurred. The independently focused Activity gate and actual UI proof pass but do not waive that failure.

The subsequent ROOT-authorized joined composition passed its one fresh local run and actual read-only GitHub UI journey. It preserves Context Global, task central documents/history, trusted-local controls, resource instruments, lineage and syntax highlighting. Three-way response regression covers positive responses, foreign/mixed results, repository/world identity and trusted token correlation. This new result does not explain the historical failure. The owned GUI ran on :142/55174: the launch supplied SWARM_DEV_PORT, but the harness selects SWARM_VIRTUAL_DESKTOP_PORT (default55174), checks collisions and sets the app port itself. Cleanup was confirmed; the passing journey was not repeated merely to change the port. Future explicit55222 runs should set SWARM_VIRTUAL_DESKTOP_PORT=55222.

## Context and Orientation

`app/renderer/changelog/JournalPanel.tsx` holds the existing log hook, recent feed and main document; `AgentDock.tsx` owns its Recent Activity heading. `App.tsx` owns `showJournal` and retained editor navigation. `protocol/schema.ts` validates bridge requests/responses, while `core/worker-runtime.ts` dispatches them in the privileged local core. New `protocol/github-prs.ts`, `core/github-prs.ts` and `app/renderer/changelog/GithubPullRequests.tsx` isolate the PR feature from agent execution and metrics peers.

## Plan of Work

First remove duplicate/decorative headings and connect the dock heading to existing `showJournal`. Rewrite only the recorded summary document using the same evidence with genuine native author attribution. Then add `githubPrs.refresh` request carrying opened repository/world identity. The core reads a validated GitHub origin, calls fixed `gh pr list` arguments with a 20-item limit, validates all response fields and rereads origin before publication. Return safe GitHub URLs and bounded changed paths with explicit incomplete coverage. The client ignores old responses on identity/core-generation changes and retains successful same-world observations after failure. Mount PR cards in the main Activity document, fetching only on deliberate Refresh.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/activity-pr-instruments`. Materialize with `nix develop --command pnpm install --frozen-lockfile`. Joined validation used `nix develop --command bazel test //:quality //tools/activity-prs:unit --jobs=3 --test_output=errors --nocache_test_results`, then the existing `//tools/activity-prs:smoke` Bazel entry, which builds the actual desktop bundle. For a future owned run set SWARM_VIRTUAL_DISPLAY=:142 and SWARM_VIRTUAL_DESKTOP_PORT=55222; the harness checks collisions. Never automate physical :0.

## Validation and Acceptance

Tests must reject malformed PRs, unsafe URLs/paths, responses for a different repository or command, and late responses after switching world or core. Command tests prove bounded output, timeout/cancellation and no arbitrary shell command. Mounted tests prove explicit fetching, retained stale data, clear emptiness and source activation only through changed-file buttons. Actual owned virtual proof opens Recent Activity, reads fetched or truthfully unavailable PR data, retains source/draft/camera state and records zero unexpected renderer errors and owned cleanup.

## Idempotence and Recovery

Refresh is read-only and can be repeated deliberately. Failures keep the last same-world observation visibly stale; identity changes hide old data immediately. Owned commands settle only after process close. No shared app, settings, credentials, branch or source content is deleted. ROOT owns eventual merge/adoption.

## Artifacts and Notes

Operational notes and raw evidence live at `/tmp/swarm-ide-demo-controls.q2i33c/activity-prs`. This plan and tests are the durable product handoff; no repeated checksum paperwork is required.

## Interfaces and Dependencies

Use existing Zod, React, Node child_process, Git and installed gh. `githubPrs.refresh` accepts only protocol/request/repository/world identifiers; it never accepts shell fragments, executable paths or raw URLs. `GithubPrObservation` identifies repository/world, GitHub owner/name, observed time, coverage and validated PR cards. GitHub links are selectable text unless an already checked external-opening mechanism applies.

Revision note: initial bounded plan updated23:27Z with implemented behavior, native findings, diagnostic distinctions and actual packaged result.

Revision note00:03Z: record ROOT's historical-risk disposition, final reviewed-base composition, exact joined validation and actual owned-port deviation; no broader retest or historical-fix claim.
