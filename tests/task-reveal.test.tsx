// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorPane, type EditorMemory, type SourceLineNavigation } from "../app/renderer/EditorPane";
import { taskLineTarget, validTaskReference } from "../app/renderer/tasks/reveal";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(cleanup);

const content = "alpha\nbeta\ngamma\n";
const saved = (text = content) => ({ content: text, savedContent: text, status: "saved" });
function editor() { return EditorView.findFromDOM(document.querySelector(".cm-editor")!)!; }

describe("working-file task Reveal decision", () => {
  it("permits a valid saved line without representing metadata as a source revision", () => {
    expect(taskLineTarget(saved(), 2)).toEqual({ line: 2,
      notice: "Opened current working file at recorded line 2; metadata is not a source revision." });
    expect(taskLineTarget(saved(), null)).toEqual({ line: null, notice: "Opened current working file; no line was recorded." });
  });

  it.each([0, -1, 1.5, 5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])("leaves invalid/out-of-range %s unlocated without fabricating a clamp", (line) => {
    const result = taskLineTarget(saved(), line);
    expect(result.line).toBeNull();
    expect(result.notice).toContain("is unavailable in the current saved file");
    expect(result.notice).toContain("without inventing a location");
  });

  it.each(["dirty", "saving", "conflict", "unknown", "error", "loading"])("refuses a metadata line for %s source even when text happens to equal disk", (status) => {
    const tab = { ...saved(), status };
    const result = taskLineTarget(tab, 2);
    expect(result.line).toBeNull();
    expect(result.notice).toContain("Cursor retained");
    expect(tab).toEqual({ ...saved(), status });
  });

  it("protects changed text regardless of a stale saved status and retains cursor even without recorded line", () => {
    const tab = { ...saved(), content: `UNSAVED\n${content}` };
    expect(taskLineTarget(tab, 2).line).toBeNull();
    expect(taskLineTarget(tab, null).notice).toContain("Working buffer preserved");
    expect(tab.content).toBe(`UNSAVED\n${content}`);
  });

  it.each(["alpha\r\nbeta\r\ngamma", "alpha\rbeta\rgamma", "alpha\nbeta\ngamma"])("uses the same line count as CodeMirror for %j", (text) => {
    expect(taskLineTarget(saved(text), 3).line).toBe(3);
    expect(taskLineTarget(saved(text), 4).line).toBeNull();
  });

  it("accepts the one empty first line of an empty file, not a nonexistent second line", () => {
    expect(taskLineTarget(saved(""), 1).line).toBe(1);
    expect(taskLineTarget(saved(""), 2).line).toBeNull();
  });

  it.each(["/root/a", "../a", "a/../b", "a//b", "a/./b", "a\\b", "file:///a", "https://example.invalid/a", "a\u001bb", "a\u202eb", ""])("rejects hostile noncanonical path %j before broker access", (path) => {
    expect(validTaskReference({ path, navigation: "candidate", line: 2, note: null })).toBe(false);
  });

  it("uses explicit path identity and positive safe optional line only", () => {
    for (const path of ["a/index.ts", "b/index.ts"]) expect(validTaskReference({ path, navigation: "candidate", line: null, note: null })).toBe(true);
    for (const line of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(validTaskReference({ path: "a.ts", navigation: "candidate", line, note: null })).toBe(false);
    expect(validTaskReference({ path: "a.ts", navigation: "unsupported", line: 1, note: null })).toBe(false);
  });
});

describe("actual CodeMirror task line navigation", () => {
  it("moves only a valid clean line, repeats on a new nonce, and preserves editor identity without change callbacks", () => {
    const onChange = vi.fn(); const onNavigation = vi.fn(); const onSave = vi.fn();
    const view = render(<EditorPane content={content} flash={null} onChange={onChange} onSave={onSave} />);
    const original = editor();
    view.rerender(<EditorPane content={content} flash={null} onChange={onChange} onSave={onSave} navigation={{ nonce: 1, line: 2, content }} onNavigation={onNavigation} />);
    expect(editor()).toBe(original);
    expect(original.state.selection.main.anchor).toBe(original.state.doc.line(2).from);
    act(() => original.dispatch({ selection: { anchor: 0 } }));
    view.rerender(<EditorPane content={content} flash={null} onChange={onChange} onSave={onSave} navigation={{ nonce: 2, line: 2, content }} onNavigation={onNavigation} />);
    expect(editor()).toBe(original);
    expect(original.state.selection.main.anchor).toBe(original.state.doc.line(2).from);
    expect(onNavigation.mock.calls).toEqual([[1, true], [2, true]]);
    expect(onChange).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([0, 1.5, 5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid direct line %s defensively while preserving the selection", (line) => {
    const onNavigation = vi.fn(); const onChange = vi.fn();
    const view = render(<EditorPane content={content} flash={null} onChange={onChange} onSave={() => undefined} />);
    const current = editor();
    act(() => current.dispatch({ selection: { anchor: 3 } }));
    view.rerender(<EditorPane content={content} flash={null} onChange={onChange} onSave={() => undefined} navigation={{ nonce: 1, line, content }} onNavigation={onNavigation} />);
    expect(current.state.selection.main.anchor).toBe(3);
    expect(onNavigation).toHaveBeenCalledExactlyOnceWith(1, false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses navigation whose expected saved content no longer matches the visible buffer", () => {
    const onNavigation = vi.fn(); const onChange = vi.fn();
    const view = render(<EditorPane content={content} flash={null} onChange={onChange} onSave={() => undefined} />);
    const current = editor();
    act(() => current.dispatch({ selection: { anchor: 3 } }));
    view.rerender(<EditorPane content={content} flash={null} onChange={onChange} onSave={() => undefined} navigation={{ nonce: 9, line: 3, content: `other\n${content}` }} onNavigation={onNavigation} />);
    expect(current.state.selection.main.anchor).toBe(3);
    expect(current.state.doc.toString()).toBe(content);
    expect(onNavigation).toHaveBeenCalledExactlyOnceWith(9, false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("maps CRLF metadata to the real normalized document line, without publishing a text edit", () => {
    const onNavigation = vi.fn(); const onChange = vi.fn(); const crlf = "alpha\r\nbeta\r\ngamma";
    render(<EditorPane content={crlf} flash={null} onChange={onChange} onSave={() => undefined} navigation={{ nonce: 2, line: 3, content: crlf }} onNavigation={onNavigation} />);
    expect(editor().state.doc.lines).toBe(3);
    expect(editor().state.selection.main.anchor).toBe(editor().state.doc.line(3).from);
    expect(onNavigation).toHaveBeenCalledExactlyOnceWith(2, true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("consumes the parent-held nonce once so unrelated rerenders cannot drag the cursor back", () => {
    const onNavigation = vi.fn(); const onChange = vi.fn();
    function Harness({ label }: { label: string }) {
      const [navigation, setNavigation] = useState<SourceLineNavigation | null>({ nonce: 7, line: 2, content });
      return <><span>{label}</span><EditorPane content={content} flash={null} onChange={onChange} onSave={() => undefined}
        navigation={navigation} onNavigation={(nonce, applied) => { onNavigation(nonce, applied); setNavigation(null); }} /></>;
    }
    const view = render(<Harness label="before" />);
    const current = editor();
    expect(current.state.selection.main.anchor).toBe(current.state.doc.line(2).from);
    act(() => current.dispatch({ selection: { anchor: 2 } }));
    view.rerender(<Harness label="after" />);
    expect(editor()).toBe(current);
    expect(current.state.selection.main.anchor).toBe(2);
    expect(onNavigation).toHaveBeenCalledExactlyOnceWith(7, true);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("source tab selection memory", () => {
  it("restores each full-path tab selection using fresh change/save callbacks after remount", () => {
    const one: EditorMemory = { state: null }; const two: EditorMemory = { state: null };
    const oldChange = vi.fn(); const oldSave = vi.fn(); const freshChange = vi.fn(); const freshSave = vi.fn();
    const view = render(<EditorPane key="one/index.ts" content={content} flash={null} memory={one} onChange={oldChange} onSave={oldSave} />);
    const first = editor();
    act(() => first.dispatch({ selection: { anchor: 7 } }));
    view.rerender(<EditorPane key="two/index.ts" content={content} flash={null} memory={two} onChange={() => undefined} onSave={() => undefined} />);
    expect(editor()).not.toBe(first);
    expect(one.state?.selection.main.anchor).toBe(7);
    act(() => editor().dispatch({ selection: { anchor: 2 } }));
    view.rerender(<EditorPane key="one/index.ts" content={content} flash={null} memory={one} onChange={freshChange} onSave={freshSave} />);
    expect(editor().state.selection.main.anchor).toBe(7);
    expect(two.state?.selection.main.anchor).toBe(2);
    act(() => editor().dispatch({ changes: { from: 0, insert: "fresh " } }));
    expect(freshChange).toHaveBeenCalledExactlyOnceWith(`fresh ${content}`);
    expect(oldChange).not.toHaveBeenCalled();
    fireEvent.keyDown(editor().contentDOM, { key: "s", ctrlKey: true });
    expect(freshSave).toHaveBeenCalledOnce();
    expect(oldSave).not.toHaveBeenCalled();
  });

  it("updates callbacks in an already mounted editor without losing its cursor", () => {
    const oldChange = vi.fn(); const oldSave = vi.fn(); const freshChange = vi.fn(); const freshSave = vi.fn();
    const view = render(<EditorPane content={content} flash={null} onChange={oldChange} onSave={oldSave} />);
    const current = editor(); act(() => current.dispatch({ selection: { anchor: 3 } }));
    view.rerender(<EditorPane content={content} flash={null} onChange={freshChange} onSave={freshSave} />);
    expect(editor()).toBe(current);
    expect(current.state.selection.main.anchor).toBe(3);
    act(() => current.dispatch({ changes: { from: 0, insert: "new " } }));
    fireEvent.keyDown(current.contentDOM, { key: "s", ctrlKey: true });
    expect(freshChange).toHaveBeenCalledExactlyOnceWith(`new ${content}`);
    expect(freshSave).toHaveBeenCalledOnce();
    expect(oldChange).not.toHaveBeenCalled(); expect(oldSave).not.toHaveBeenCalled();
  });

  it("does not restore an old cursor against a different current file observation", () => {
    const memory: EditorMemory = { state: null };
    const view = render(<EditorPane key="old" content={content} flash={null} memory={memory} onChange={() => undefined} onSave={() => undefined} />);
    act(() => editor().dispatch({ selection: { anchor: 12 } }));
    view.rerender(<EditorPane key="new" content="x" flash={null} memory={memory} onChange={() => undefined} onSave={() => undefined} />);
    expect(editor().state.doc.toString()).toBe("x");
    expect(editor().state.selection.main.anchor).toBe(0);
  });

  it("restores CRLF tab selection in normalized coordinate space without a synthetic source edit", () => {
    const memory: EditorMemory = { state: null }; const onChange = vi.fn(); const crlf = "alpha\r\nbeta\r\ngamma";
    const view = render(<EditorPane key="old" content={crlf} flash={null} memory={memory} onChange={onChange} onSave={() => undefined} />);
    act(() => editor().dispatch({ selection: { anchor: 7 } }));
    view.rerender(<EditorPane key="new" content={crlf} flash={null} memory={memory} onChange={onChange} onSave={() => undefined} />);
    expect(editor().state.selection.main.anchor).toBe(7);
    expect(onChange).not.toHaveBeenCalled();
  });
});
