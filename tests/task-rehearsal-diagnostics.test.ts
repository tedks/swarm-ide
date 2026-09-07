// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { finishTaskDiagnostics, installTaskResizeDiagnostics } from "./support/task-rehearsal-diagnostics";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
it("rejects renderer errors delivered while final diagnostic capture is awaited", async () => {
  const errors: string[] = [];
  await expect(finishTaskDiagnostics(errors, async () => { await Promise.resolve(); errors.push("late-resize"); }, null)).rejects.toThrow("late-resize");
});
it("retains the original journey failure when diagnostic capture also fails", async () => {
  const original = new Error("original journey");
  await expect(finishTaskDiagnostics([], async () => { throw new Error("secondary diagnostic write"); }, { error: original })).rejects.toBe(original);
});
it("fails closed on diagnostic write failure when the journey was otherwise successful", async () => {
  const writeError = new Error("diagnostic write");
  await expect(finishTaskDiagnostics([], async () => { throw writeError; }, null)).rejects.toBe(writeError);
});
it("captures bounded passive resize/error evidence without suppressing or scheduling delivery", () => {
  document.body.innerHTML = `<section class="graph-pane" data-topology="repo"><div class="react-flow"></div></section>`;
  const before = document.body.innerHTML;
  let receive: ResizeObserverCallback = () => {};
  const observe = vi.fn(), disconnect = vi.fn();
  let errorListener: EventListener | undefined;
  const add = vi.spyOn(globalThis, "addEventListener").mockImplementation((type, listener) => {
    if (type === "error") errorListener = listener as EventListener;
  });
  const remove = vi.spyOn(globalThis, "removeEventListener").mockImplementation(() => {});
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { receive = callback; } observe = observe; disconnect = disconnect; });
  const diagnostic = installTaskResizeDiagnostics(), target = document.querySelector(".react-flow")!;
  expect(observe).toHaveBeenCalledWith(target);
  for (let index = 0; index < 150; index++) receive([{ target, contentRect: { width: index, height: 3 } } as ResizeObserverEntry], {} as ResizeObserver);
  const event = new ErrorEvent("error", { message: "ResizeObserver loop", cancelable: true });
  errorListener!(event);
  const result = diagnostic.read();
  expect(result.deliveries).toHaveLength(128);
  expect(result.deliveries.at(-1)).toMatchObject({ graph: "repo", width: 149, height: 3 });
  expect(result.errors).toHaveLength(1);
  expect(event.defaultPrevented).toBe(false);
  expect(document.body.innerHTML).toBe(before);
  diagnostic.dispose(); expect(disconnect).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith("error", errorListener);
  add.mockRestore(); remove.mockRestore();
});
