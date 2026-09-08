import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, type LiveAgentState } from "./live-state";
import "./agent-dock.css";

type DockTab = "agents" | "fixture" | `mock:${string}` | `run:${string}`;
export interface AgentDockProps {
  state: LiveAgentState;
  client: AgentBridgeClient;
  onDraft: () => void;
  runContent: ReactNode;
  draftContent: ReactNode;
  trustedContent?: ReactNode;
  jobsContent: ReactNode;
  activityContent: ReactNode;
  onOpenActivity?: () => void;
  fixtureContent?: ReactNode;
  mockConversation?: {
    tabs: ReadonlyArray<{ id: string; name: string }>;
    selected: string;
    onSelect: (id: string) => void;
    selectionVersion: number;
    content: ReactNode;
  };
  /** Explicit sidebar activation, including a re-click of the selected run. */
  selectionVersion?: number;
  fixtureSelectionVersion?: number;
  /** A new explicit trusted-run activation, never a background observation. */
  trustedSelectionVersion?: string;
}

export function AgentDock({ state, client, onDraft, runContent, draftContent, trustedContent, jobsContent, activityContent, onOpenActivity, fixtureContent, mockConversation, selectionVersion = 0, fixtureSelectionVersion = 0, trustedSelectionVersion }: AgentDockProps) {
  const id = useId();
  const runs = state.snapshot?.runs ?? [];
  const hasSelection = state.selectedRunId !== null;
  const [active, setActive] = useState<DockTab>(() => !state.draft && state.paneOpen && hasSelection ? `run:${state.selectedRunId}` : "agents");
  const previousSelection = useRef({ runId: state.selectedRunId, open: state.paneOpen, version: selectionVersion, selected: hasSelection });
  useEffect(() => {
    const previous = previousSelection.current;
    previousSelection.current = { runId: state.selectedRunId, open: state.paneOpen, version: selectionVersion, selected: hasSelection };
    if (previous.runId === state.selectedRunId && previous.open === state.paneOpen && previous.version === selectionVersion && previous.selected === hasSelection) return;
    if (state.paneOpen && hasSelection) setActive(`run:${state.selectedRunId}`);
    else if (!state.paneOpen) setActive((tab) => tab.startsWith("run:") ? "agents" : tab);
  }, [state.selectedRunId, state.paneOpen, selectionVersion, hasSelection]);
  const draftOpen = Boolean(state.draft);
  useEffect(() => { if (draftOpen) setActive("agents"); }, [draftOpen]);
  const proposalId = state.taskProposal?.id;
  useEffect(() => { if (proposalId) setActive("agents"); }, [proposalId]);
  const fixtureOpen = Boolean(fixtureContent);
  useEffect(() => { if (fixtureOpen) setActive("fixture"); }, [fixtureOpen, fixtureSelectionVersion]);
  const mockSelected = mockConversation?.selected;
  const mockSelectionVersion = mockConversation?.selectionVersion;
  useEffect(() => { if (mockSelected) setActive(`mock:${mockSelected}`); }, [mockSelected, mockSelectionVersion]);
  useEffect(() => { if (trustedSelectionVersion) setActive("agents"); }, [trustedSelectionVersion]);

  const tabs: Array<{ key: DockTab; label: string; detail?: string }> = [
    { key: "agents", label: draftOpen ? "Agents · draft" : "Agents" },
    ...runs.map((run) => ({ key: `run:${run.runId}` as const, label: displayAgentText(run.taskLabel), detail: run.state })),
    ...(state.selectedRunId && !runs.some((run) => run.runId === state.selectedRunId) ? [{ key: `run:${state.selectedRunId}` as const, label: "Unconfirmed run", detail: "unknown" }] : []),
    ...(fixtureContent ? [{ key: "fixture" as const, label: "Fixture · no model turn" }] : []),
    ...(mockConversation?.tabs.map((tab) => ({ key: `mock:${tab.id}` as const, label: tab.name, detail: "mock" })) ?? []),
  ];
  const current = tabs.some((tab) => tab.key === active) ? active : "agents";
  const choose = (tab: DockTab) => {
    if (tab.startsWith("run:")) client.select(tab.slice(4));
    if (tab.startsWith("mock:")) mockConversation?.onSelect(tab.slice(5));
    setActive(tab);
  };
  const tabId = (key: DockTab) => `${id}-tab-${key}`;
  const panelId = (key: DockTab) => `${id}-panel-${key.startsWith("run:") ? "run" : key.startsWith("mock:") ? "mock" : key}`;
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus(); // Manual activation: Enter/Space selects the run.
  };
  return <div className="activity-instruments">
    <section className="dock-side-panel dock-builds" aria-label="Build jobs" tabIndex={0}><header className="dock-section-heading">Builds & resources</header>{jobsContent}</section>
    <section className="agent-interaction-dock" aria-label="Agent messages">
    <div className="agent-dock-tabs" role="tablist" aria-label="Agent conversations" onKeyDown={keyboard}>
      {tabs.map((tab) => <button key={tab.key} id={tabId(tab.key)} role="tab" aria-selected={current === tab.key}
        aria-controls={panelId(tab.key)} aria-label={tab.detail ? `${tab.label} ${tab.detail}` : tab.label} tabIndex={current === tab.key ? 0 : -1} title={tab.detail ? `${tab.label} · ${tab.detail}` : tab.label}
        onClick={() => choose(tab.key)}><span>{tab.label}</span>{tab.detail ? <small className={`agent-state agent-state-${tab.detail}`}>{tab.detail}</small> : null}</button>)}
    </div>
    <div id={panelId("agents")} role="tabpanel" aria-labelledby={tabId("agents")} hidden={current !== "agents"} className="agent-dock-panel agent-dock-home">
      {!draftOpen && !proposalId ? <div className="agent-dock-welcome"><strong>{runs.length ? "Select an agent run" : "Agent interaction"}</strong>
        <p>{runs.length ? "Open a run from the sidebar or its tab to inspect output and send instructions when available."
          : !state.snapshot ? "Agent availability has not been observed yet."
            : state.snapshot.capabilities.availability === "available" ? "No agent runs yet. Prepare a focused draft to begin."
              : trustedContent ? "No isolated read-only runs. Prepare a draft, then choose the separate trusted-local profile below to run Codex."
                : "No live agent runs. Execution is unavailable; you can prepare a draft without launching a run."}</p>
        {state.notice ? <p className="agent-dock-notice" role="status">{displayAgentText(state.notice)}</p> : null}
        <button className="agent-primary" onClick={onDraft}>Prepare an agent draft</button>
      </div> : null}
      {draftContent}
      {trustedContent}
    </div>
    <div id={panelId("run:current")} role="tabpanel" aria-labelledby={state.selectedRunId ? tabId(`run:${state.selectedRunId}`) : undefined}
      hidden={!current.startsWith("run:")} className="agent-dock-panel agent-dock-run">{runContent}</div>
    {fixtureContent ? <div id={panelId("fixture")} role="tabpanel" aria-labelledby={tabId("fixture")} hidden={current !== "fixture"} className="agent-dock-panel agent-dock-run">
      <div className="agent-demo-badge">Fixture preview · not a live agent or model turn</div>{fixtureContent}
    </div> : null}
    {mockConversation ? <div id={panelId("mock:current")} role="tabpanel" aria-labelledby={tabId(`mock:${mockConversation.selected}`)} hidden={!current.startsWith("mock:")} className="agent-dock-panel agent-dock-run">{mockConversation.content}</div> : null}
    </section>
    <section className="dock-side-panel dock-activity" aria-label="Recent activity" tabIndex={0}><header className="dock-section-heading">{onOpenActivity ? <button className="activity-open-heading journal-activity-heading" onClick={onOpenActivity}>Recent Activity <span aria-hidden="true">↗</span></button> : "Recent activity"}</header>{activityContent}</section>
  </div>;
}
