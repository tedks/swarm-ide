import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from "electron";
import { join } from "node:path";
import {
  PROTOCOL_VERSION,
  parseCoreEvent,
  parseCoreRequest,
  parseCoreResponse,
  type CoreResponse,
} from "../../protocol/schema";

const REQUEST_CHANNEL = "swarm:request";
const EVENT_CHANNEL = "swarm:event";
const REQUEST_TIMEOUT_MS = 5_000;

// The prototype runs on development workstations where Chromium's GPU process may
// be unavailable (for example, remote X11 sessions). Keep the desktop loop stable;
// hardware acceleration can become an explicit capability once rendering needs it.
app.disableHardwareAcceleration();

function productionPagePath(): string {
  return join(__dirname, "../../renderer/index.html");
}

function isAllowedRendererUrl(candidate: string): boolean {
  try {
    const candidateUrl = new URL(candidate);
    const rendererUrl = process.env.SWARM_RENDERER_URL;
    if (rendererUrl) return candidateUrl.origin === new URL(rendererUrl).origin;
    return candidateUrl.protocol === "file:" && decodeURIComponent(candidateUrl.pathname) === productionPagePath();
  } catch {
    return false;
  }
}

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
      protocolVersion: PROTOCOL_VERSION,
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
      const requestId =
        typeof message === "object" && message !== null && "requestId" in message &&
        typeof message.requestId === "string"
          ? message.requestId
          : null;
      const item = requestId ? pending.get(requestId) : undefined;
      if (requestId && item) {
        clearTimeout(item.timeout);
        pending.delete(requestId);
        item.resolve({
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          ok: false,
          error: { code: "INVALID_CORE_MESSAGE", message: "Local core returned an invalid response" },
        });
      }
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
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      ok: false,
      error: { code: "CORE_UNAVAILABLE", message: "Local core is not running" },
    });
  }
  if (pending.has(request.requestId)) {
    return Promise.resolve({
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      ok: false,
      error: { code: "DUPLICATE_REQUEST", message: "A request with this id is already pending" },
    });
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(request.requestId);
      resolve({
        protocolVersion: PROTOCOL_VERSION,
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
  const productionPage = productionPagePath();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererUrl(url)) event.preventDefault();
  });
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(productionPage);
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle(REQUEST_CHANNEL, (event, input: unknown) => {
  const senderFrame = event.senderFrame;
  if (!senderFrame || !isAllowedRendererUrl(senderFrame.url) || senderFrame !== mainWindow?.webContents.mainFrame) {
    const requestId =
      typeof input === "object" && input !== null && "requestId" in input &&
      typeof input.requestId === "string"
        ? input.requestId
        : "rejected-request";
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      ok: false,
      error: { code: "UNTRUSTED_RENDERER", message: "IPC sender is not the swarm-ide main frame" },
    } satisfies CoreResponse;
  }
  return requestCore(input);
});

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
