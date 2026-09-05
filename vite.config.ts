import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function hmrTimingProbe(): Plugin {
  return {
    name: "swarm-hmr-timing-probe",
    handleHotUpdate(context) {
      context.server.ws.send({
        type: "custom",
        event: "swarm:hmr-start",
        data: { file: context.file, sentAt: Date.now() },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), hmrTimingProbe()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
