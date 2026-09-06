/** Fixed automation in a separate test entry, no public IPC/eval endpoint. */
import { app, BrowserWindow } from "electron";
import { createServer } from "node:net";
import { chmod, lstat, readFile, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { control, crashCore, fixtureGeneration } from "./agent-journey-launch";
import { runJourney } from "./agent-journey-driver";
import "../../app/electron/main";

app.on("browser-window-created", (_event, window) => {
  window.webContents.on("did-finish-load", () => {
    void window.webContents.executeJavaScript(`(() => {
      const label = document.createElement('div'); label.id = 'test-only-journey-label';
      label.textContent = 'TEST FIXTURE · no model or external agent process';
      label.style.cssText = 'position:fixed;top:0;right:0;z-index:100000;pointer-events:none;background:#382855;color:#fff;padding:3px 12px;font:11px monospace';
      document.body.append(label);
    })()`).catch(() => {});
  });
});

async function install() {
  const owned = process.env.SWARM_X11_OWNERSHIP_DIR;
  const artifacts = process.env.SWARM_JOURNEY_ARTIFACTS;
  if (!owned || !isAbsolute(owned) || !artifacts || !isAbsolute(artifacts) || !process.env.SWARM_X11_TOKEN ||
      process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY || process.env.DISPLAY === ":0") throw new Error("Owned virtual desktop required");
  const stat = await lstat(owned);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 ||
      (await readFile(join(owned, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid fixture ownership");
  let attempted = false;
  const server = createServer((socket) => {
    let bytes = Buffer.alloc(0);
    socket.setTimeout(180_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      if (bytes.length + chunk.length > 256) { socket.destroy(); return; }
      bytes = Buffer.concat([bytes, chunk]);
      if (!bytes.includes(10)) return;
      socket.removeAllListeners("data");
      let input;
      try { input = JSON.parse(bytes.toString("utf8")); } catch { socket.destroy(); return; }
      if (attempted || !input || Object.keys(input).sort().join(",") !== "action,token" || input.token !== process.env.SWARM_X11_TOKEN ||
          !["run", "failure-probe"].includes(input.action)) { socket.destroy(); return; }
      attempted = true;
      void (async () => {
        const window = BrowserWindow.getAllWindows()[0];
        try {
          if (!window) throw new Error("Owned test window missing");
          if (input.action === "failure-probe") throw new Error("Deliberate owned scenario failure");
          const evidence = await runJourney({ window, control, crashCore, artifactDirectory: artifacts });
          const result = { ok: true, fixtureOnly: true, coreGenerations: fixtureGeneration(), ...evidence };
          await writeFile(join(artifacts, "journey.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
          socket.end(JSON.stringify(result) + "\n");
        } catch (error) {
          if (window && !window.isDestroyed()) {
            await writeFile(join(artifacts, "journey-failure.png"), (await window.webContents.capturePage()).toPNG(), { mode: 0o600 }).catch(() => {});
          }
          const result = { ok: false, fixtureOnly: true, error: error instanceof Error ? error.message.slice(0, 2000) : "Scenario failed" };
          await writeFile(join(artifacts, "journey.json"), JSON.stringify(result, null, 2), { mode: 0o600 }).catch(() => {});
          socket.end(JSON.stringify(result) + "\n");
        }
      })();
    });
  });
  server.maxConnections = 1;
  server.listen(join(owned, "journey.sock"), () => { void chmod(join(owned, "journey.sock"), 0o600); });
  server.on("error", () => { console.error("Owned fixture control unavailable"); app.exit(2); });
  app.on("will-quit", () => server.close());
}
void app.whenReady().then(install).catch(() => { console.error("Owned fixture bootstrap unavailable"); app.exit(2); });
