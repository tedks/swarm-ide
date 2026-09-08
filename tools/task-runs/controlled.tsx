// TEST ONLY: a standalone presentation proof. No production bridge or provider.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { AgentTaskReferenceSchema } from "../../protocol/agent-task";
import { TaskTrustedRuns } from "../../app/renderer/tasks/TaskTrustedRuns";
import type { TaskTrustedSnapshot, TaskTrustedRun } from "../../app/renderer/tasks/trusted-runs";

const worldId = "controlled-world", repositoryId = "controlled-repository";
const reference = (taskId: string) => AgentTaskReferenceSchema.parse({ version: 1, worldId, repositoryId, provider: "ditz", taskId,
  metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) }, issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } });
const makeRun = (index: number, taskId: string): TaskTrustedRun => ({ runToken: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  title: `Controlled ${taskId} conversation`, createdAt: "2026-09-07T12:00:00Z", updatedAt: "2026-09-07T13:00:00Z",
  status: "ready", archived: false, approvalCount: 0, taskReference: reference(taskId), message: "Controlled admitted-reference presentation; no model turn." });
const runA = makeRun(1, "task-a"), runB = makeRun(2, "task-b"), archivedA = { ...makeRun(3, "task-a"), archived: true, title: "Archived A" };
const wrongRepository = { ...makeRun(4, "task-a"), taskReference: { ...reference("task-a"), repositoryId: "other-repository" } };
const wrongWorld = { ...makeRun(5, "task-a"), taskReference: { ...reference("task-a"), worldId: "other-world" } };
const unlinked = { ...makeRun(6, "task-a"), taskReference: null };
const allRuns = [runA, runB, archivedA, wrongRepository, wrongWorld, unlinked];
const observation = (run: TaskTrustedRun): TaskTrustedSnapshot => ({ instanceId: "00000000-0000-4000-8000-000000000010",
  runToken: run.runToken, output: `CONTROLLED OUTPUT ${run.taskReference!.taskId}`, taskReference: run.taskReference,
  runs: allRuns, archived: run.archived, activities: [{ id: "controlled-activity", at: "2026-09-07T13:00:00Z", turnId: "controlled-turn",
    kind: "turn", status: "completed", summary: "Controlled finished turn; issue remains open." }] });

function Source() {
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = new EditorView({ parent: parent.current!, state: EditorState.create({ doc: "const source = 'retained';\n", selection: { anchor: 5 } }) });
    return () => editor.destroy();
  }, []);
  return <div ref={parent} data-testid="source" />;
}
function Controlled() {
  const [taskId, selectTask] = useState("task-a"), [snapshot, setSnapshot] = useState(observation(runA));
  const [connected, setConnected] = useState(true), [opened, setOpened] = useState<string[]>([]);
  return <main>
    <h1>Controlled task-run presentation</h1><p>No provider, production bridge, real task admission or integrated App claim.</p>
    <section className="controls"><button id="task-a" onClick={() => selectTask("task-a")}>Inspect task A</button>
      <button id="task-b" onClick={() => selectTask("task-b")}>Inspect task B</button>
      <button id="update-a" onClick={() => setSnapshot(observation(runA))}>Deliver old A observation</button>
      <button id="update-b" onClick={() => setSnapshot(observation(runB))}>Deliver B observation</button>
      <button id="archive" onClick={() => setSnapshot(observation(archivedA))}>Observe archived A</button>
      <button id="disconnect" onClick={() => setConnected(false)}>Disconnect observation</button></section>
    <div className="grid"><section><h2>Retained work</h2><Source />
      <label>Independent draft<textarea id="draft" defaultValue="Retained agent draft" /></label>
      <div id="graph" style={{ transform: "translate(17px, 11px) scale(0.9)" }}>Stable graph stand-in · source → service</div>
      <p id="task-focus">Task focus: {taskId}</p><p id="issue-status">Issue status: open</p>
      <p id="opened" data-count={opened.length}>Opened: {opened.join(", ") || "none"}</p><p>No command transport installed.</p></section>
      <TaskTrustedRuns scope={{ worldId, repositoryId, taskId }} observation={{ snapshot, retained: !connected }} connected={connected}
        onOpen={(token) => setOpened((current) => [...current, token])} /></div>
  </main>;
}
const style = document.createElement("style");
style.textContent = "body{margin:0;background:#12161d;color:#e1e6ef;font:14px system-ui}main{padding:24px}h1{font-size:20px}button{background:#283445;color:#ecf1f9;border:1px solid #586b85;padding:7px;border-radius:5px;cursor:pointer}button:disabled{opacity:.4}.controls{display:flex;gap:8px;margin:20px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:30px}textarea{display:block;box-sizing:border-box;width:90%;min-height:90px;margin:12px 0;background:#1b2230;color:white}.cm-editor{min-height:120px;border:1px solid #415167;background:#1b2230}.cm-content{font-family:monospace}#graph{border:1px solid #5b718e;padding:24px;width:80%;margin:20px 0}.task-hint,small{color:#9ba9bd}.task-trusted-runs{max-height:620px;overflow:auto}pre{white-space:pre-wrap}";
document.head.append(style);
createRoot(document.getElementById("root")!).render(<Controlled />);
