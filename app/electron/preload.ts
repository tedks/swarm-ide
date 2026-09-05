import { contextBridge, ipcRenderer } from "electron";
import {
  parseCoreEvent,
  parseCoreRequest,
  parseCoreResponse,
  type CoreEvent,
  type CoreRequest,
  type CoreResponse,
} from "../../protocol/schema";
import {
  VIEW_SHELL_ZOOM_CHANNEL,
  parseViewShellResult,
  type ViewShellBridge,
} from "../view-shell";

const REQUEST_CHANNEL = "swarm:request";
const EVENT_CHANNEL = "swarm:event";

export interface SwarmBridge {
  request(input: CoreRequest): Promise<CoreResponse>;
  onEvent(listener: (event: CoreEvent) => void): () => void;
}

const bridge: SwarmBridge = {
  async request(input) {
    const request = parseCoreRequest(input);
    const response: unknown = await ipcRenderer.invoke(REQUEST_CHANNEL, request);
    return parseCoreResponse(response);
  },
  onEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, input: unknown) => {
      listener(parseCoreEvent(input));
    };
    ipcRenderer.on(EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, handler);
  },
};

const viewShellBridge: ViewShellBridge = {
  async setZoomPercent(percent) {
    const response: unknown = await ipcRenderer.invoke(VIEW_SHELL_ZOOM_CHANNEL, percent);
    return parseViewShellResult(response);
  },
};

contextBridge.exposeInMainWorld("swarm", bridge);
contextBridge.exposeInMainWorld("swarmView", viewShellBridge);
