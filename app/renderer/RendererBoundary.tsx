import { Component, useEffect, useState, type ReactNode } from "react";
import { recoveryText, type RecoveryText } from "./renderer-health";
import "./renderer-health.css";

function FailureScreen({ text }: { text: RecoveryText[] }) {
  const [allowClose, setAllowClose] = useState(false);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (!allowClose) window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [allowClose]);
  return <main className="renderer-failure" role="alert">
    <h1>The interface stopped rendering</h1>
    <p>The window has not been reloaded. Copy any text you need below before reopening it.</p>
    <p>Agent processes may still be running. Check the conversation before resending a message.</p>
    {text.length ? <><h2>Retained text</h2><p>These are local copies, not confirmation that a save or message completed.</p>
      {text.map((item, index) => <section key={index}>
        <label htmlFor={`recovery-text-${index}`}>{item.label}</label>
        <textarea id={`recovery-text-${index}`} readOnly value={item.text} spellCheck={false} />
        <button type="button" onClick={() => { const area = document.getElementById(`recovery-text-${index}`) as HTMLTextAreaElement | null; area?.focus(); area?.select(); }}>Select {item.label}</button>
      </section>)}</> : <p>No text snapshot was available.</p>}
    <p>Other unsaved state may not be recoverable. Previously saved submissions remain in this profile's message history; unconfirmed local operations are shown above when available.</p>
    <label className="renderer-failure-ack"><input type="checkbox" checked={allowClose} onChange={(event) => setAllowClose(event.target.checked)} />
      I have copied what I need. Allow closing or reloading this window.</label>
    {allowClose ? <p>Use View → Reload (Ctrl+R), or close and reopen the window. No operation will be resent automatically.</p> : null}
  </main>;
}

export class RendererBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private captured: RecoveryText[] | undefined;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error("[renderer-health] render-error"); }
  render() {
    if (!this.state.failed) return this.props.children;
    // Cleanup can itself throw after readers are gone. Never replace the first
    // captured buffers with a later empty snapshot from that second failure.
    this.captured ??= recoveryText.read();
    return <FailureScreen text={this.captured} />;
  }
}
