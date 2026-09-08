// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWorktreeBrowser } from "../app/renderer/AgentWorktreeBrowser";
import type { SwarmBridge } from "../app/electron/preload";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

afterEach(cleanup);
const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
function reply(input: CoreRequest): CoreResponse {
  const base = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: 0, snapshot: initialSnapshot() };
  if (input.type === "worktree.inspect") return { ...base, worktreeInspection: {
    sessionId: input.sessionId, path: input.path, label: `Worker ${input.sessionId === A ? "A" : "B"}`, worktree: `/repos/${input.sessionId}`,
    content: `Source in ${input.sessionId}: ${input.path}`, diff: "-master content\n+committed and dirty content\n", comparison: "master", base: "origin/master",
  } };
  if (input.type !== "worktree.browse") throw new Error("Only worktree reads allowed");
  return { ...base, worktreeBrowse: { sessionId: input.sessionId, label: input.sessionId === A ? "Worker A" : "Worker B", worktree: `/repos/${input.sessionId}`,
    branch: "feature/agent", base: "origin/master", changesComplete: true, changes: [
      { path: "src/main.ts", status: "modified" }, { path: "notes.txt", status: "untracked" },
    ], directory: { directory: input.directory, observationId: "directory-read", capturedAt: "2026-09-08T06:00:00Z", state: "observed", complete: true,
      capturedCount: 1, filteredCount: 1, page: input.page, pageCount: 1, filter: "", entries: input.directory ? [
        { id: "source", path: "src/main.ts", label: "main.ts", kind: "file", git: "tracked", actionable: true },
      ] : [{ id: "dir", path: "src", label: "src", kind: "directory", git: "tracked", actionable: true }],
    } } };
}
function bridge() {
  const request = vi.fn(async (input: CoreRequest) => reply(input));
  return { request, onEvent: () => () => {} } satisfies SwarmBridge;
}
describe("agent worktree browser", () => {
  it("browses the selected worker, compares master and returns to the same dirty buffer and cursor", async () => {
    const wire = bridge();
    function Host() {
      const [open, setOpen] = useState(true);
      return <><textarea aria-label="Original buffer" defaultValue="dirty local source" hidden={open} />
        {open ? <AgentWorktreeBrowser sessionId={A} bridge={wire} generation={1} onReturn={() => setOpen(false)} /> : null}</>;
    }
    render(<Host />);
    const original = screen.getByLabelText("Original buffer") as HTMLTextAreaElement;
    original.setSelectionRange(3, 7);
    await screen.findByText("Worker A / Worktree");
    fireEvent.click(screen.getByRole("button", { name: "▸ src" }));
    fireEvent.click(await screen.findByRole("button", { name: "main.ts" }));
    await screen.findByText(`Source in ${A}: src/main.ts`);
    fireEvent.click(screen.getByRole("button", { name: "Worktree diff" }));
    expect(await screen.findByText("Changes against origin/master, including committed and local edits.")).toBeTruthy();
    expect(document.querySelector(".patch-addition")?.textContent).toContain("committed and dirty");
    fireEvent.click(screen.getByRole("button", { name: "Return to workspace" }));
    expect(screen.getByLabelText("Original buffer")).toBe(original);
    expect(original.value).toBe("dirty local source");
    expect([original.selectionStart, original.selectionEnd]).toEqual([3, 7]);
    expect(wire.request.mock.calls.map(([input]) => input.type)).toEqual(["worktree.browse", "worktree.browse", "worktree.inspect"]);
  });
  it("opens untracked source without claiming a tracked diff and opens changed files as master comparisons", async () => {
    const wire = bridge();
    render(<AgentWorktreeBrowser sessionId={A} bridge={wire} generation={1} onReturn={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "untracked notes.txt" }));
    await screen.findByText(`Source in ${A}: notes.txt`);
    expect(screen.getByRole("button", { name: "Source" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "modified src/main.ts" }));
    await screen.findByText("Changes against origin/master, including committed and local edits.");
    expect(screen.getByRole("button", { name: "Worktree diff" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("fences late worktree replies and resets navigation on agent change", async () => {
    let release!: (result: CoreResponse) => void, held!: CoreRequest;
    const request = vi.fn((input: CoreRequest) => {
      if (input.type === "worktree.browse" && input.sessionId === A) { held = input; return new Promise<CoreResponse>((resolve) => { release = resolve; }); }
      return Promise.resolve(reply(input));
    });
    const wire: SwarmBridge = { request, onEvent: () => () => {} };
    const view = render(<AgentWorktreeBrowser sessionId={A} bridge={wire} generation={1} onReturn={vi.fn()} />);
    view.rerender(<AgentWorktreeBrowser sessionId={B} bridge={wire} generation={1} onReturn={vi.fn()} />);
    await screen.findByText("Worker B / Worktree");
    await act(async () => release(reply(held)));
    expect(screen.queryByText("Worker A / Worktree")).toBeNull();
    expect(request.mock.calls.at(-1)?.[0]).toMatchObject({ sessionId: B, directory: "" });
  });
  it("reports a missing registry and permits Return without any workspace mutation", async () => {
    const wire: SwarmBridge = { request: vi.fn(async () => { throw new Error("Register this worktree first"); }), onEvent: () => () => {} };
    const back = vi.fn();
    render(<AgentWorktreeBrowser sessionId={A} bridge={wire} generation={1} onReturn={back} />);
    expect(await screen.findByText("Register this worktree first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Return to workspace" }));
    expect(back).toHaveBeenCalledOnce();
  });
  it("does not steal source-reading focus on an unrelated parent rerender", async () => {
    const wire = bridge(), back = vi.fn();
    const props = { sessionId: A, bridge: wire, generation: 1, onReturn: back, initialPath: "src/main.ts" };
    const view = render(<AgentWorktreeBrowser {...props} />);
    await screen.findByText(`Source in ${A}: src/main.ts`);
    const source = document.querySelector<HTMLElement>(".worktree-source")!;
    source.focus(); expect(document.activeElement).toBe(source);
    view.rerender(<AgentWorktreeBrowser {...props} onReturn={() => back()} />);
    expect(document.activeElement).toBe(source);
  });
});
