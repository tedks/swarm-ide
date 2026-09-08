// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorPane } from "../app/renderer/EditorPane";
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("Alt-click uses the latest reference callback without replacing editor state or changing selection", () => {
  const props = { path: "BUILD", content: 'filegroup(name="library", srcs=["file.txt"])', flash: null, onChange: vi.fn(), onSave: vi.fn() };
  const first = vi.fn(() => true), latest = vi.fn(() => true);
  const mounted = render(<EditorPane {...props} onReference={first} />);
  const editor = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  vi.spyOn(editor, "posAtCoords").mockReturnValue(props.content.indexOf("file.txt") + 2);
  act(() => editor.dispatch({ selection: { anchor: 3, head: 7 } }));
  const before = editor.state;
  mounted.rerender(<EditorPane {...props} onReference={latest} />);
  fireEvent.mouseDown(editor.contentDOM, { altKey: true, button: 0, clientX: 5, clientY: 5 });
  expect(latest).toHaveBeenCalledWith("file.txt"); expect(first).not.toHaveBeenCalled();
  expect(editor.state).toBe(before); expect(props.onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(editor.contentDOM, { key: "s", code: "KeyS", ctrlKey: true });
  expect(props.onSave).toHaveBeenCalledOnce();
});
it("normal clicks and mixed modifiers do not invoke reference navigation", () => {
  const onReference = vi.fn(() => true);
  render(<EditorPane path="BUILD" content='srcs=["file.txt"]' flash={null} onChange={vi.fn()} onSave={vi.fn()} onReference={onReference} />);
  const editor = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
  vi.spyOn(editor, "posAtCoords").mockReturnValue(10);
  for (const modifiers of [{}, { altKey: true, shiftKey: true }, { altKey: true, ctrlKey: true }, { altKey: true, metaKey: true }]) fireEvent.mouseDown(editor.contentDOM, { button: 0, ...modifiers });
  expect(onReference).not.toHaveBeenCalled();
});
