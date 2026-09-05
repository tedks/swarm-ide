import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from "electron";
import { join } from "node:path";
import {
  parseCoreEvent,
  parseCoreRequest,
  parseCoreResponse,
  type CoreResponse,
} from "../../protocol/schema";

const REQUEST_CHANNEL = "swarm:request";
const EVENT_CHANNEL = "swarm:event";
const REQUEST_TIMEOUT_MS = 5_000;

let mainWindow: BrowserWindow | null = null;
let core: UtilityProcess | null = null;
const pending = new Map<
  string,
  { resolve: (response: CoreResponse) => void; timeout: NodeJS.Timeout }
>();

function rejectPending(message: string): void {
  for (const [requestId, item] of pending) {
    clearTimeout(item.timeout);
    item.resolve({
      protocolVersion: 1,
      requestId,
      ok: false,
      error: { code: "CORE_UNAVAILABLE", message },
    });
  }
  pending.clear();
}

function startCore(): void {
  const entry = join(__dirname, "../../core/worker.js");
  core = utilityProcess.fork(entry, [], {
    serviceName: "swarm-ide-local-core",
    stdio: "pipe",
  });

  core.stdout?.on("data", (chunk) => process.stdout.write(`[core] ${chunk}`));
  core.stderr?.on("data", (chunk) => process.stderr.write(`[core] ${chunk}`));
  core.on("message", (message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "core.ready"
    ) {
      return;
    }

    const responseResult = parseCoreResponseSafe(message);
    if (responseResult) {
      const item = pending.get(responseResult.requestId);
      if (item) {
        clearTimeout(item.timeout);
        pending.delete(responseResult.requestId);
        item.resolve(responseResult);
      }
      return;
    }

    try {
      const event = parseCoreEvent(message);
      mainWindow?.webContents.send(EVENT_CHANNEL, event);
    } catch (error) {
      console.error("Dropped invalid local-core message", error);
    }
  });
  core.on("exit", (code) => {
    core = null;
    rejectPending(`Local core exited with code ${code}`);
  });
}

function parseCoreResponseSafe(message: unknown): CoreResponse | null {
  try {
    return parseCoreResponse(message);
  } catch {
    return null;
  }
}

function requestCore(input: unknown): Promise<CoreResponse> {
  const request = parseCoreRequest(input);
  if (!core) {
    return Promise.resolve({
      protocolVersion: 1,
      requestId: request.requestId,
      ok: false,
      error: { code: "CORE_UNAVAILABLE", message: "Local core is not running" },
    });
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(request.requestId);
      resolve({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: "CORE_TIMEOUT", message: "Local core did not respond in time" },
      });
    }, REQUEST_TIMEOUT_MS);
    pending.set(request.requestId, { resolve, timeout });
    core?.postMessage(request);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: "swarm-ide — Loading",
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#071011",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererUrl = process.env.SWARM_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle(REQUEST_CHANNEL, (_event, input: unknown) => requestCore(input));

void app.whenReady().then(() => {
  startCore();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  rejectPending("Application is shutting down");
  core?.kill();
});
