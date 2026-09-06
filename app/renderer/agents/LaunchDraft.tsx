import { useMemo, useState } from "react";
import { AGENT_LIMITS, AgentFocusSchema, utf8Bytes, type LaunchContext } from "../../../protocol/agents";
import type { FocusRef } from "../../../protocol/schema";
import { fixtureLaunchContext } from "./client";

export function LaunchDraft({ focus, onLaunch, onClose }: { focus: FocusRef; onLaunch: (context: LaunchContext) => void; onClose: () => void }) {
  // Capture the focus when opened; navigation never silently retargets a draft.
  const [launchFocus] = useState(focus);
  const [task, setTask] = useState("Explain this focus's inputs, outputs and failure cases.");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const context = useMemo(() => {
    if (!task.trim() || utf8Bytes(task) > AGENT_LIMITS.taskBytes || utf8Bytes(model) > 256 || utf8Bytes(effort) > 64 ||
        !AgentFocusSchema.safeParse(launchFocus).success || launchFocus.revisionKind !== "working") return null;
    // Serialization (especially escaped control characters) has its own bound.
    // The exact submitted object, not just individual input lengths, gates launch.
    try { return fixtureLaunchContext(launchFocus, task, model, effort); } catch { return null; }
  }, [launchFocus, task, model, effort]);
  return <form className="agent-draft" onKeyDown={(event) => {
    if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); if (context) onLaunch(context); }
  }} onSubmit={(event) => { event.preventDefault(); if (context) onLaunch(context); }}>
    <header><strong>Launch draft</strong><button type="button" aria-label="Close launch draft" onClick={onClose}>×</button></header>
    <span className="agent-demo-badge">FIXTURE / DEMO · no model execution</span>
    <p className="agent-context-path">{launchFocus.path ?? launchFocus.key}</p>
    <label>Task<textarea autoFocus value={task} onChange={(event) => setTask(event.target.value)} rows={3} maxLength={AGENT_LIMITS.taskBytes} /></label>
    <label>Requested model<input placeholder="Provider default (unresolved)" value={model} maxLength={256} onChange={(event) => setModel(event.target.value)} /></label>
    <label>Requested reasoning<input placeholder="Provider default (unresolved)" value={effort} maxLength={64} onChange={(event) => setEffort(event.target.value)} /></label>
    <p>Disk version only; unsaved edits are not included. This fixture attaches <strong>no file bytes</strong>; disk preparation and revalidation arrive in W2.</p>
    <details><summary>Context, provenance &amp; read scope</summary><p>Captured focus: {launchFocus.revisionKind} / {launchFocus.revisionId}. Fixture hashes and root are synthetic. Instructions and configuration: unobserved.</p><p>Real launch will send selected content to the configured model service. Requested read-only / no tool network / never approve is not yet verified. Read-only is not host confidentiality: the harness may read files accessible to your account.</p></details>
    {!context ? <p role="alert">Use a working-world focus, nonempty task and requested settings within the UTF-8 and total serialized context limits.</p> : null}
    <button className="agent-primary" title="Launch fixture (Ctrl+Enter)" disabled={!context}>Launch fixture — no provider</button>
  </form>;
}
