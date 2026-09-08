// Controlled composition only: real App remains mounted beneath the standalone
// browser. The conversation owner integrates its normal entry separately.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../app/renderer/App";
import { AgentWorktreeBrowser } from "../../app/renderer/AgentWorktreeBrowser";
import "../../app/renderer/styles.css";
import "@xyflow/react/dist/style.css";
const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
function Proof() {
  const [selected, select] = useState<string | null>(null);
  return <><div style={{ position: "fixed", bottom: 2, left: 2, zIndex: 10000 }}>
    <button data-worker="A" onClick={() => select(A)}>Explore worker A</button>
    <button data-worker="B" onClick={() => select(B)}>Explore worker B</button>
  </div><div style={{ visibility: selected ? "hidden" : "visible", height: "100vh" }}><App /></div>
    {selected ? <div style={{ position: "fixed", inset: "38px 0 0", zIndex: 9999 }}><AgentWorktreeBrowser
      sessionId={selected} bridge={window.swarm} generation={1} onReturn={() => select(null)} /></div> : null}</>;
}
createRoot(document.getElementById("root")!).render(<Proof />);
