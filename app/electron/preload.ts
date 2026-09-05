import { contextBridge, ipcRenderer } from "electron";
import {
  parseCoreEvent,
  parseCoreRequest,
  parseCoreResponse,
  type CoreEvent,
  type CoreRequest,
  type CoreResponse,
} from "../../protocol/schema";

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

contextBridge.exposeInMainWorld("swarm", bridge);
