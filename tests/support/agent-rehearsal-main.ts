/** Separate fixed test artifact. No fixture authority enters the production entry. */
import { app, BrowserWindow } from "electron";
import { lstatSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { drainRehearsalCore, rehearsalLedger, rehearsalShutdownDiagnostics } from "./agent-rehearsal-launch";
import { runRehearsalProof } from "./agent-rehearsal-driver";
import type { RehearsalDiagnostics } from "./agent-rehearsal-service";
import { verifyRehearsalClose } from "./agent-rehearsal-close";

const prefix = "--swarm-rehearsal-profile=";
const profileArgs = process.argv.filter((value) => value.startsWith(prefix));
const modeArgs = process.argv.filter((value) => value.startsWith("--swarm-rehearsal-mode="));
const profile = profileArgs[0]?.slice(prefix.length);
const mode = modeArgs[0]?.split("=")[1];
const title = "REHEARSAL — deterministic output — no model or external agent process";
let proof: unknown = null;
let failure = false;

async function bootstrap() {
  if (profileArgs.length !== 1 || modeArgs.length !== 1 || !profile || !isAbsolute(profile) || !["interactive", "owned-acceptance"].includes(mode ?? "")) throw new Error("Use the explicit rehearsal Bazel launcher");
  const stat = lstatSync(profile);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error("Owner-private fresh rehearsal profile required");
  if (mode === "owned-acceptance") {
    if (!process.env.SWARM_REHEARSAL_ARTIFACTS || !isAbsolute(process.env.SWARM_REHEARSAL_ARTIFACTS)) throw new Error("Absolute owned evidence directory required");
    const owned = process.env.SWARM_X11_OWNERSHIP_DIR;
    if (!owned || !isAbsolute(owned) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY || !process.env.SWARM_X11_TOKEN) throw new Error("Owned virtual X11 required");
    const owner = lstatSync(owned);
    if (!owner.isDirectory() || owner.isSymbolicLink() || owner.uid !== process.getuid?.() || (owner.mode & 0o077) !== 0 ||
        readFileSync(join(owned, "token"), "utf8").trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual ownership");
  }
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  let attempted = false;
  let exiting = false;
  // will-quit occurs after the renderer's ordinary dirty/unresolved vetoes.
  app.on("will-quit", (event) => {
    if (exiting) return;
    event.preventDefault(); exiting = true;
    void drainRehearsalCore().then(async (drained) => {
      if (mode === "owned-acceptance") {
        const artifacts = process.env.SWARM_REHEARSAL_ARTIFACTS!;
        const diagnostics = rehearsalShutdownDiagnostics() as RehearsalDiagnostics | null;
        const disposed = diagnostics !== null && diagnostics.runs.length === 4 && diagnostics.runs.every((run) => run.activeTimers === 0 && run.cleanupSettled && !run.pendingSteer && !run.pendingInterrupt);
        const retainedHistory = await verifyRehearsalClose({ profile, workspace: process.cwd(), diagnostics, proof });
        await writeFile(join(artifacts, "rehearsal-result.tmp"), JSON.stringify({ ok: !failure && drained && disposed && proof !== null, proof,
          shutdown: { drained, disposed, diagnostics, retainedHistory }, ledger: rehearsalLedger(),
          fixtureOnly: true, modelRequests: 0, externalAgentProcesses: 0 }, null, 2), { mode: 0o600 });
        await rename(join(artifacts, "rehearsal-result.tmp"), join(artifacts, "rehearsal.json"));
      }
      console.log(`Rehearsal closed: runtime_drained=${drained}; private profile retained at ${profile}`);
      app.exit(failure || !drained ? 1 : 0);
    }).catch(async (error) => {
      if (mode === "owned-acceptance") await writeFile(join(process.env.SWARM_REHEARSAL_ARTIFACTS!, "rehearsal-bootstrap-failure.json"),
        JSON.stringify({ error: error instanceof Error ? error.message : "Rehearsal close proof failed" })).catch(() => {});
      app.exit(1);
    });
  });
  app.on("browser-window-created", (_event, window) => {
    window.webContents.on("did-finish-load", () => {
      const notice = { title, workspace: process.cwd(), profile,
        details: "Prepare → inspect → Launch; Send to this run; Stop. [delay] starts a delayed instruction. 20 retained runs, one active, ~20s / ≤350KiB output each. Normal explicit editor Save writes REAL source; the deterministic agent cannot. Reload keeps history; dirty/unresolved text vetoes reload. Close retains this private profile." };
      void window.webContents.executeJavaScript(`(function(info) {
        document.getElementById('test-only-rehearsal-label')?.remove();
        const label=document.createElement('section');label.id='test-only-rehearsal-label';label.setAttribute('aria-label','Rehearsal information');
        label.style.cssText='height:76px;overflow:auto;background:#292039;color:#f3e9ff;padding:5px 12px;font:11px/1.4 monospace;border-bottom:1px solid #756086';
        const heading=document.createElement('strong');heading.textContent=info.title;label.append(heading);
        for(const text of ['Workspace: '+info.workspace, 'Private retained profile: '+info.profile, info.details]) {const row=document.createElement('div');row.textContent=text;label.append(row);}
        document.body.prepend(label);const root=document.getElementById('root');if(root)root.style.height='calc(100% - 76px)';
      })(${JSON.stringify(notice)})`).then(async () => {
        if (mode !== "owned-acceptance" || attempted) return;
        attempted = true;
        try {
          proof = await runRehearsalProof({ window, artifactDirectory: process.env.SWARM_REHEARSAL_ARTIFACTS!, ledger: rehearsalLedger });
          window.close();
        } catch (error) {
          failure = true;
          const artifacts = process.env.SWARM_REHEARSAL_ARTIFACTS!;
          await writeFile(join(artifacts, "rehearsal-bootstrap-failure.json"), JSON.stringify({ error: error instanceof Error ? error.message : "Proof failed", ledger: rehearsalLedger() }, null, 2));
          try { await writeFile(join(artifacts, "rehearsal-failure.png"), (await window.webContents.capturePage()).toPNG()); } catch { /* Optional screenshot. */ }
          // Failure cleanup owns the test app, not a human's dirty document.
          await drainRehearsalCore(); app.exit(1);
        }
      }).catch(() => { failure = true; app.quit(); });
    });
  });
  // Synchronous fixed import is essential: Electron's pre-ready settings must
  // run before the event loop can deliver ready. No dynamic module selection.
  require("../../app/electron/main");
}
void bootstrap().catch((error) => { console.error(error instanceof Error ? error.message : "Rehearsal bootstrap failed"); app.exit(2); });
