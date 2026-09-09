// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { RendererBoundary } from "../app/renderer/RendererBoundary";
import { recoveryText, installRendererDiagnostics, useRecoveryText } from "../app/renderer/renderer-health";
import { useTrustedFleet } from "../app/renderer/agents/use-trusted-fleet";
import { TrustedLocalPane } from "../app/renderer/agents/TrustedLocalPane";

afterEach(() => { cleanup(); recoveryText.clear(); vi.restoreAllMocks(); });

describe("renderer failure containment", () => {
  it("shows an explanation and copyable latest buffers after a child render throws, with no remount or replay", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail!: () => void;
    const mount = vi.fn(), unmount = vi.fn();
    function Child() {
      const [broken, setBroken] = useState(false); fail = () => setBroken(true);
      useEffect(() => { mount(); return unmount; }, []);
      if (broken) throw new Error("private source should not be in the diagnostic");
      return <p>Working</p>;
    }
    recoveryText.set(() => [{ label: "other-worktree / source.ts", text: "unsaved latest text" }, { label: "Agent message", text: "unsent message" }]);
    render(<RendererBoundary><Child /></RendererBoundary>);
    act(() => fail());
    expect(screen.getByRole("alert").textContent).toContain("The interface stopped rendering");
    expect(screen.getByDisplayValue("unsaved latest text")).toHaveProperty("readOnly", true);
    expect(screen.getByDisplayValue("unsent message")).toHaveProperty("readOnly", true);
    expect(mount).toHaveBeenCalledTimes(1); expect(unmount).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /reload|retry|send/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select other-worktree / source.ts" }));
    expect((screen.getByDisplayValue("unsaved latest text") as HTMLTextAreaElement).selectionEnd).toBe(19);
    expect(console.error).toHaveBeenCalledWith("[renderer-health] render-error");
    expect(screen.getByRole("alert").textContent).not.toContain("private source");
  });
  it("protects retained text from unload and releases the guard when the boundary is removed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    recoveryText.set(() => [{ label: "Source", text: "local text" }]);
    function Broken(): never { throw Error("broken"); }
    const view = render(<RendererBoundary><Broken /></RendererBoundary>);
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    view.unmount(); const later = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
  it("contains failure in the recovery reader too", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    recoveryText.set(() => { throw Error("unavailable"); });
    function Broken(): never { throw Error("broken"); }
    render(<StrictMode><RendererBoundary><Broken /></RendererBoundary></StrictMode>);
    expect(screen.getByRole("alert").textContent).toContain("No text snapshot was available");
  });
  it("collects mounted owner text before error cleanup, removes retired owners, and requires explicit close acknowledgement", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let crash!: () => void;
    function Owner({ name }: { name: string }) {
      const [text, setText] = useState("original"), [failed, setFailed] = useState(false);
      crash = () => setFailed(true);
      useRecoveryText(() => [{ label: name, text }]);
      if (failed) throw Error("failure");
      return <input aria-label={name} value={text} onChange={(event) => setText(event.target.value)} />;
    }
    const retired = render(<Owner name="retired" />); retired.unmount();
    render(<StrictMode><RendererBoundary><Owner name="current" /></RendererBoundary></StrictMode>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "latest unsent draft" } });
    act(() => crash());
    expect(screen.getByDisplayValue("latest unsent draft")).toBeDefined();
    expect(screen.queryByText("retired")).toBeNull();
    expect(recoveryText.read()).toEqual([]);
    fireEvent.click(screen.getByRole("checkbox"));
    const allowed = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });
  it("does not erase captured text when descendant cleanup also throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let crash!: () => void;
    function Owner() {
      const [failed, setFailed] = useState(false); crash = () => setFailed(true);
      useRecoveryText(() => [{ label: "Source", text: "must survive cleanup failure" }]);
      useLayoutEffect(() => () => { throw Error("cleanup also failed"); }, []);
      if (failed) throw Error("render failed");
      return <p>Ready</p>;
    }
    render(<RendererBoundary><Owner /></RendererBoundary>);
    act(() => crash());
    expect(recoveryText.read()).toEqual([]);
    expect(screen.getByDisplayValue("must survive cleanup failure")).toBeDefined();
  });
  it("reports asynchronous failures without replacing healthy UI; repeated install/cleanup does not accumulate listeners", () => {
    const report = vi.fn();
    const dispose = installRendererDiagnostics(window, report); dispose();
    const stop = installRendererDiagnostics(window, report);
    window.dispatchEvent(new ErrorEvent("error", { message: "private payload" }));
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(report.mock.calls).toEqual([["[renderer-health] script-error"], ["[renderer-health] unhandled-rejection"]]);
    stop(); window.dispatchEvent(new ErrorEvent("error")); expect(report).toHaveBeenCalledTimes(2);
  });
  it("reads native composer edits synchronously before another render can fail", () => {
    const { result } = renderHook(() => useTrustedFleet({ connected: false, generation: 0 }));
    act(() => {
      result.current.edit("run", "latest instruction");
      expect(result.current.recoveryComposers().run.text).toBe("latest instruction");
    });
  });
  it("retains the actual New-agent composer without starting a conversation", () => {
    render(<TrustedLocalPane draft={null} connected={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "New agent message" }), { target: { value: "unsent local task" } });
    expect(recoveryText.read()).toContainEqual({ label: "New agent message", text: "unsent local task" });
  });
});
