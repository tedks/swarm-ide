import { useEffect, useId, useRef, useState } from "react";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import {
  WorkLogRequestSchema, WorkLogSettingsSchema,
  type WorkLogEntry, type WorkLogRequest, type WorkLogSettings, type WorkLogSnapshot,
} from "../../../protocol/work-log";
import { ActivityTime } from "../ActivityTime";
import { RunStatus } from "../external-agents/RunStatus";
import "./work-log.css";
export type { WorkLogEntry } from "../../../protocol/work-log";

type Action = { type: "workLog.read" | "workLog.stop" }
  | { type: "workLog.start"; settings: WorkLogSettings }
  | { type: "workLog.record"; entryId: string; taskId: string };
const defaults = WorkLogSettingsSchema.parse({});

/** A single request lane. Reads never start a model; mutations are never retried. */
function useWorkLog(coreGeneration: number) {
  const [snapshot, setSnapshot] = useState<WorkLogSnapshot | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const send = useRef<(action: Action) => void>(() => {});
  useEffect(() => {
    let active = true, inFlight = false, mutationPending = false;
    let queued: Action | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSnapshot(null); setNotice(""); setPending(false);
    const run = async (action: Action) => {
      if (!active) return;
      inFlight = true;
      clearTimeout(timer);
      try {
        if (!window.swarm) throw new Error("Connect to the local core to read the Work Log.");
        const request: WorkLogRequest = WorkLogRequestSchema.parse({ ...action,
          protocolVersion: PROTOCOL_VERSION, requestId: `work-log:${crypto.randomUUID()}` });
        const response = parseCoreResponseForRequest(await window.swarm.request(request), request);
        if (!active) return;
        if (!response.ok) throw new Error(response.error.message);
        if (!response.workLog) throw new Error("The Work Log response was missing.");
        setSnapshot(response.workLog); setNotice("");
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Could not read the Work Log.");
      } finally {
        inFlight = false;
        if (active) {
          if (action.type !== "workLog.read") { mutationPending = false; setPending(false); }
          if (queued) { const next = queued; queued = null; void run(next); }
          else timer = setTimeout(() => void run({ type: "workLog.read" }), 3000);
        }
      }
    };
    send.current = (action) => {
      if (!active || mutationPending) return;
      if (action.type !== "workLog.read") { mutationPending = true; setPending(true); }
      if (inFlight) queued = action;
      else void run(action);
    };
    void run({ type: "workLog.read" });
    return () => { active = false; queued = null; clearTimeout(timer); send.current = () => {}; };
  }, [coreGeneration]);
  return { snapshot, notice, pending, send: (action: Action) => send.current(action) };
}

function Outcome({ entry, pending, onRecord, onOpen, onOpenAgent, onOpenTask }: {
  entry: WorkLogEntry; pending: boolean; onRecord(taskId: string): void;
  onOpen?(entry: WorkLogEntry): void;
  onOpenAgent?(sessionId: string): void; onOpenTask?(taskId: string): void;
}) {
  const [taskId, setTaskId] = useState(entry.taskId ?? "");
  const taskField = useId();
  const validTask = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(taskId);
  return <li className="work-log-entry" data-work-log-entry={entry.id}>
    <div className="work-log-entry-heading">
      {onOpenAgent ? <button className="work-log-link" onClick={() => onOpenAgent(entry.sessionId)}>{entry.agent}</button> : <strong>{entry.agent}</strong>}
      <RunStatus state={entry.state} />
      <ActivityTime at={entry.at} />
    </div>
    {onOpen ? <button className="work-log-outcome work-log-link" onClick={() => onOpen(entry)}>{entry.outcome}</button>
      : <p className="work-log-outcome">{entry.outcome}</p>}
    {entry.taskId ? onOpenTask
      ? <button className="work-log-link" onClick={() => onOpenTask(entry.taskId!)}>Task · {entry.taskId}</button>
      : <small>Task · {entry.taskId}</small> : null}
    <details className="work-log-details"><summary>Details &amp; record</summary>
      {([ ["Changed areas", entry.areas], ["Checks", entry.checks], ["Follow-ups", entry.followUps] ] as const).map(([label, items]) => items.length ? <div key={label}><h4>{label}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null)}
      {entry.recorded ? <p className="work-log-recorded">Recorded in Ditz</p> : <form onSubmit={(event) => { event.preventDefault(); if (validTask && !pending) onRecord(taskId); }}>
        <label htmlFor={taskField}>Completed Ditz issue</label>
        <div className="work-log-record-controls"><input id={taskField} value={taskId} maxLength={200}
          placeholder="Issue ID" onChange={(event) => setTaskId(event.target.value)} disabled={pending} />
          <button type="submit" disabled={pending || !validTask}>Record outcome</button></div>
      </form>}
    </details>
  </li>;
}

export function WorkLogPanel({ onOpen, onAgent, onTask, onOpenAgent, onOpenTask, coreGeneration = 0 }: {
  onOpen?(entry: WorkLogEntry): void; onAgent?(sessionId: string): void; onTask?(taskId: string): void;
  onOpenAgent?(sessionId: string): void; onOpenTask?(taskId: string): void; coreGeneration?: number;
}) {
  const { snapshot, notice, pending, send } = useWorkLog(coreGeneration);
  const [settings, setSettings] = useState<WorkLogSettings>(defaults);
  const editedSettings = useRef(false);
  const settingsId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (snapshot && !editedSettings.current) setSettings(snapshot.settings);
  }, [snapshot]);
  const validSettings = WorkLogSettingsSchema.safeParse(settings).success;
  const settingsDisabled = pending || Boolean(snapshot?.running);
  const updateSettings = (change: Partial<WorkLogSettings>) => {
    editedSettings.current = true; setSettings((current) => ({ ...current, ...change }));
  };
  const entries = [...(snapshot?.entries ?? [])].sort((left, right) =>
    Number(right.state === "working") - Number(left.state === "working") || right.at.localeCompare(left.at));
  return <section className="work-log-panel" aria-label="Work Log">
    <header className="work-log-heading"><h3>Work Log</h3><span>{snapshot?.summarizing ? "Summarizing…" : snapshot?.running ? "Watching" : "Stopped"}</span>
      <button disabled={!snapshot || pending || (!snapshot.running && !validSettings)}
        onClick={() => send(snapshot?.running ? { type: "workLog.stop" } : { type: "workLog.start", settings })}>
        {snapshot?.running ? "Stop" : "Start"}
      </button>
      <button type="button" className="work-log-settings-toggle" aria-label="Summary settings" title="Summary settings"
        aria-expanded={settingsOpen} aria-controls={`${settingsId}-settings`} onClick={() => setSettingsOpen((open) => !open)}><span aria-hidden="true">⚙</span></button>
    </header>
    <div className="work-log-settings" id={`${settingsId}-settings`} hidden={!settingsOpen}>
      <div><label htmlFor={`${settingsId}-harness`}>Harness</label><select id={`${settingsId}-harness`} value={settings.harness} disabled={settingsDisabled} onChange={() => {}}><option value="codex">Codex</option></select></div>
      <div><label htmlFor={`${settingsId}-model`}>Model</label><input id={`${settingsId}-model`} value={settings.model} disabled={settingsDisabled}
        maxLength={80} onChange={(event) => updateSettings({ model: event.target.value })} /></div>
      <div><label htmlFor={`${settingsId}-debounce`}>Batch delay (seconds)</label><input id={`${settingsId}-debounce`} type="number" min={10} max={600} step={1}
        value={Number.isNaN(settings.debounceSeconds) ? "" : settings.debounceSeconds} disabled={settingsDisabled}
        onChange={(event) => updateSettings({ debounceSeconds: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></div>
      <p>Summarize new agent turns. Stop to change settings.</p>
    </div>
    {notice ? <p className="work-log-notice" role="status">{notice}</p> : null}
    {snapshot?.notice && !notice ? <p className="work-log-notice" role="status">{snapshot.notice}</p> : null}
    {!entries.length ? <p className="work-log-empty">{snapshot?.running ? "Watching for completed agent turns…" : snapshot ? "Start to collect what your agents have accomplished." : "Reading Work Log…"}</p> : null}
    <ol className="work-log-entries">{entries.map((entry) => <Outcome key={entry.id} entry={entry} pending={pending}
      onOpen={onOpen} onOpenAgent={onAgent ?? onOpenAgent} onOpenTask={onTask ?? onOpenTask} onRecord={(taskId) => send({ type: "workLog.record", entryId: entry.id, taskId })} />)}</ol>
  </section>;
}

/** Pure selected-entry surface for the center pane. It owns no polling or
 * mutation route; the dock panel remains the one summary/control surface. */
export function WorkLogEntryDetail({ entry, onAgent, onTask, onClose }: {
  entry: WorkLogEntry; onAgent?(sessionId: string): void; onTask?(taskId: string): void; onClose?(): void;
}) {
  return <section className="work-log-panel work-log-entry-detail" aria-label="Work Log outcome">
    <header className="work-log-heading"><h2>Work Log</h2>{onClose ? <button onClick={onClose}>Close</button> : null}</header>
    <div className="work-log-entry-heading">
      {onAgent ? <button className="work-log-link" onClick={() => onAgent(entry.sessionId)}>{entry.agent}</button> : <strong>{entry.agent}</strong>}
      <RunStatus state={entry.state} /><ActivityTime at={entry.at} />
    </div>
    <p className="work-log-outcome">{entry.outcome}</p>
    {entry.taskId ? onTask ? <button className="work-log-link" onClick={() => onTask(entry.taskId!)}>Task · {entry.taskId}</button> : <p>Task · {entry.taskId}</p> : null}
    {([ ["Changed areas", entry.areas], ["Checks", entry.checks], ["Follow-ups", entry.followUps] ] as const).map(([label, items]) =>
      items.length ? <section key={label}><h3>{label}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section> : null)}
    {entry.recorded ? <p className="work-log-recorded">Recorded in Ditz</p> : null}
  </section>;
}
