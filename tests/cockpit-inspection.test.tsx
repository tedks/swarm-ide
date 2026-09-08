// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreeInspection, type WorktreeSelection } from "../app/renderer/WorktreeInspection";
import { WorkbenchSidebar } from "../app/renderer/WorkbenchSidebar";
import type { SwarmBridge } from "../app/electron/preload";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { JournalPanel } from "../app/renderer/changelog/JournalPanel";
import { syntheticJournal } from "./journal-fixture";
import { FleetActivityView } from "../app/renderer/FleetActivityView";
import type { ExternalDetail } from "../protocol/external-agents";

afterEach(cleanup);
const id = "00000000-0000-4000-8000-000000000007";
const selection = { sessionId: id, path: "app/file.ts" };
function response(input: CoreRequest, content: string): CoreResponse {
  if (input.type !== "worktree.inspect") throw new Error("Read-only route required");
  return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot(),
    worktreeInspection: { sessionId: input.sessionId, path: input.path, label: "C7", worktree: "/repos/agent-worktree", content, diff: "-old\n+agent change\n" } };
}
describe("operator cockpit inspection", () => {
  it.each(["/repo/file.ts", "../file.ts", "./file.ts"])("keeps noncanonical event path %s as an actionable notice, not a renderer exception", async (path) => {
    const request = vi.fn(), bridge: SwarmBridge = { request, onEvent: () => () => {} };
    render(<WorktreeInspection selection={{ ...selection, path }} bridge={bridge} generation={1} onReturn={vi.fn()} />);
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "This event does not name a repository-relative file. Open the agent to inspect its command.");
    expect(request).not.toHaveBeenCalled();
  });
  it("opens a raw fleet event with its containing agent identity and recorded patch", () => {
    const session = { id, label: "C7", evidence: "local" as const, status: "observed" as const, parentId: null,
      ancestry: "root" as const, observationId: "a".repeat(64), observedAt: "2026-09-08T04:00:00Z", message: "", contextPaths: [], worktree: "/repos/child" };
    const entry = { id: "edit-1", at: "2026-09-08T04:00:00Z", kind: "tool-call" as const, attribution: "recorded-tool-event" as const,
      text: "Edited app/file.ts", path: "app/file.ts", patch: "+child-only" };
    const detail: ExternalDetail = { session, entries: [entry], handoff: "unavailable", coverage: { tailBytes: 200, partial: false, omittedRecords: 0, message: "" } };
    const onInspect = vi.fn(), onSelect = vi.fn();
    render(<FleetActivityView fleet={[detail]} selected={null} onSelect={onSelect} onAgent={vi.fn()} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole("button", { name: "app/file.ts" }));
    expect(onInspect).toHaveBeenCalledExactlyOnceWith(id, "app/file.ts", "+child-only");
    fireEvent.click(screen.getByRole("button", { name: "C7: Edited app/file.ts" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ session, entry });
    expect(document.querySelector("time")?.dateTime).toBe("2026-09-08T04:00:00.000Z");
  });
  it("keeps a dirty local buffer mounted while inspecting the agent worktree and its labelled diff", async () => {
    const request = vi.fn(async (input: CoreRequest) => response(input, "agent worktree source"));
    const bridge: SwarmBridge = { request, onEvent: () => () => {} };
    function Host() {
      const [open, setOpen] = useState(true), [text, setText] = useState("local dirty draft");
      return <><textarea aria-label="Local source" hidden={open} value={text} onChange={(event) => setText(event.target.value)} />
        {open ? <WorktreeInspection selection={selection} bridge={bridge} generation={1} onReturn={() => setOpen(false)} /> : null}</>;
    }
    render(<Host />);
    const buffer = screen.getByLabelText("Local source");
    await screen.findByText("agent worktree source");
    expect(screen.getByText("/repos/agent-worktree")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Worktree diff" }));
    expect(screen.getByText("Current changes against HEAD in this worktree.")).toBeTruthy();
    expect(document.querySelector(".patch-addition")?.textContent).toContain("agent change");
    fireEvent.click(screen.getByRole("button", { name: "Return to source" }));
    expect(screen.getByLabelText("Local source")).toBe(buffer);
    expect((buffer as HTMLTextAreaElement).value).toBe("local dirty draft");
    expect(request.mock.calls.map(([input]) => input.type)).toEqual(["worktree.inspect"]);
  });
  it("does not publish a prior worktree's held reply into the new selection", async () => {
    let release!: (result: CoreResponse) => void, held!: CoreRequest;
    const bridge: SwarmBridge = { onEvent: () => () => {}, request: vi.fn((input: CoreRequest) => {
      if (input.type === "worktree.inspect" && input.path === selection.path) { held = input; return new Promise<CoreResponse>((resolve) => { release = resolve; }); }
      return Promise.resolve(response(input, "current selection"));
    }) };
    const props = { bridge, generation: 1, onReturn: vi.fn() };
    const view = render(<WorktreeInspection {...props} selection={selection} />);
    view.rerender(<WorktreeInspection {...props} selection={{ ...selection, path: "another.ts" }} />);
    await screen.findByText("current selection");
    await act(async () => release(response(held, "stale source")));
    expect(screen.queryByText("stale source")).toBeNull();
    expect(screen.getByText("current selection")).toBeTruthy();
  });
  it("renders recorded patches as text and never executes markup", async () => {
    const bridge: SwarmBridge = { request: vi.fn(async (input) => response(input, "source")), onEvent: () => () => {} };
    render(<WorktreeInspection bridge={bridge} selection={{ ...selection, patch: "+<img src=x onerror=alert(1)>" }} generation={1} onReturn={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("C7 · read-only")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Recorded patch" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("img")).toBeNull();
  });
  it("places Work Log after agent runs without changing task visibility or mounting", () => {
    const visible = vi.fn();
    render(<WorkbenchSidebar repositoryName="repo" directory="files" agents="running workers" workLog="completed outcomes" tasks="task list" onTasksVisibility={visible} />);
    const agents = screen.getByRole("region", { name: "Agent runs sidebar section" });
    expect(agents.textContent?.indexOf("running workers")).toBeLessThan(agents.textContent!.indexOf("completed outcomes"));
    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(visible).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("task list")).toBeTruthy();
  });
  it("leaves generation evidence in details without routine forensic prose in the entry", () => {
    render(<JournalPanel open state={{ observation: syntheticJournal().result, busy: false, notice: "", refresh: vi.fn() }} selectedEntry={null} onClose={vi.fn()} onOpenSource={vi.fn()} />);
    expect(screen.queryByText(/not causal proof|Citations validate source membership|Evidence, not authority/)).toBeNull();
    expect(screen.getByText(/Saved summary/)).toBeTruthy();
    expect(document.querySelector(".journal-provenance")).toBeTruthy();
  });
});
