import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, type LiveAgentState } from "./live-state";
import { cockpitAgentNotice } from "./LiveRunRail";
import "./agent-dock.css";
import { OverflowStrip } from "../OverflowStrip";
import { useConversationTabs, type RegisteredConversations } from "./conversation-tabs";
import { RunStatus } from "../external-agents/RunStatus";
import { AGENT_EXECUTION_LABELS } from "../../../protocol/agent-lifecycle";

type DockTab = "conversation" | "agents" | "fixture" | `mock:${string}` | `run:${string}` | `registered:${string}`;
export interface AgentDockProps {
  state: LiveAgentState;
  client: AgentBridgeClient;
  onDraft: () => void;
  runContent: ReactNode;
  draftContent: ReactNode;
  trustedContent?: ReactNode;
  jobsContent: ReactNode;
  workLogContent?: ReactNode;
  activityContent: ReactNode;
  onOpenActivity?: () => void;
  conversation?: { content: ReactNode; actions?: ReactNode; selectionVersion?: string; registered?: RegisteredConversations };
  /** Do not let a background pane shortcut compete with the global palette. */
  shortcutsBlocked?: boolean;
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

export function AgentDock({ state, client, onDraft, runContent, draftContent, trustedContent, jobsContent, workLogContent, activityContent, onOpenActivity, conversation, shortcutsBlocked = false, fixtureContent, mockConversation, selectionVersion = 0, fixtureSelectionVersion = 0, trustedSelectionVersion }: AgentDockProps) {
  const id = useId();
  const runs = state.snapshot?.runs ?? [];
  const notice = cockpitAgentNotice(state, Boolean(trustedContent));
  const hasSelection = state.selectedRunId !== null;
  const [active, setActive] = useState<DockTab>(() => !state.draft && state.paneOpen && hasSelection ? `run:${state.selectedRunId}` : conversation && !state.draft ? "conversation" : "agents");
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
  const conversationSelection = conversation?.selectionVersion;
  const registered = conversation?.registered;
  const conversations = useConversationTabs(registered, conversationSelection);
  const selectedConversation = registered?.selected;
  const previousConversation = useRef(conversationSelection);
  useEffect(() => {
    if (conversationSelection && previousConversation.current !== conversationSelection) {
      setActive(selectedConversation ? `registered:${selectedConversation}` : "conversation");
    }
    previousConversation.current = conversationSelection;
  }, [conversationSelection, selectedConversation]);

  const selectedTab = conversations.tabs.find((session) => session.id === selectedConversation);
  const effective = active === "conversation" && selectedTab ? `registered:${selectedTab.id}` as const : active;
  const tabs: Array<{ key: DockTab; label: string; detail?: string; badge?: ReactNode; disabled?: boolean }> = [
    ...(conversation && !registered ? [{ key: "conversation" as const, label: "Conversation" }] : []),
    ...conversations.tabs.map((session) => ({ key: `registered:${session.id}` as const, label: session.label,
      detail: AGENT_EXECUTION_LABELS[registered?.sessions ? session.lifecycle?.state ?? "unknown" : "unknown"],
      badge: <RunStatus state={registered?.sessions ? session.lifecycle?.state : undefined} />, disabled: !registered?.sessions })),
    ...(!conversation || draftOpen || proposalId || trustedSelectionVersion ? [{ key: "agents" as const,
      label: conversation ? draftOpen || proposalId ? "Draft" : "Codex" : draftOpen ? "Agents · draft" : "Agents" }] : []),
    ...runs.map((run) => ({ key: `run:${run.runId}` as const, label: displayAgentText(run.taskLabel), detail: run.state })),
    ...(state.selectedRunId && !runs.some((run) => run.runId === state.selectedRunId) ? [{ key: `run:${state.selectedRunId}` as const, label: "Unconfirmed run", detail: "unknown" }] : []),
    ...(fixtureContent ? [{ key: "fixture" as const, label: "Fixture · no model turn" }] : []),
    ...(mockConversation?.tabs.map((tab) => ({ key: `mock:${tab.id}` as const, label: tab.name, detail: "mock" })) ?? []),
  ];
  // A tools visit needs no generic tab. Missing/closed sessions never borrow a
  // different tab's label without an explicit selection of that agent.
  const current: DockTab = effective === "agents" || tabs.some((tab) => tab.key === effective) ? effective : "conversation";
  const showingConversation = current.startsWith("registered:") || current === "conversation" && !registered;
  const tabStop = tabs.find((tab) => tab.key === current && !tab.disabled)?.key ?? tabs.find((tab) => !tab.disabled)?.key;
  const choose = (tab: DockTab) => {
    if (tabs.find((entry) => entry.key === tab)?.disabled) return;
    if (tab.startsWith("registered:")) registered?.onSelect(tab.slice(11));
    if (tab.startsWith("run:")) client.select(tab.slice(4));
    if (tab.startsWith("mock:")) mockConversation?.onSelect(tab.slice(5));
    setActive(tab);
  };
  const tabId = (key: DockTab) => `${id}-tab-${key}`;
  const panelId = (key: DockTab) => `${id}-panel-${key.startsWith("registered:") ? "conversation" : key.startsWith("run:") ? "run" : key.startsWith("mock:") ? "mock" : key}`;
  const pane = useRef<HTMLElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const focusTab = (key: DockTab) => {
    const tab = pane.current?.querySelector<HTMLButtonElement>(`[id="${tabId(key)}"]`);
    if (tab && !tab.disabled) tab.focus();
    else toolsButton.current?.focus();
  };
  const close = (key: DockTab) => {
    const index = tabs.findIndex((tab) => tab.key === key);
    const next = tabs.slice(index + 1).find((tab) => !tab.disabled) ?? tabs.slice(0, index).reverse().find((tab) => !tab.disabled);
    conversations.dismiss(key.slice(11));
    if (current === key) {
      if (next) { choose(next.key); focusTab(next.key); }
      else { setActive("conversation"); toolsButton.current?.focus(); }
    } else focusTab(current);
  };
  const cycle = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.ctrlKey || event.key !== "Tab" || event.altKey || event.metaKey || event.defaultPrevented
      || event.nativeEvent.isComposing || event.keyCode === 229 || shortcutsBlocked
      || (event.target as Element).closest('[role="dialog"], [aria-modal="true"], dialog')) return;
    const available = tabs.filter((tab) => !tab.disabled);
    const index = available.findIndex((tab) => tab.key === current);
    if (!available.length || (available.length === 1 && index === 0)) return;
    event.preventDefault(); event.stopPropagation();
    const next = available[index < 0 ? (event.shiftKey ? available.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + available.length) % available.length]!;
    choose(next.key); focusTab(next.key);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]:not(:disabled)")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus(); // Manual activation: Enter/Space selects the run.
  };
  return <div className={`activity-instruments${workLogContent ? " has-work-log" : ""}`}>
    <section className="dock-side-panel dock-builds" aria-label="Build jobs" tabIndex={0}><header className="dock-section-heading">Builds & resources</header>{jobsContent}</section>
    <section ref={pane} className="agent-interaction-dock" aria-label="Agent messages" onKeyDown={cycle}>
    <header className="agent-conversation-header" title={registered ? "Ctrl+Tab / Ctrl+Shift+Tab · switch conversations" : undefined}>
    <OverflowStrip className="agent-tabs-strip" label="agent conversations" activeKey={current}><div className="agent-dock-tabs" role="tablist" aria-label="Agent conversations" onKeyDown={keyboard}>
      {tabs.map((tab) => <div className="agent-tab-item" role="presentation" key={tab.key}><button id={tabId(tab.key)} role="tab" aria-selected={current === tab.key}
        aria-controls={panelId(tab.key)} disabled={tab.disabled} aria-label={tab.detail ? `${tab.label} ${tab.detail}` : tab.label} tabIndex={tabStop === tab.key ? 0 : -1} title={tab.detail ? `${tab.label} · ${tab.detail}` : tab.label}
        onClick={() => choose(tab.key)}><span>{tab.label}</span>{tab.badge ?? (tab.detail ? <small className={`agent-state agent-state-${tab.detail}`}>{tab.detail}</small> : null)}</button>
        {tab.key.startsWith("registered:") ? <button className="agent-tab-close" aria-label={`Close conversation ${tab.label}`} title="Close tab (keeps agent running)" onClick={() => close(tab.key)}>×</button> : null}</div>)}
    </div></OverflowStrip>
    <div className="agent-header-actions">
      {showingConversation ? conversation?.actions : null}
      {conversation ? <button ref={toolsButton} type="button" aria-label="Agent tools" title="New agent and saved native conversations" aria-pressed={current === "agents"}
        onClick={() => setActive("agents")}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg></button> : null}
    </div>
    </header>
    {registered && current === "conversation" ? <div className="agent-dock-empty" role="status">Select an agent from the fork list, or open Agent tools to start one.</div> : null}
    {conversation ? <div id={panelId("conversation")} role="tabpanel" aria-labelledby={current.startsWith("registered:") || !registered ? tabId(current.startsWith("registered:") ? current : "conversation") : undefined}
      aria-label={!showingConversation ? "Agent conversation" : undefined} hidden={!showingConversation} className="agent-dock-panel agent-dock-conversation">{conversation.content}</div> : null}
    {conversation && notice ? <p className="agent-dock-operation-notice" role="status">{displayAgentText(notice)}</p> : null}
    <div id={panelId("agents")} role="tabpanel" aria-labelledby={tabs.some((tab) => tab.key === "agents") ? tabId("agents") : undefined}
      aria-label={tabs.some((tab) => tab.key === "agents") ? undefined : "Agent tools"} hidden={current !== "agents"} className="agent-dock-panel agent-dock-home">
      {!draftOpen && !proposalId ? <div className="agent-dock-welcome"><strong>{runs.length ? "Select an agent run" : "Agent interaction"}</strong>
        <p>{runs.length ? "Open a run from the sidebar or its tab to inspect output and send instructions when available."
          : trustedContent ? "Prepare a focused draft to start Codex, or select a running agent to continue."
            : !state.snapshot ? "Agent availability has not been observed yet."
            : state.snapshot.capabilities.availability === "available" ? "No agent runs yet. Prepare a focused draft to begin."
              : "No live agent runs. Execution is unavailable; you can prepare a draft without launching a run."}</p>
        {!conversation && notice ? <p className="agent-dock-notice" role="status">{displayAgentText(notice)}</p> : null}
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
    {workLogContent ? <div className="dock-side-panel dock-work-log" tabIndex={0} role="group" aria-label="Work Log column">{workLogContent}</div> : null}
    <section className="dock-side-panel dock-activity" aria-label="Activity" tabIndex={0}><header className="dock-section-heading">{onOpenActivity ? <button className="activity-open-heading journal-activity-heading" onClick={onOpenActivity}>Activity <span aria-hidden="true">↗</span></button> : "Activity"}</header>{activityContent}</section>
  </div>;
}
