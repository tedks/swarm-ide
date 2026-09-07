// @vitest-environment jsdom
import { createRef, useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSearchPalette } from "../app/renderer/repository/FileSearchPalette";
import { useFileSearch } from "../app/renderer/repository/file-search";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreResponse } from "../protocol/schema";
import type { RepositorySearchRequest, RepositorySearchResult } from "../protocol/repository-search";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const result = (query = "same", delta: Partial<RepositorySearchResult> = {}): RepositorySearchResult => ({
  kind: "search", query, repositoryId: "project:test", captureId: "capture:1", capturedAt: new Date().toISOString(),
  state: "observed", complete: true, capturedCount: 2, matchesComplete: true,
  paths: ["a/same.ts", "b/same.ts"], notice: "Captured filenames only", ...delta,
});
function response(request: RepositorySearchRequest, delta: Partial<RepositorySearchResult> = {}): CoreResponse {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1,
    snapshot: initialSnapshot(), search: result(request.query, delta) };
}
function pending<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (value: T) => resolve(value) }; }

describe("bounded filename client lifetimes", () => {
  it("debounces typing, drops late A for B, and never navigates or publishes snapshots", async () => {
    const a = pending<CoreResponse>(), b = pending<CoreResponse>();
    const request = vi.fn((input: RepositorySearchRequest) => input.query === "first" ? a.promise : b.promise);
    const view = renderHook(({ query }) => useFileSearch("project:test", query, true, 1, request), { initialProps: { query: "first" } });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    view.rerender({ query: "second" }); expect(view.result.current.result).toBeUndefined();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await act(async () => b.resolve(response(request.mock.calls[1]![0], { paths: ["second.ts"] })));
    expect(view.result.current.result?.paths).toEqual(["second.ts"]);
    await act(async () => a.resolve(response(request.mock.calls[0]![0], { paths: ["first.ts"] })));
    expect(view.result.current.result?.paths).toEqual(["second.ts"]);
    expect(request.mock.calls.every(([input]) => input.type === "repo.search" && !input.refresh)).toBe(true);
  });
  it("drops old core/repository results immediately and ignores completion after close/disposal", async () => {
    const pendingResult = pending<CoreResponse>();
    const request = vi.fn(() => pendingResult.promise);
    const view = renderHook(({ id, generation, enabled }) => useFileSearch(id, "same", enabled, generation, request),
      { initialProps: { id: "project:test", generation: 1, enabled: true } });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    view.rerender({ id: "project:other", generation: 2, enabled: false });
    expect(view.result.current.result).toBeUndefined();
    await act(async () => pendingResult.resolve(response({ protocolVersion: PROTOCOL_VERSION, requestId: "old", repositoryId: "project:test", type: "repo.search", query: "same", refresh: false })));
    expect(view.result.current.result).toBeUndefined(); expect(view.result.current.error).toBeUndefined();
    view.unmount();
  });
  it("validates result identity, explicitly refreshes, and exposes errors instead of empty success", async () => {
    const request = vi.fn(async (input: RepositorySearchRequest) => response(input, { query: "wrong", paths: [] }));
    const view = renderHook(() => useFileSearch("project:test", "same", true, 1, request));
    await waitFor(() => expect(view.result.current.error).toContain("identity mismatch"));
    expect(view.result.current.result).toBeUndefined();
    act(() => view.result.current.refresh());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1]![0].refresh).toBe(true);
  });
  it("does not capture while closed, blank or invalid, or send one request per key", async () => {
    vi.useFakeTimers(); const request = vi.fn(async () => null);
    const view = renderHook(({ query, enabled }) => useFileSearch("project:test", query, enabled, 1, request), { initialProps: { query: "", enabled: false } });
    view.rerender({ query: "a", enabled: true }); view.rerender({ query: "ab", enabled: true }); view.rerender({ query: "abc", enabled: true });
    expect(request).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(130); });
    expect(request).toHaveBeenCalledTimes(1);
    view.rerender({ query: "x".repeat(257), enabled: true });
    expect(view.result.current.error).toContain("256");
    await act(async () => { await vi.advanceTimersByTimeAsync(130); }); expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("keyboard file search palette", () => {
  it("highlights duplicate full paths with arrows, opens only Enter, and cancels without activation", () => {
    const onOpen = vi.fn(), onCancel = vi.fn(), onQuery = vi.fn();
    render(<FileSearchPalette query="same" onQuery={onQuery} exact={false} commands={[]} inputRef={createRef()}
      focusLabel="retained source" onCancel={onCancel} onOpen={onOpen} search={{ loading: false, result: result(), refresh: vi.fn() }} />);
    const input = screen.getByRole("textbox", { name: "Workspace command" });
    expect(screen.getByText("a/same.ts")).toBeTruthy(); expect(screen.getByText("b/same.ts")).toBeTruthy();
    fireEvent.keyDown(input, { key: "ArrowDown" }); expect(onOpen).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-activedescendant")).toBe("workspace-search-1");
    fireEvent.keyDown(input, { key: "Enter" }); expect(onOpen).toHaveBeenCalledExactlyOnceWith("b/same.ts");
    fireEvent.keyDown(input, { key: "Escape" }); expect(onCancel).toHaveBeenCalledTimes(1); expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "literal [*]" } }); expect(onQuery).toHaveBeenCalledWith("literal [*]");
  });
  it("keeps commands/exact-path mode and distinguishes unavailable, empty and partial", () => {
    const props = { query: "same", onQuery: vi.fn(), exact: false, commands: [], inputRef: createRef<HTMLInputElement>(), focusLabel: "source", onCancel: vi.fn(), onOpen: vi.fn() };
    const view = render(<FileSearchPalette {...props} search={{ loading: false, result: result("same", { paths: [], complete: false }), refresh: vi.fn() }} />);
    expect(screen.getByText(/does not prove the file is absent/)).toBeTruthy();
    view.rerender(<FileSearchPalette {...props} search={{ loading: false, error: "Git unavailable", refresh: vi.fn() }} />);
    expect(screen.getByText(/Search unavailable: Git unavailable/)).toBeTruthy(); expect(screen.queryByText(/No matching eligible/)).toBeNull();
    view.rerender(<FileSearchPalette {...props} search={{ loading: false, result: result("same", { paths: [] }), refresh: vi.fn() }} />);
    expect(screen.getByText(/No matching eligible file in this captured inventory/)).toBeTruthy();
    const run = vi.fn();
    view.rerender(<FileSearchPalette {...props} exact commands={[{ label: "Open path", detail: "exact", run }]} search={{ loading: false, refresh: vi.fn() }} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Exact repository path" }), { key: "Enter" }); expect(run).toHaveBeenCalledTimes(1);
  });
  it("marks a retained capture stale without a refresh or request timer", async () => {
    vi.useFakeTimers(); const refresh = vi.fn();
    function Harness() { const [query, setQuery] = useState("same"); return <FileSearchPalette query={query} onQuery={setQuery} exact={false} commands={[]} inputRef={createRef()}
      focusLabel="source" onCancel={() => {}} onOpen={() => {}} search={{ loading: false, result: result(), refresh }} />; }
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    expect(screen.getByText(/Stale · complete/)).toBeTruthy(); expect(refresh).not.toHaveBeenCalled();
  });
  it("returns focus to the input on explicit Refresh so arrows and Enter still work", () => {
    const inputRef = createRef<HTMLInputElement>(), open = vi.fn();
    function Harness() {
      const [loading, setLoading] = useState(false);
      return <FileSearchPalette query="same" onQuery={() => {}} exact={false} commands={[]} inputRef={inputRef}
        focusLabel="source" onCancel={() => {}} onOpen={open} search={{ loading, result: loading ? undefined : result(), refresh: () => setLoading(true) }} />;
    }
    render(<Harness />);
    const refresh = screen.getByRole("button", { name: "Refresh filenames" }); refresh.focus(); fireEvent.click(refresh);
    expect(document.activeElement).toBe(inputRef.current); expect(refresh.isConnected).toBe(false);
    fireEvent.keyDown(inputRef.current!, { key: "Enter" }); expect(open).not.toHaveBeenCalled();
  });
});
