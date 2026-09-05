import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";

const DEV_WEBSOCKET_ORIGIN = "__SWARM_DEV_WEBSOCKET_ORIGIN__";

function hmrTimingProbe(): Plugin {
  return {
    name: "swarm-hmr-timing-probe",
    handleHotUpdate(context) {
      if (!context.file.includes("/app/renderer/")) return;
      context.server.ws.send({
        type: "custom",
        event: "swarm:hmr-start",
        data: { file: context.file, sentAt: Date.now() },
      });
    },
  };
}

function contentSecurityPolicy(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "swarm-content-security-policy",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    transformIndexHtml(html) {
      const webSocketOrigin =
        config.command === "serve"
          ? ` ws://${String(config.server.host)}:${config.server.port}`
          : "";
      if (!html.includes(DEV_WEBSOCKET_ORIGIN)) {
        throw new Error("index.html is missing the development WebSocket CSP placeholder");
      }
      return html.replace(DEV_WEBSOCKET_ORIGIN, webSocketOrigin);
    },
  };
}

export default defineConfig({
  plugins: [react(), hmrTimingProbe(), contentSecurityPolicy()],
  server: {
    allowedHosts: ["127.0.0.1"],
    cors: false,
    strictPort: true,
    watch: {
      ignored: ["**/bazel-*/**", "**/dist/**", "**/dist-node/**", "**/artifacts/**"],
    },
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
