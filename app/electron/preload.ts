import { contextBridge, ipcRenderer } from "electron";
import { EventEnvelopeSchema, ResponseEnvelopeSchema, LifecycleSchema, LIFECYCLE_CHANNEL, LIFECYCLE_REQUEST_CHANNEL, type LifecycleBridge } from "../lifecycle";
import {
  parseCoreRequest,
  parseCoreResponseForRequest,
  uncertainMutationCode,
  type CoreEvent,
  type CoreRequest,
  type CoreResponse,
  type FileEvent,
} from "../../protocol/schema";
import type { AgentEvent } from "../../protocol/agents";
import {
  VIEW_SHELL_ZOOM_CHANNEL,
  parseViewShellResult,
  type ViewShellBridge,
} from "../view-shell";

const REQUEST_CHANNEL = "swarm:request";
const EVENT_CHANNEL = "swarm:event";
let generation = 0;
ipcRenderer.on(LIFECYCLE_CHANNEL, (_event, input: unknown) => {
  const parsed = LifecycleSchema.safeParse(input);
  if (parsed.success) generation = Math.max(generation, parsed.data.core.generation);
});

export interface SwarmBridge {
  request(input: CoreRequest): Promise<CoreResponse>;
  onEvent(listener: (event: CoreEvent | FileEvent | AgentEvent) => void): () => void;
}

const bridge: SwarmBridge = {
  async request(input) {
    const request = parseCoreRequest(input);
    try {
      const envelope = ResponseEnvelopeSchema.parse(await ipcRenderer.invoke(REQUEST_CHANNEL, request));
      if (envelope.generation < generation) return { protocolVersion: request.protocolVersion, requestId: request.requestId, ok: false, error: { code: uncertainMutationCode(request) ?? "CORE_GENERATION_CHANGED", message: "Core generation changed during the operation" } };
      generation = envelope.generation;
      return parseCoreResponseForRequest(envelope.response, request);
    } catch {
      return { protocolVersion: request.protocolVersion, requestId: request.requestId, ok: false,
        error: { code: uncertainMutationCode(request) ?? "INVALID_CORE_MESSAGE",
          message: "Core transport or response validation failed; do not replay uncertain mutations" } };
    }
  },
  onEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, input: unknown) => {
      const parsed = EventEnvelopeSchema.safeParse(input);
      if (!parsed.success || parsed.data.generation < generation) return;
      generation = parsed.data.generation;
      listener(parsed.data.event);
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
const lifecycleBridge: LifecycleBridge = {
  async status() { const status = LifecycleSchema.parse(await ipcRenderer.invoke(LIFECYCLE_REQUEST_CHANNEL, { type: "status" })); generation = Math.max(generation, status.core.generation); return status; },
  onStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, input: unknown) => {
      const parsed = LifecycleSchema.safeParse(input);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(LIFECYCLE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(LIFECYCLE_CHANNEL, handler);
  },
  async reload(revision) { return LifecycleSchema.parse(await ipcRenderer.invoke(LIFECYCLE_REQUEST_CHANNEL, { type: "reload", revision })); },
};
contextBridge.exposeInMainWorld("swarmLifecycle", lifecycleBridge);
