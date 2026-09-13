// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { initialSnapshot, writerFileFocus } from "../fixtures/world";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import type { BuildGraphObservation } from "../protocol/build-graph";
import type { TargetBuildJob } from "../protocol/build-jobs";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) =>
  <section data-testid={`palette-graph-${graph.topologyId}`}><input aria-label={`Camera ${graph.topologyId}`} defaultValue="retained camera" /></section> }));
vi.mock("../app/renderer/plans/PlanWorkspace", () => ({ PlanWorkspace: ({ renderWorkspace, onOpenFile }: {
  renderWorkspace(parts: { components: ReactNode; document: ReactNode; tasks: ReactNode }): ReactNode;
  onOpenFile(path: string): void;
}) => renderWorkspace({ components: <button onClick={() => onOpenFile(writerFileFocus.path!)}>Open palette source</button>,
  document: <article>Retained design</article>, tasks: <div>Retained tasks</div> }) }));
import { App } from "../app/renderer/App";

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });

function setup() {
  const snapshot = initialSnapshot(writerFileFocus);
  const buildGraph: BuildGraphObservation = { repositoryId: snapshot.project.id, worldId: snapshot.world.id, generation: 1,
    status: "current", message: "Build graph current", graph: { repositoryId: snapshot.project.id, worldId: snapshot.world.id,
      inputDigest: "a".repeat(64), observedAt: "2026-09-13T20:00:00.000Z", command: "query", complete: true,
      coverage: "controlled renderer fixture", edges: [], targets: [
        { label: "//app:passing_test", kind: "rule", ruleClass: "sh_test", path: "", buildFile: "app/BUILD.bazel" },
        { label: "//app:bundle", kind: "rule", ruleClass: "filegroup", path: "", buildFile: "app/BUILD.bazel" },
        { label: "//app:source_test.ts", kind: "source", path: "app/source_test.ts" },
      ] } };
  let jobs: TargetBuildJob[] = [];
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    if (input.type === "build.start") jobs = [{ id: "palette-job", target: input.target, operation: input.operation,
      status: "succeeded", startedAt: "2026-09-13T20:00:01.000Z", elapsedMs: 12, message: "Tests passed",
      output: `${input.target} PASSED`, exitCode: 0, cleanup: "confirmed" }];
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: 1, snapshot };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "buildGraph.observe") return { ...common, buildGraph };
    if (input.type === "build.start" || input.type === "build.observe" || input.type === "build.cancel")
      return { ...common, buildJobs: { repositoryId: snapshot.project.id, worldId: snapshot.world.id, blocked: false, jobs } };
    if (input.type === "file.read") return { ...common, file: { kind: "read", path: input.path, content: "saved source\n",
      revision: "b".repeat(64), size: 13 } };
    return common;
  });
  window.swarm = { request, onEvent: () => () => {} };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  return { request };
}

it("runs one exact palette test through Builds & resources while retaining dirty source, camera and agent draft", async () => {
  const { request } = setup(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open palette source" }));
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("saved source"));
  const editorElement = document.querySelector<HTMLElement>(".cm-editor")!, editor = EditorView.findFromDOM(editorElement)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 3 } }));
  const camera = screen.getByRole("textbox", { name: "Camera service" }) as HTMLInputElement;
  fireEvent.change(camera, { target: { value: "operator camera" } });

  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const command = screen.getByRole("textbox", { name: "Workspace command" });
  fireEvent.change(command, { target: { value: "Ask an agent about this focus" } });
  fireEvent.click(screen.getByRole("button", { name: /Ask an agent about this focus/ }));
  const draft = await screen.findByLabelText("Task") as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: "Keep this unsent agent draft" } });

  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  fireEvent.click(screen.getByRole("button", { name: /Bazel test/ }));
  const target = screen.getByRole("textbox", { name: "Bazel test target" });
  expect(screen.getByText(/Uses files on disk · unsaved source changes are not included/)).toBeTruthy();
  const filenameReads = request.mock.calls.filter(([input]) => input.type === "repo.search").length;
  fireEvent.change(target, { target: { value: "passing" } });
  fireEvent.keyDown(target, { key: "ArrowDown" });
  fireEvent.keyDown(target, { key: "Enter", repeat: true });
  expect(request.mock.calls.some(([input]) => input.type === "build.start")).toBe(false);
  expect(request.mock.calls.filter(([input]) => input.type === "repo.search")).toHaveLength(filenameReads);
  fireEvent.keyDown(target, { key: "Enter" });
  fireEvent.keyDown(target, { key: "Enter" });

  await screen.findByText("Tests passed");
  expect(request.mock.calls.filter(([input]) => input.type === "build.start").map(([input]) => input)).toEqual([
    expect.objectContaining({ type: "build.start", operation: "test", target: "//app:passing_test" }),
  ]);
  expect(screen.getByText("//app:passing_test PASSED")).toBeTruthy();
  expect(document.querySelector(".cm-editor")).toBe(editorElement);
  expect(editor.state.doc.toString()).toBe("dirty saved source\n"); expect(editor.state.selection.main.anchor).toBe(3);
  expect(screen.getByLabelText("Task")).toBe(draft); expect(draft.value).toBe("Keep this unsent agent draft");
  expect(camera.value).toBe("operator camera");
});

it("ignores repeated shortcuts and a foreign modal, then restores the palette origin on Escape", async () => {
  setup(); render(<App />);
  const origin = await screen.findByRole("button", { name: "Open palette source" });
  origin.focus();
  fireEvent.keyDown(origin, { key: "k", ctrlKey: true, repeat: true });
  expect(screen.queryByRole("dialog", { name: "Command and file search" })).toBeNull();

  const foreign = document.createElement("section"), foreignButton = document.createElement("button");
  foreign.setAttribute("role", "dialog"); foreign.setAttribute("aria-modal", "true");
  foreignButton.textContent = "Foreign modal owner"; foreign.append(foreignButton); document.body.append(foreign); foreignButton.focus();
  const closedShortcut = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
  foreignButton.dispatchEvent(closedShortcut);
  expect(closedShortcut.defaultPrevented).toBe(false);
  expect(screen.queryByRole("dialog", { name: "Command and file search" })).toBeNull();
  foreign.remove(); origin.focus();

  fireEvent.keyDown(origin, { key: "k", ctrlKey: true });
  const input = screen.getByRole("textbox", { name: "Workspace command" });
  document.body.append(foreign); foreignButton.focus();
  const ownedShortcut = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
  foreignButton.dispatchEvent(ownedShortcut);
  expect(ownedShortcut.defaultPrevented).toBe(false);
  expect(screen.getByRole("dialog", { name: "Command and file search" })).toBeTruthy();
  const ownedEscape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  foreignButton.dispatchEvent(ownedEscape);
  expect(ownedEscape.defaultPrevented).toBe(false);
  expect(screen.getByRole("dialog", { name: "Command and file search" })).toBeTruthy();
  foreign.remove(); input.focus();
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(origin));
  expect(screen.queryByRole("dialog", { name: "Command and file search" })).toBeNull();
});
