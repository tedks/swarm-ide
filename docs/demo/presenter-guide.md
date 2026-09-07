# Present the connected demo

Use [the five-minute tour](../demo.md) as the click path.

## Before sharing the screen

Use a disposable Swarm checkout with dependencies installed and the actual
local `ditz-metadata` branch fetched. Start through the README's Nix/Bazel command
on an unoccupied port. No model key or registry is necessary. Refresh Tasks,
choose All, and confirm `repo-task-context-core-d4` resolves. Load the Plan index.
Do not include private session data in distributed archives or screenshots.

The default window can require scrolling inside panels. Scroll the Plan
inspector for selected links and the draft for Prepare. Avoid a live resize-heavy
performance test: the exact known ResizeObserver warning remains tracked.

## Five-minute narration

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:50 | Plan, task-context component, briefing, Why this context? | “Intent, contract, implementation and lessons live alongside the code.” |
| 0:50–1:30 | Actual D4 task; Task blockage and coverage | “Containment and dependency are different graphs; recorded work is not dispatch authority.” |
| 1:30–2:15 | Source, Build graph, source-focused draft | “I change perspective without losing the file or retargeting the assignment.” |
| 2:15–3:35 | Attach, keep instructions, Prepare, exact prompt | “The assignment is bounded and inspectable. Preparation is local and real; launch is gated.” |
| 3:35–4:40 | Recent activity → Logical changes → evidence | “Read logical changes and decisions, not several walls of agent transcripts.” |
| 4:40–5:00 | Optional known external session, or return to source | “Observation is available when configured. The core tour needs no credentials.” |

Do not read checksums aloud; they support freshness and integrity, not the story.

## Recover honestly

Empty Tasks: check local `ditz-metadata`, Refresh, select All for closed work, and
search the full ID. Missing task descriptions or references: say so and use the
component's explicit source link. Do not substitute invented references.

Task graph: at most 64 detail records, not filtered by the rail search. Partial
coverage is expected in a larger repo. Find specific work through direct
component links or the rail instead of hunting for absent nodes.

Build graph: if unavailable or retained, explain its status and continue with
actual source/design. A declaration query is not a binary build. Swarm's example
service topology is not a general service detector.

Prepare: if metadata advanced, Refresh tasks, inspect and explicitly reattach,
then Prepare again. Do not silently update a pinned draft. Keep Launch disabled;
no account login belongs in this tour.

Observer: absent private registry means skip it. Otherwise choose a known entry
manually. D4/D5/D6 are report labels, not verified session IDs or native
Journal-to-session links. Never distribute the operator registry.

## Live, recorded or synthetic?

Directory/source, local Ditz reads, authored Plan reads, Bazel declaration queries
and prepared task/disk context are actual local operations. This briefing and
the plan index are authored artifacts, not inferred architecture.

Logical Activity is supervised-agent-generated **recorded output**, combining
Git observations and attributed reports. The UI neither runs that summarizer nor
reruns reported tests. See [the authoring loop](../logical-changelog.md).
Synthetic agent rehearsals and disposable observer examples are separate
verification demonstrations, not managed model turns. No synthetic observer is
needed for the main tour.

## Joined walkthrough gaps

There is no automatic Plan → complete effective prompt expansion, task → verified
session join, or Journal → observed-session selection. The human follows
authored guidance and optionally looks up a registered session manually. There
is no in-app summarizer scheduler or verified managed launch.

Task descriptions/references can be sparse and the first 64 graph records may
not include the narrated feature. Viewport density can require scrolling.
`docs/repo-task-draft.md` still opens with historical D3-only status; the new
briefing explicitly distinguishes that from current preparation.

## Reproduce the owned walkthrough

After dependency installation, from this checkout:

```bash
SWARM_VIRTUAL_DISPLAY=:135 SWARM_VIRTUAL_DESKTOP_PORT=55215 \
  nix develop --command bazel run --jobs=3 //tools/demo-tour:smoke
```

The manual proof uses the packaged product on supervisor-owned virtual X11,
copies committed source and the actual local metadata branch into private
temporary storage, and leaves screenshots/results under `artifacts/demo-tour/`.
It never automates the physical desktop, changes user files, creates fake tasks,
or starts a model. Local metadata must exist. Evidence describes that copied
observation, not future metadata or every repository.

The smoke rejects ambient Git redirection/configuration overrides; run it from
an ordinary shell without those overrides. Editor/pager preferences are accepted
but removed from its noninteractive Git environment. Missing metadata or a port
collision fails closed rather than touching another repository or process.

The September 7 joined validation used actual Swarm history and Ditz metadata:
Plan/briefing/contract → D4 → source and a current file-owner build graph →
Attach/Prepare → recorded Activity. Source text/cursor, draft and graph instances
survived Activity inspection. The task graph reported 64/160 details, not complete
coverage. The run had no renderer errors or model mutations; the optional
observer was not configured and was not replaced with synthetic data. Screenshots
are generated by the reproducible command above; the smoke is an automated
interaction proof, not a timed usability study of a human presenter.
