/** Fixed TEST-ONLY task journey entry; production has no selector for it. */
import { app } from "electron";
import { lstatSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { drainRehearsalCore, rehearsalLedger, rehearsalShutdownDiagnostics } from "./agent-rehearsal-launch";
import { runTaskRehearsalProof, verifyTaskRehearsalClose, type TaskRehearsalProof } from "./task-rehearsal-driver";
import type { RehearsalDiagnostics } from "./agent-rehearsal-service";
import { assessTaskRendererErrors } from "./task-rehearsal-diagnostics";

const profiles = process.argv.filter((value) => value.startsWith("--swarm-task-rehearsal-profile="));
const profile = profiles[0]?.slice("--swarm-task-rehearsal-profile=".length);
const artifacts = process.env.SWARM_TASK_REHEARSAL_EVIDENCE;
let proof: TaskRehearsalProof | undefined;
let exiting = false, attempted = false;

function ownedDirectory(path: string) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
    throw new Error("Owner-private task rehearsal directory required");
}
async function failure(error: unknown) {
  if (artifacts) await writeFile(join(artifacts, "task-rehearsal-failure.json"), JSON.stringify({
    ok: false, fixtureOnly: true, message: error instanceof Error ? error.message : "Task rehearsal failed",
    stack: error instanceof Error ? error.stack : undefined, ledger: rehearsalLedger(),
  }), { mode: 0o600 }).catch(() => {});
  await drainRehearsalCore(); app.exit(1);
}
function bootstrap() {
  if (profiles.length !== 1 || !profile || !isAbsolute(profile) || !artifacts || !isAbsolute(artifacts))
    throw new Error("Use the fixed owned task rehearsal target");
  ownedDirectory(profile);
  const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
  if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY || !process.env.SWARM_X11_TOKEN)
    throw new Error("Owned virtual X11 required");
  ownedDirectory(owner);
  if (readFileSync(join(owner, "token"), "utf8").trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
  app.setPath("userData", profile); app.setPath("sessionData", profile);
  app.on("will-quit", (event) => {
    if (exiting) return;
    event.preventDefault(); exiting = true;
    void (async () => {
      const drained = await drainRehearsalCore();
      const diagnostics = rehearsalShutdownDiagnostics() as RehearsalDiagnostics | null;
      // The first completed run belonged to the intentionally lost generation.
      // Recovery must not create another responder in the new core generation.
      const disposed = diagnostics !== null && diagnostics.runs.length === 0 &&
        Object.values(diagnostics.totals).every((count) => count === 0);
      if (!drained || !disposed || !proof) throw new Error("Task rehearsal did not drain recovered core without replay");
      const persisted = await verifyTaskRehearsalClose(profile!, process.cwd(), proof);
      const rendererAssessment = assessTaskRendererErrors(proof.rendererErrors);
      await writeFile(join(artifacts!, "task-rehearsal.tmp"), JSON.stringify({ ok: true, fixtureOnly: true,
        modelTurns: 0, externalAgentProcesses: 0, rendererAssessment, proof, shutdown: { drained, disposed, diagnostics, persisted }, ledger: rehearsalLedger(),
      }, null, 2), { mode: 0o600 });
      await rename(join(artifacts!, "task-rehearsal.tmp"), join(artifacts!, "task-rehearsal.json"));
      app.exit(0);
    })().catch(failure);
  });
  app.on("browser-window-created", (_event, window) => {
    window.webContents.on("did-finish-load", () => {
      void window.webContents.executeJavaScript(`(() => {
        document.getElementById('test-only-task-rehearsal-label')?.remove();
        const label = document.createElement('div'); label.id = 'test-only-task-rehearsal-label';
        label.textContent = 'TASK REHEARSAL — real Git/Ditz context; deterministic output; no model or external agent';
        label.style.cssText = 'height:30px;padding:6px;background:#292039;color:#f3e9ff;font:11px monospace;box-sizing:border-box';
        document.body.prepend(label); document.getElementById('root').style.height = 'calc(100% - 30px)';
      })()`).then(async () => {
        if (attempted) return;
        attempted = true;
        try {
          proof = await runTaskRehearsalProof({ window, artifacts: artifacts!, ledger: rehearsalLedger });
          window.close();
        } catch (error) {
          try { await writeFile(join(artifacts!, "task-rehearsal-failure.png"), (await window.webContents.capturePage()).toPNG()); } catch { /* original error retained */ }
          await failure(error);
        }
      }).catch(failure);
    });
  });
  require("../../app/electron/main");
}
try { bootstrap(); } catch (error) { console.error(error); app.exit(2); }
