// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreRequest, CoreResponse } from "../protocol/schema";
import {
  isInterfaceZoomPercent,
  type ViewShellBridge,
  type ViewShellResult,
} from "../app/view-shell";
import { INTERFACE_ZOOM_STORAGE_KEY } from "../app/renderer/zoom";
import { initialSnapshot } from "../fixtures/world";

vi.mock("../app/renderer/GraphPane", () => ({
  GraphPane: ({ graph }: { graph: { title: string } }) => <section data-testid="graph-pane">{graph.title}</section>,
}));

import { App } from "../app/renderer/App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(window, "swarm");
  Reflect.deleteProperty(window, "swarmView");
  vi.restoreAllMocks();
});

function installCoreBridge() {
  Object.defineProperty(window, "swarm", {
    configurable: true,
    value: {
      request: async (input: CoreRequest) => ({ protocolVersion: 1, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot() }),
      onEvent: () => () => undefined,
    },
  });
}

function installViewBridge(result?: (percent: number) => ViewShellResult): ViewShellBridge {
  const implementation: (percent: number) => ViewShellResult = result ?? ((percent): ViewShellResult =>
    isInterfaceZoomPercent(percent)
      ? { ok: true, percent }
      : { ok: false, message: "not allowed", zoomState: "unchanged" });
  const bridge: ViewShellBridge = {
    setZoomPercent: vi.fn(async (percent: number) => implementation(percent)),
  };
  Object.defineProperty(window, "swarmView", { configurable: true, value: bridge });
  return bridge;
}

describe("workbench shell", () => {
  it("renders four regions and directs a build through the typed bridge", async () => {
    const requests: CoreRequest[] = [];
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      requests.push(input);
      return { protocolVersion: 1, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot() };
    });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: { request, onEvent: () => () => undefined },
    });
    installViewBridge();

    render(<App />);
    expect(await screen.findByText("Checkout hardening")).toBeTruthy();
    expect(screen.getByText("Repository topology")).toBeTruthy();
    expect(screen.getByText("Service calls")).toBeTruthy();
    expect(screen.getByText("Changes entering the world")).toBeTruthy();
    expect(screen.getByText("Relevant bugs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Build world/ }));
    await waitFor(() => expect(requests.some((item) => item.type === "reconciliation.start")).toBe(true));
  });

  it("opens the keyboard-first command surface", async () => {
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: {
        request: async (input: CoreRequest) => ({ protocolVersion: 1, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot() }),
        onEvent: () => () => undefined,
      },
    });
    installViewBridge();
    render(<App />);
    await screen.findByText("Checkout hardening");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByPlaceholderText("Navigate or apply intelligence…")).toBeTruthy();
  });

  it("shows fixed controls, persists 100 to 125, resets, and restores after reload", async () => {
    installCoreBridge();
    const firstBridge = installViewBridge();
    const first = render(<App />);

    expect(await screen.findByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(await screen.findByRole("button", { name: /Current zoom 125%/ })).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBe("125");
    expect(firstBridge.setZoomPercent).toHaveBeenLastCalledWith(125);

    first.unmount();
    const reloadBridge = installViewBridge();
    render(<StrictMode><App /></StrictMode>);
    expect(await screen.findByRole("button", { name: /Current zoom 125%/ })).toBeTruthy();
    expect(reloadBridge.setZoomPercent).toHaveBeenCalledWith(125);

    fireEvent.click(screen.getByRole("button", { name: /Reset zoom to 100%/ }));
    expect(await screen.findByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBe("100");
  });

  it("resets malformed persistence and keeps the last applied level on bridge failure", async () => {
    window.localStorage.setItem(INTERFACE_ZOOM_STORAGE_KEY, "125%");
    installCoreBridge();
    installViewBridge((percent) => percent === 125
      ? { ok: false, message: "Zoom renderer is unavailable.", zoomState: "unchanged" }
      : { ok: true, percent: 100 });
    render(<StrictMode><App /></StrictMode>);

    expect(await screen.findByText("Saved zoom was invalid and was reset to 100%.")).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBeNull();
    await screen.findByRole("button", { name: /Current zoom 100%/ });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(await screen.findByText("Zoom renderer is unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBeNull();
  });

  it("reports a missing view bridge without preventing the workbench from loading", async () => {
    installCoreBridge();
    render(<App />);
    expect(await screen.findByText("Checkout hardening")).toBeTruthy();
    expect(screen.getByText("Interface zoom is unavailable outside the swarm-ide Electron shell.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Current zoom unknown/ })).toBeTruthy();
  });

  it("handles Ctrl zoom while preserving editable focus and ignores plain text keys", async () => {
    installCoreBridge();
    const bridge = installViewBridge();
    render(<App />);
    await screen.findByText("Checkout hardening");

    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Navigate or apply intelligence…");
    fireEvent.change(input, { target: { value: "focus remains" } });
    input.focus();
    const callsBeforePlainKey = vi.mocked(bridge.setZoomPercent).mock.calls.length;
    expect(fireEvent.keyDown(input, { key: "=", code: "Equal" })).toBe(true);
    expect(vi.mocked(bridge.setZoomPercent).mock.calls).toHaveLength(callsBeforePlainKey);

    expect(fireEvent.keyDown(input, { key: "=", code: "Equal", ctrlKey: true })).toBe(false);
    expect(await screen.findByRole("button", { name: /Current zoom 125%/ })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("focus remains");

    expect(fireEvent.keyDown(input, { key: "0", code: "Digit0", ctrlKey: true })).toBe(false);
    expect(await screen.findByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it("coalesces rapid repeated shortcuts to the latest requested level", async () => {
    installCoreBridge();
    const resolvers: Array<(result: ViewShellResult) => void> = [];
    const setZoomPercent = vi.fn((_percent: number) => new Promise<ViewShellResult>((resolve) => resolvers.push(resolve)));
    Object.defineProperty(window, "swarmView", {
      configurable: true,
      value: { setZoomPercent } satisfies ViewShellBridge,
    });
    render(<App />);
    await waitFor(() => expect(setZoomPercent).toHaveBeenCalledWith(100));

    fireEvent.keyDown(window, { key: "+", code: "Equal", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "+", code: "Equal", ctrlKey: true, shiftKey: true, repeat: true });
    resolvers.shift()?.({ ok: true, percent: 100 });
    await waitFor(() => expect(setZoomPercent).toHaveBeenLastCalledWith(150));
    expect(setZoomPercent).toHaveBeenCalledTimes(2);
    resolvers.shift()?.({ ok: true, percent: 150 });
    expect(await screen.findByRole("button", { name: /Current zoom 150%/ })).toBeTruthy();
  });

  it("keeps zoom controls focusable while applying and recovers from an unknown initial state", async () => {
    installCoreBridge();
    const bridge = installViewBridge(() => ({
      ok: false,
      message: "Applied zoom could not be verified.",
      zoomState: "unknown",
    }));
    render(<App />);
    expect(await screen.findByRole("button", { name: /Current zoom unknown/ })).toBeTruthy();

    const zoomInButton = screen.getByRole("button", { name: "Zoom in" });
    zoomInButton.focus();
    fireEvent.click(zoomInButton);
    await waitFor(() => expect(bridge.setZoomPercent).toHaveBeenLastCalledWith(125));
    expect(document.activeElement).toBe(zoomInButton);
    expect(zoomInButton.hasAttribute("disabled")).toBe(false);
  });

  it("reports an unknown applied level when the view bridge throws", async () => {
    installCoreBridge();
    const bridge: ViewShellBridge = {
      setZoomPercent: vi.fn(async () => { throw new Error("renderer was destroyed"); }),
    };
    Object.defineProperty(window, "swarmView", { configurable: true, value: bridge });

    render(<App />);
    expect(await screen.findByRole("button", { name: /Current zoom unknown/ })).toBeTruthy();
    expect(screen.getByText("The interface zoom bridge failed; the applied zoom level is unknown.")).toBeTruthy();
  });
});
