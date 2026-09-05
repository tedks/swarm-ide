// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreRequest, CoreResponse } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

vi.mock("../app/renderer/GraphPane", () => ({
  GraphPane: ({ graph }: { graph: { title: string } }) => <section data-testid="graph-pane">{graph.title}</section>,
}));

import { App } from "../app/renderer/App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("workbench shell", () => {
  it("renders four regions and directs a build through the typed bridge", async () => {
    const requests: CoreRequest[] = [];
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      requests.push(input);
      return { protocolVersion: 1, requestId: input.requestId, ok: true, snapshot: initialSnapshot() };
    });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: { request, onEvent: () => () => undefined },
    });

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
        request: async (input: CoreRequest) => ({ protocolVersion: 1, requestId: input.requestId, ok: true, snapshot: initialSnapshot() }),
        onEvent: () => () => undefined,
      },
    });
    render(<App />);
    await screen.findByText("Checkout hardening");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByPlaceholderText("Navigate or apply intelligence…")).toBeTruthy();
  });
});
