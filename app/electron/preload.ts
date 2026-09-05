import { contextBridge, ipcRenderer, webFrame } from "electron";
import {
  parseCoreEvent,
  parseCoreRequest,
  parseCoreResponse,
  type CoreEvent,
  type CoreRequest,
  type CoreResponse,
} from "../../protocol/schema";
import {
  applyInterfaceZoom,
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
  setZoomPercent(percent) {
    return applyInterfaceZoom(percent, (factor) => webFrame.setZoomFactor(factor));
  },
};

contextBridge.exposeInMainWorld("swarm", bridge);
contextBridge.exposeInMainWorld("swarmView", viewShellBridge);
