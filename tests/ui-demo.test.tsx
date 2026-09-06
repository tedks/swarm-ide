// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useUiDemo, MockConversation, MockContext, MockRunRail } from "../app/renderer/agents/ui-demo";
import { buildTargets, selectBuildView } from "../app/renderer/repository/build-view";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";
import { ResizeDivider } from "../app/renderer/ResizeDivider";

afterEach(cleanup);
it("separately enables each mock surface and clears only its own state", () => {
  const { result } = renderHook(useUiDemo);
  expect(result.current.runs || result.current.graphs || result.current.context || result.current.conversation).toBe(false);
  act(() => result.current.command("runs"));
  expect(result.current.runs).toBe(true); expect(result.current.conversation).toBe(false);
  act(() => result.current.select("quill"));
  expect(result.current.selected).toBe("quill"); expect(result.current.conversation).toBe(true);
  act(() => result.current.command("all"));
  expect(result.current.graphs && result.current.context).toBe(true);
  const before = result.current.graphVersion;
  act(() => result.current.command("graphs"));
  expect(result.current.graphVersion).toBe(before + 1);
  act(() => result.current.command("clear"));
  expect(result.current.runs || result.current.graphs || result.current.context || result.current.conversation).toBe(false);
});
it("shares mock run identity with conversations, retaining per-agent unsent text and explicitly scripted replies", () => {
  const select = vi.fn();
  const view = render(<><MockRunRail selected="aster" onSelect={select} /><MockConversation selected="aster" /></>);
  fireEvent.click(screen.getByRole("button", { name: /Lumen · Trace build boundaries/ }));
  expect(select).toHaveBeenCalledWith("lumen");
  fireEvent.change(screen.getByRole("textbox", { name: "Message mock agent" }), { target: { value: "Keep this draft" } });
  view.rerender(<><MockRunRail selected="lumen" onSelect={select} /><MockConversation selected="lumen" /></>);
  expect((screen.getByRole("textbox", { name: "Message mock agent" }) as HTMLTextAreaElement).value).toBe("");
  view.rerender(<><MockRunRail selected="aster" onSelect={select} /><MockConversation selected="aster" /></>);
  expect((screen.getByRole("textbox", { name: "Message mock agent" }) as HTMLTextAreaElement).value).toBe("Keep this draft");
  fireEvent.click(screen.getByRole("button", { name: "Send mock message" }));
  expect(screen.getByRole("log", { name: "Mock transcript" }).textContent).toContain("Nothing was sent to a model");
});
it("makes every context example explicitly mock rather than observed telemetry", () => {
  render(<MockContext focus="core/files.ts" />);
  expect(screen.getByRole("region", { name: "Mock context" }).textContent).toContain("core/files.ts");
  expect(screen.getAllByText("MOCK")).toHaveLength(4);
  expect(screen.getByText(/not connected to Sponge/)).toBeTruthy();
});
it("traverses captured target dependencies with bounded cycle handling and excludes source files from target choices", () => {
  const capture: BuildLinkSnapshot = { repositoryId: "test", revision: "example", capturedAt: "now", command: "query", links: [
    { from: "//a:x", to: "//b:y", fromPath: "a", toPath: "b" },
    { from: "//b:y", to: "//c:z", fromPath: "b", toPath: "c" },
    { from: "//c:z", to: "//a:x", fromPath: "c", toPath: "a" },
    { from: "//a:x", to: "//a:file.ts", fromPath: "a", toPath: "a/file.ts" },
  ] };
  expect(buildTargets(capture)).toEqual(["//a:x", "//b:y", "//c:z"]);
  expect([...selectBuildView(capture, ["//a:x"], false).depths.keys()]).toEqual(["//a:x", "//b:y"]);
  expect([...selectBuildView(capture, ["//a:x"], true).depths.keys()]).toEqual(["//a:x", "//b:y", "//c:z"]);
  expect(selectBuildView(capture, ["//missing:target"], true).depths.size).toBe(0);
});
it("keeps resize controls keyboard-accessible and bounded", () => {
  const change = vi.fn();
  render(<ResizeDivider label="Resize Context" className="test" container="main" value={44} minimum={23} maximum={44} initial={30} reverse onChange={change} />);
  const handle = screen.getByRole("separator", { name: "Resize Context" });
  fireEvent.keyDown(handle, { key: "ArrowLeft" }); expect(change).toHaveBeenLastCalledWith(44);
  fireEvent.keyDown(handle, { key: "ArrowRight" }); expect(change).toHaveBeenLastCalledWith(43);
  fireEvent.keyDown(handle, { key: "Home" }); expect(change).toHaveBeenLastCalledWith(30);
});
