import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./hmr-probe.css";
import "./styles.css";
import { App } from "./App";
import { RendererBoundary } from "./RendererBoundary";
import { installRendererDiagnostics } from "./renderer-health";

const stopDiagnostics = installRendererDiagnostics(window);
if (import.meta.hot) import.meta.hot.dispose(stopDiagnostics);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RendererBoundary><App /></RendererBoundary>
  </StrictMode>,
);
