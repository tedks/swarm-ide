import { useState } from "react";
import "./ui-demo.css";

export const MOCK_AGENTS = [
  { id: "aster", name: "Aster", task: "Refine the workbench", path: "app/renderer", status: "implementing", text: "I’m adjusting the workbench layout while keeping the editor and graph cameras in place." },
  { id: "lumen", name: "Lumen", task: "Trace build boundaries", path: "core", status: "planning", text: "I’ve mapped the local-core boundary. Next I would check the source contracts and dependent targets." },
  { id: "quill", name: "Quill", task: "Verify the change", path: "tests", status: "testing", text: "The simulated test run is checking navigation, retained drafts, and graph focus." },
] as const;
export type DemoCommand = "runs" | "conversation" | "graphs" | "context" | "all" | "clear";
export function useUiDemo() {
  const [runs, setRuns] = useState(false), [conversation, setConversation] = useState(false);
  const [graphs, setGraphs] = useState(false), [context, setContext] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);
  const [selected, setSelected] = useState<string>("aster"), [selectionVersion, setSelectionVersion] = useState(0);
  const select = (id: string) => { setSelected(id); setConversation(true); setSelectionVersion((n) => n + 1); };
  const command = (action: DemoCommand) => {
    if (action === "clear") { setRuns(false); setConversation(false); setGraphs(false); setContext(false); return; }
    if (["runs", "conversation", "all"].includes(action)) setRuns(true);
    if (["conversation", "all"].includes(action)) { setConversation(true); setSelectionVersion((n) => n + 1); }
    if (["graphs", "all"].includes(action)) { setGraphs(true); setGraphVersion((n) => n + 1); }
    if (["context", "all"].includes(action)) setContext(true);
  };
  return { runs, conversation, graphs, graphVersion, context, selected, selectionVersion, select, command };
}

export function MockRunRail({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return <section className="mock-run-rail" aria-label="Mock agent runs"><header>MOCK RUNS · no processes</header>{MOCK_AGENTS.map((agent) => <button key={agent.id} className="agent-run-select" aria-pressed={selected === agent.id} onClick={() => onSelect(agent.id)}><span className="agent-demo-badge">mock · {agent.status}</span><strong>{agent.name} · {agent.task}</strong><small>{agent.path}</small></button>)}</section>;
}

export function MockConversation({ selected }: { selected: string }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const agent = MOCK_AGENTS.find((item) => item.id === selected) ?? MOCK_AGENTS[0];
  const draft = drafts[agent.id] ?? "";
  return <section className="mock-conversation" aria-label="Mock agent conversation">
    <header><span>MOCK CONVERSATION · scripted, no model requests</span><span>{agent.name} · {agent.path}</span></header>
    <div className="mock-transcript" role="log" aria-label="Mock transcript"><p><b>{agent.name}</b> <small>{agent.status} · {agent.path}</small><br />{agent.text}</p><p className="mock-tool">◇ Read source context → inspect contracts → prepare a focused change <small>simulated activity</small></p>{(messages[agent.id] ?? []).map((text, index) => <p key={index}><b>{index % 2 ? agent.name : "You"}</b><br />{text}</p>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; setMessages((before) => ({ ...before, [agent.id]: [...(before[agent.id] ?? []), draft, "Mock acknowledgement: I would use that direction for the next step. Nothing was sent to a model."].slice(-20) })); setDrafts((before) => ({ ...before, [agent.id]: "" })); }}><textarea aria-label="Message mock agent" placeholder={`Direct ${agent.name}… (mock only)`} rows={2} maxLength={2000} value={draft} onChange={(event) => setDrafts((before) => ({ ...before, [agent.id]: event.target.value }))} /><button disabled={!draft.trim()}>Send mock message</button></form>
  </section>;
}

export function MockContext({ focus }: { focus: string }) {
  return <section className="mock-context" aria-label="Mock context"><header>MOCK CONTEXT · illustrative data for {focus}</header>
    <article className="widget"><header><span>Deployment</span><b>MOCK</b></header><div className="mock-deployment"><strong>production · healthy</strong><span>v0.8.3 · 3 replicas · canary 10%</span><small>working → build #1842 → prod / eu-west</small></div></article>
    <article className="widget"><header><span>Build & test history</span><b>MOCK</b></header><table><thead><tr><th>Run</th><th>Result</th><th>Time</th><th>Tests</th></tr></thead><tbody><tr><td>#1842</td><td>passed</td><td>24.1s</td><td>1,084 / 1,084</td></tr><tr><td>#1841</td><td>failed</td><td>18.8s</td><td>2 failed</td></tr><tr><td>#1840</td><td>passed</td><td>23.4s</td><td>1,082 / 1,082</td></tr></tbody></table><small>Illustrative invocation history · not connected to Sponge/BES</small></article>
    <article className="widget"><header><span>Build resources</span><b>MOCK</b></header><div className="mock-bars" aria-label="Mock resource chart">{[24, 38, 65, 90, 76, 84, 58, 41, 26, 12].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><small>CPU peak 280% · memory peak 1.8 GiB · cache hits 92%</small></article>
    <article className="widget"><header><span>Runtime & failures</span><b>MOCK</b></header><p>Latency p50 12ms · p90 31ms · p99 84ms</p><p>Earlier test failure: retry timeout at the service boundary. Linked follow-up: investigate backoff jitter.</p><small>Sample telemetry and failure text—not observed for this source.</small></article>
  </section>;
}
