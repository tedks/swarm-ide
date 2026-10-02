// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { redoDepth, undoDepth } from "@codemirror/commands";
import { EditorPane, type EditorMemory } from "../app/renderer/EditorPane";

// CodeMirror selects platform-specific keymaps at module initialization.
vi.hoisted(() => Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux x86_64" }));

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(cleanup);
const editor = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
const key = (view: EditorView, shiftKey = false) => act(() => {
  fireEvent.keyDown(view.contentDOM, { key: shiftKey ? "Z" : "z", code: "KeyZ", keyCode: 90, ctrlKey: true, shiftKey });
});
const props = (content = "base\n") => ({ path: "a.ts", content, flash: null, onChange: vi.fn(), onSave: vi.fn() });

it("undoes and redoes user edits with the installed keyboard bindings", () => {
  const input = props(); render(<EditorPane {...input} />);
  const view = editor();
  act(() => view.dispatch({ changes: { from: 4, insert: " draft" } }));
  expect(undoDepth(view.state)).toBe(1);
  key(view); expect(view.state.doc.toString()).toBe("base\n");
  expect(input.onChange).toHaveBeenLastCalledWith("base\n");
  key(view, true); expect(view.state.doc.toString()).toBe("base draft\n");
  expect(input.onChange).toHaveBeenLastCalledWith("base draft\n");
});

it("retains undo and redo across tab remounts without retaining old callbacks", () => {
  const input = props(), memory: EditorMemory = { state: null };
  const first = render(<EditorPane {...input} memory={memory} />);
  act(() => editor().dispatch({ changes: { from: 4, insert: " draft" }, selection: { anchor: 3 } }));
  first.unmount();
  const secondChange = vi.fn(), secondSave = vi.fn();
  const second = render(<EditorPane {...input} content={"base draft\r\n"} onChange={secondChange} onSave={secondSave} memory={memory} />);
  expect(editor().state.selection.main.anchor).toBe(3);
  key(editor()); expect(editor().state.doc.toString()).toBe(input.content);
  expect(secondChange).toHaveBeenLastCalledWith(input.content);
  expect(input.onChange).toHaveBeenCalledTimes(1);
  act(() => fireEvent.keyDown(editor().contentDOM, { key: "s", code: "KeyS", ctrlKey: true }));
  expect(secondSave).toHaveBeenCalledOnce(); expect(input.onSave).not.toHaveBeenCalled();
  second.unmount();
  const thirdChange = vi.fn();
  render(<EditorPane {...input} onChange={thirdChange} memory={memory} />);
  expect(redoDepth(editor().state)).toBe(1);
  key(editor(), true); expect(editor().state.doc.toString()).toBe("base draft\n");
  expect(thirdChange).toHaveBeenLastCalledWith("base draft\n");
  expect(secondChange).toHaveBeenCalledTimes(1);
});

it("maps user history through external observations without undoing external changes", () => {
  const input = props(), mounted = render(<EditorPane {...input} />), view = editor();
  act(() => view.dispatch({ changes: { from: 4, insert: " draft" } }));
  input.onChange.mockClear();
  mounted.rerender(<EditorPane {...input} content={"external\nbase draft\n"} />);
  expect(input.onChange).not.toHaveBeenCalled();
  expect(undoDepth(view.state)).toBe(1);
  key(view); expect(view.state.doc.toString()).toBe("external\nbase\n");
  key(view, true); expect(view.state.doc.toString()).toBe("external\nbase draft\n");
});

it("does not create history from an external observation alone", () => {
  const input = props(), mounted = render(<EditorPane {...input} />);
  mounted.rerender(<EditorPane {...input} content={"observed\n"} />);
  expect(undoDepth(editor().state)).toBe(0);
  key(editor()); expect(editor().state.doc.toString()).toBe("observed\n");
  expect(input.onChange).not.toHaveBeenCalled();
});

it("discards remembered history when a hidden file's content no longer matches", () => {
  const input = props(), memory: EditorMemory = { state: null };
  const first = render(<EditorPane {...input} memory={memory} />);
  act(() => editor().dispatch({ changes: { from: 4, insert: " draft" } }));
  first.unmount();
  render(<EditorPane {...input} content={"replaced externally\n"} memory={memory} />);
  expect(undoDepth(editor().state)).toBe(0);
  key(editor()); expect(editor().state.doc.toString()).toBe("replaced externally\n");
});

it("preserves a user edit between disjoint external changes", () => {
  const input = props("first\nmiddle\nlast\n"), mounted = render(<EditorPane {...input} />), view = editor();
  act(() => view.dispatch({ changes: { from: 12, insert: " draft" } }));
  mounted.rerender(<EditorPane {...input} content={"FIRST\nmiddle draft\nLAST\n"} />);
  key(view); expect(view.state.doc.toString()).toBe("FIRST\nmiddle\nLAST\n");
  key(view, true); expect(view.state.doc.toString()).toBe("FIRST\nmiddle draft\nLAST\n");
});
