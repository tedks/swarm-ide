import { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../app/renderer/App";
import { RendererBoundary } from "../../app/renderer/RendererBoundary";
import { installRendererDiagnostics } from "../../app/renderer/renderer-health";
import "@xyflow/react/dist/style.css";
import "../../app/renderer/styles.css";

// Test-only fault injector around the unchanged App. Not shipped in the app.
function Fault() {
  const [failed, setFailed] = useState(false);
  if (failed) throw Error("owned controlled render failure");
  return <><button id="simulate-render-failure" style={{ position: "fixed", zIndex: 99999, right: 4, top: 4 }} onClick={() => setFailed(true)}>Simulate render failure</button><App /></>;
}
installRendererDiagnostics(window);
createRoot(document.getElementById("root")!).render(<RendererBoundary><Fault /></RendererBoundary>);
