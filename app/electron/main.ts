import { app, BrowserWindow, ipcMain, Menu, type IpcMainInvokeEvent } from "electron";
import { readFile } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION, type CoreResponse } from "../../protocol/schema";
import { VIEW_SHELL_ZOOM_CHANNEL, applyInterfaceZoom, type ViewShellResult } from "../view-shell";
import { DevUpdateSchema, LIFECYCLE_CHANNEL, LIFECYCLE_REQUEST_CHANNEL, LifecycleRequestSchema, type Lifecycle } from "../lifecycle";
import { applicationMenuTemplate } from "./menu";
import { CoreSupervisor } from "./core-supervisor";
import { launchLocalCore } from "./core-launch";

const REQUEST_CHANNEL = "swarm:request";
const EVENT_CHANNEL = "swarm:event";
app.disableHardwareAcceleration();
function productionPagePath(): string { return join(__dirname, "../../renderer/index.html"); }
function isAllowedRendererUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    const rendererUrl = process.env.SWARM_RENDERER_URL;
    return rendererUrl ? url.origin === new URL(rendererUrl).origin : url.protocol === "file:" && decodeURIComponent(url.pathname) === productionPagePath();
  } catch { return false; }
}
let mainWindow: BrowserWindow | null = null;
let shuttingDown = false;
let lifecycle: Lifecycle = { revision: 0, core: { generation: 0, phase: "starting", message: "Opening local core" }, reload: "idle", notice: "" };
function publish(update: Partial<Lifecycle>) {
  lifecycle = { ...lifecycle, ...update, revision: lifecycle.revision + 1 };
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(LIFECYCLE_CHANNEL, lifecycle);
}
const supervisor = new CoreSupervisor({
  launch() {
    const child = launchLocalCore(process.env.SWARM_WORKSPACE_ROOT ?? process.cwd(), join(app.getPath("userData"), "agent-runs"));
    child.stdout?.on("data", (chunk) => process.stdout.write(`[core] ${chunk}`));
    child.stderr?.on("data", (chunk) => process.stderr.write(`[core] ${chunk}`));
    child.on("spawn", () => console.log(`[core] spawned pid=${child.pid} generation=${supervisor.state.generation}`));
    return child;
  },
  status: (core) => publish({ core }),
  event: (generation, event) => mainWindow?.webContents.send(EVENT_CHANNEL, { generation, event }),
});
function trusted(event: IpcMainInvokeEvent) {
  return Boolean(event.senderFrame && isAllowedRendererUrl(event.senderFrame.url) && event.senderFrame === mainWindow?.webContents.mainFrame);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    title: "swarm-ide — Loading", width: 1480, height: 940, minWidth: 1080, minHeight: 700,
    backgroundColor: "#071011", autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!isAllowedRendererUrl(url)) event.preventDefault(); });
  // Electron cancels unload by default. Never override a dirty-buffer veto.
  mainWindow.webContents.on("will-prevent-unload", () => {
    publish({ reload: lifecycle.reload === "reloading" ? "pending" : lifecycle.reload, notice: "Document reload deferred: save or reconcile your buffers first." });
  });
  mainWindow.webContents.on("did-finish-load", () => {
    publish({ reload: lifecycle.reload === "reloading" ? "idle" : lifecycle.reload });
  });
  if (process.env.SWARM_RENDERER_URL) void mainWindow.loadURL(process.env.SWARM_RENDERER_URL);
  else void mainWindow.loadFile(productionPagePath());
  mainWindow.on("closed", () => { mainWindow = null; });
}
ipcMain.handle(REQUEST_CHANNEL, async (event, input: unknown) => {
  const generation = supervisor.state.generation;
  if (!trusted(event)) {
    const requestId = typeof input === "object" && input !== null && "requestId" in input && typeof input.requestId === "string" ? input.requestId : "rejected-request";
    return { generation, response: { protocolVersion: PROTOCOL_VERSION, requestId, ok: false, error: { code: "UNTRUSTED_RENDERER", message: "IPC sender is not the swarm-ide main frame" } } satisfies CoreResponse };
  }
  return { generation, response: await supervisor.request(input) };
});
ipcMain.handle(LIFECYCLE_REQUEST_CHANNEL, (event, input: unknown) => {
  if (!trusted(event)) throw new Error("Untrusted lifecycle caller");
  const request = LifecycleRequestSchema.parse(input);
  if (request.type === "reload" && request.revision === lifecycle.revision && lifecycle.reload === "pending" && lifecycle.core.phase === "ready" && !shuttingDown) {
    publish({ reload: "reloading", notice: "Refreshing preload in the existing native window" });
    // beforeunload is the final synchronous veto if an edit raced this ack.
    mainWindow?.webContents.reload();
  }
  return lifecycle;
});
ipcMain.handle(VIEW_SHELL_ZOOM_CHANNEL, (event, percent: unknown): ViewShellResult => {
  if (!trusted(event)) return { ok: false, message: "Interface zoom is unavailable for this renderer frame.", zoomState: "unchanged" };
  if (typeof percent !== "number") return { ok: false, message: "The requested interface zoom level is not allowed.", zoomState: "unchanged" };
  return applyInterfaceZoom(percent, (factor) => event.sender.setZoomFactor(factor), () => event.sender.getZoomFactor());
});

const controlPath = process.env.SWARM_DEV_CONTROL;
let lastSerial = 0;
let coreRevision = 0;
let preloadRevision = 0;
let restartRequired = false;
async function readDevUpdate() {
  if (!controlPath || shuttingDown) return;
  try {
    const bytes = await readFile(controlPath, "utf8");
    if (bytes.length > 4_096) throw new Error("Oversized dev update");
    const update = DevUpdateSchema.parse(JSON.parse(bytes));
    if (update.serial <= lastSerial || shuttingDown) return;
    lastSerial = update.serial;
    if (update.action === "restart-required") restartRequired = true;
    publish({ notice: restartRequired ? "Main process changed — deliberate app restart required; current window retained." : update.message });
    if (restartRequired) return;
    if (update.coreRevision > coreRevision) { coreRevision = update.coreRevision; supervisor.restart(); }
    if (update.preloadRevision > preloadRevision) { preloadRevision = update.preloadRevision; publish({ reload: "pending" }); }
  } catch (error) { console.error("Dev update was not applied", error); }
}
void app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate()));
  supervisor.start();
  createWindow();
  if (controlPath) watchFile(controlPath, { interval: 100 }, () => { void readDevUpdate(); });
  app.on("activate", () => { if (!shuttingDown && BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
// before-quit can be vetoed by a dirty renderer; only stop after quit proceeds.
app.on("will-quit", () => {
  shuttingDown = true;
  if (controlPath) unwatchFile(controlPath);
  supervisor.stop();
});
