// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalActivity, JournalPanel, useJournal } from "../app/renderer/changelog/JournalPanel";
import { syntheticJournal } from "./journal-fixture";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, parseCoreResponseForRequest, type CoreRequest, type CoreResponse } from "../protocol/schema";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (request: CoreRequest): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 0,
  snapshot: { ...initialSnapshot(), project: { ...initialSnapshot().project, id: "repo:test" } }, changelog: syntheticJournal().result });

describe("Activity log logical changes", () => {
  it("keeps joined Journal, build-graph and external-observer replies under separate request authority", () => {
    const request: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "journal", type: "changelog.read", repositoryId: "repo:test" };
    const journal = reply(request);
    if (!journal.ok) throw new Error("Synthetic successful reply required");
    const graph = { repositoryId: "repo:test", worldId: journal.snapshot.world.id, generation: 1, status: "unavailable", message: "Synthetic unavailable graph" };
    expect(parseCoreResponseForRequest(journal, request)).toEqual(journal);
    expect(() => parseCoreResponseForRequest({ ...journal, buildGraph: graph }, request)).toThrow();
    const graphRequest: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "graph", type: "buildGraph.observe", repositoryId: "repo:test", worldId: journal.snapshot.world.id, refresh: false };
    const { changelog: _journal, ...base } = journal;
    const graphReply = { ...base, requestId: "graph", buildGraph: graph };
    expect(parseCoreResponseForRequest(graphReply, graphRequest)).toEqual(graphReply);
    expect(() => parseCoreResponseForRequest({ ...graphReply, changelog: journal.changelog }, graphRequest)).toThrow();
    const external = { kind: "snapshot", snapshot: { status: "unavailable", message: "Synthetic unavailable registry", observedAt: "2026-09-07T12:00:00Z", sessions: [] } };
    const externalRequest: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "external", type: "externalAgents.snapshot" };
    const externalReply = { ...base, requestId: "external", external };
    expect(parseCoreResponseForRequest(externalReply, externalRequest)).toEqual(externalReply);
    expect(() => parseCoreResponseForRequest({ ...externalReply, changelog: journal.changelog }, externalRequest)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...journal, external }, request)).toThrow();
  });
  it("shows compact entries and deliberately opens expanded agent/task/action evidence", () => {
    const onOpen = vi.fn(), onSource = vi.fn(); const state = { observation: syntheticJournal().result, busy: false, notice: "", refresh: vi.fn() };
    render(<><JournalActivity state={state} onOpen={onOpen} /><JournalPanel state={state} open selectedEntry="change-a" onClose={vi.fn()} onOpenSource={onSource} /></>);
    fireEvent.click(screen.getByRole("button", { name: /Synthetic change/ }));
    expect(onOpen).toHaveBeenCalledWith("change-a");
    expect(document.querySelector<HTMLDetailsElement>("[data-change-id]")!.open).toBe(true);
    expect(screen.getByText("Agents: agent-a")).toBeTruthy(); expect(screen.getByText("Tasks: task-a")).toBeTruthy();
    const evidence = document.querySelector<HTMLDetailsElement>(".journal-evidence")!; fireEvent.click(evidence.querySelector("summary")!); evidence.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Open working file · src/example.ts" }));
    expect(onSource).toHaveBeenCalledExactlyOnceWith("src/example.ts");
  });
  it("renders markup as inert text and keeps unavailable associations explicit", () => {
    const data = syntheticJournal().result; data.document.entries[0].headline = '<img src=x onerror="alert(1)">';
    data.bundle.evidence[0].taskIds = []; data.bundle.evidence[0].agentIds = [];
    render(<JournalPanel state={{ observation: data, busy: false, notice: "", refresh: vi.fn() }} open selectedEntry="change-a" onClose={vi.fn()} onOpenSource={vi.fn()} />);
    expect(document.querySelector("img")).toBeNull(); expect(screen.getByText(/No agent association/)).toBeTruthy();
  });
  it("keeps filter/details across refocus, but a selected hidden entry is expanded after filter clearing", async () => {
    const data = syntheticJournal().result;
    data.bundle.evidence.push({ ...data.bundle.evidence[0], id: "other", paths: ["src/other.ts"] });
    data.document.entries.push({ ...data.document.entries[0], id: "other-change", headline: "Other change",
      intent: { text: "Other", evidenceIds: ["other"] }, outcome: { text: "Other", evidenceIds: ["other"] }, decision: { text: "Other", evidenceIds: ["other"] } });
    const state = { observation: data, busy: false, notice: "", refresh: vi.fn() }, callbacks = { onClose: vi.fn(), onOpenSource: vi.fn() };
    const view = render(<JournalPanel state={state} open selectedEntry={null} selectionVersion={0} {...callbacks} />);
    fireEvent.change(screen.getByLabelText("Affected file"), { target: { value: "src/other.ts" } });
    const retained = document.querySelector<HTMLDetailsElement>('[data-change-id="other-change"]')!; retained.open = true;
    view.rerender(<JournalPanel state={state} open selectedEntry={null} selectionVersion={1} {...callbacks} />);
    expect((screen.getByLabelText("Affected file") as HTMLSelectElement).value).toBe("src/other.ts");
    expect(document.querySelector('[data-change-id="other-change"]')).toBe(retained); expect(retained.open).toBe(true);
    view.rerender(<JournalPanel state={state} open selectedEntry="change-a" selectionVersion={2} {...callbacks} />);
    await waitFor(() => expect(document.querySelector<HTMLDetailsElement>('[data-change-id="change-a"]')?.open).toBe(true));
    expect((screen.getByLabelText("Affected file") as HTMLSelectElement).value).toBe("");
    expect(document.activeElement).toBe(document.querySelector('[data-change-id="change-a"]>summary'));
  });
  it("retains a valid observation on a failed refresh and fences obsolete core replies", async () => {
    let fail = false; let held: ((value: CoreResponse) => void) | null = null; let requestHeld: CoreRequest;
    const request = vi.fn(async (input: CoreRequest) => fail ? { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "JOURNAL_UNAVAILABLE", message: "Invalid citations" } } : reply(input));
    vi.stubGlobal("swarm", { request, onEvent: () => () => {} });
    function Host({ generation = 1 }: { generation?: number }) { const state = useJournal("repo:test", generation); return <JournalPanel state={state} open selectedEntry={null} onClose={vi.fn()} onOpenSource={vi.fn()} />; }
    const mounted = render(<Host />);
    await screen.findByText("Synthetic change"); fail = true;
    fireEvent.click(screen.getByLabelText("Refresh logical changes"));
    await screen.findByText(/Retained · Invalid citations/); expect(screen.getByText("Synthetic change")).toBeTruthy();
    request.mockImplementation((input) => { requestHeld = input; return new Promise((resolve) => { held = resolve; }); });
    fireEvent.click(screen.getByLabelText("Refresh logical changes"));
    await waitFor(() => expect(held).not.toBeNull());
    const old = held!, oldRequest = requestHeld!;
    request.mockImplementation(async (input) => reply(input)); mounted.rerender(<Host generation={2} />);
    await waitFor(() => expect(screen.queryByText(/Retained · Invalid citations/)).toBeNull());
    const stale = reply(oldRequest); if (stale.ok) stale.changelog!.document.entries[0].headline = "Obsolete response";
    await act(async () => old(stale)); expect(screen.queryByText("Obsolete response")).toBeNull();
  });
});
