// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { history, undo, undoDepth } from "@codemirror/commands";
import { EditorPane } from "../app/renderer/EditorPane";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(cleanup);

it("keeps the editor, caret and undo state through repeated equivalent source observations", () => {
  const original = "const answer = 42;\n", onChange = vi.fn(), onSave = vi.fn();
  const mounted = render(<EditorPane path="main.ts" content={original} flash={null} onChange={onChange} onSave={onSave} />);
  const dom = document.querySelector<HTMLElement>(".cm-editor")!, view = EditorView.findFromDOM(dom)!;
  act(() => {
    // Preserve an installed history; this increment does not add history support.
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    view.dispatch({ changes: { from: original.length, insert: "// human draft\n" }, selection: { anchor: 6, head: 12 } });
    view.focus();
  });
  const text = view.state.doc.toString(), state = view.state, notices = onChange.mock.calls.length;
  for (let index = 0; index < 20; index++) {
    mounted.rerender(<EditorPane path="main.ts" content={index % 2 ? text.replace(/\n/g, "\r\n") : text}
      flash={null} onChange={onChange} onSave={() => {}} />);
    expect(document.querySelector(".cm-editor")).toBe(dom);
    expect(view.state).toBe(state); expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.anchor).toBe(6); expect(view.state.selection.main.head).toBe(12);
  }
  expect(onChange).toHaveBeenCalledTimes(notices); expect(undoDepth(view.state)).toBe(1);
  act(() => { expect(undo(view)).toBe(true); });
  expect(view.state.doc.toString()).toBe(original);
});
