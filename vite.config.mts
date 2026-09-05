import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";

const DEV_WEBSOCKET_ORIGIN = "__SWARM_DEV_WEBSOCKET_ORIGIN__";

export function transformContentSecurityPolicy(
  html: string,
  command: "build" | "serve",
  server: { host?: string | boolean; port?: number },
): string {
  if (!html.includes(DEV_WEBSOCKET_ORIGIN)) {
    throw new Error("index.html is missing the development WebSocket CSP placeholder");
  }
  if (command === "build") return html.replace(DEV_WEBSOCKET_ORIGIN, "");
  if (typeof server.host !== "string" || typeof server.port !== "number") {
    throw new Error("development CSP requires a concrete Vite server host and port");
  }
  return html.replace(DEV_WEBSOCKET_ORIGIN, `ws://${server.host}:${server.port}`);
}

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
  let config: ResolvedConfig | undefined;
  return {
    name: "swarm-content-security-policy",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    transformIndexHtml(html) {
      if (!config) throw new Error("Vite configuration was not resolved before HTML transform");
      return transformContentSecurityPolicy(html, config.command, config.server);
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
