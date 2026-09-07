// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, undo, undoDepth } from "@codemirror/commands";
import { ensureSyntaxTree } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { EditorPane, type EditorMemory } from "../app/renderer/EditorPane";
import { sourceHighlightStyle, sourceLanguage, sourceLanguageName } from "../app/renderer/editor-language";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const editor = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;

describe("bounded source language selection", () => {
  it.each([
    ["src/main.ts", "typescript"], ["src/types.d.ts", "typescript"], ["mod.mts", "typescript"], ["mod.cts", "typescript"],
    ["ui/App.TSX", "tsx"], ["src/main.js", "javascript"], ["module.mjs", "javascript"], ["module.cjs", "javascript"],
    ["ui/App.jsx", "jsx"], [".swarm/plans.json", "json"], ["README.md", "markdown"], ["docs/design.markdown", "markdown"],
    ["windows\\App.tsx", "tsx"], ["README", "plain"], ["src.ts/README", "plain"], ["script.ts.bak", "plain"],
    ["config.jsonc", "plain"], ["component.mdx", "plain"], ["", "plain"],
  ])("selects %s as %s", (path, expected) => { expect(sourceLanguageName(path)).toBe(expected); });

  it.each([
    ["entry.ts", "const limit: number = 12; // bounded", ["const", "number", "12", "// bounded"]],
    ["View.tsx", "const view = <Button label=\"hello\" />;", ["const", "Button", "label", '"hello"']],
    ["config.json", '{"name":"swarm","enabled":true,"limit":12}', ['"name"', '"swarm"', "true", "12"]],
    ["README.md", "# Heading\n\n**Important** and `code`.", ["# Heading", "**", "Important", "code"]],
  ])("parses actual %s syntax into colored/style tokens", (path, content, expected) => {
    const state = EditorState.create({ doc: content, extensions: sourceLanguage(path) });
    const tree = ensureSyntaxTree(state, content.length, 100)!;
    expect(tree).not.toBeNull();
    const tokens: string[] = [];
    highlightTree(tree, sourceHighlightStyle, (from, to, style) => {
      expect(style).not.toBe(""); tokens.push(content.slice(from, to));
    });
    for (const token of expected) expect(tokens.join("|")).toContain(token);
  });

  it("does not infer a language from unsupported file content", () => {
    const state = EditorState.create({ doc: "const secret = 12;", extensions: sourceLanguage("README") });
    expect(ensureSyntaxTree(state, state.doc.length)).toBeNull();
    expect(sourceLanguage("a.ts")).toBe(sourceLanguage("b.ts"));
  });

  it.each(["main.ts", "View.tsx", "main.js", "View.jsx", "config.json", "README.md"])("does not install extra key bindings for %s", (path) => {
    const state = EditorState.create({ doc: "", extensions: sourceLanguage(path) });
    expect(state.facet(keymap)).toEqual([]);
    expect(state.languageDataAt("autocomplete", 0)).toEqual([]);
  });
});

describe("mounted syntax changes retain the existing editor", () => {
  it("reconfigures the parser without losing unsaved text, selection, focus, scroll, history or callbacks", () => {
    const initial = "const count = 12;\n", onChange = vi.fn(), onSave = vi.fn(), latestSave = vi.fn();
    const props = { content: initial, flash: null, onChange, onSave };
    const mounted = render(<EditorPane {...props} path="main.ts" />);
    const view = editor(), dom = view.dom;
    expect(view.contentDOM.querySelectorAll("span[class]").length).toBeGreaterThan(0);
    act(() => {
      // Baseline has no history extension. Install it here to prove the new
      // compartment preserves existing state fields rather than rebuilding.
      view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
      view.dispatch({ changes: { from: initial.length, insert: "// unsaved" }, selection: { anchor: 4, head: 9 } });
      view.focus();
    });
    const changed = view.state.doc.toString(), selection = view.state.selection;
    const notifications = onChange.mock.calls.length;
    view.scrollDOM.scrollTop = 37;
    mounted.rerender(<EditorPane {...props} content={changed} path="notes.md" onSave={latestSave} />);
    expect(editor()).toBe(view); expect(editor().dom).toBe(dom);
    expect(view.state.doc.toString()).toBe(changed); expect(view.state.selection.eq(selection)).toBe(true);
    expect(view.hasFocus).toBe(true); expect(view.scrollDOM.scrollTop).toBe(37);
    expect(undoDepth(view.state)).toBe(1); expect(onChange.mock.calls.length).toBe(notifications);
    act(() => { fireEvent.keyDown(view.contentDOM, { key: "s", code: "KeyS", ctrlKey: true }); });
    expect(latestSave).toHaveBeenCalledOnce(); expect(onSave).not.toHaveBeenCalled();
    act(() => { expect(undo(view)).toBe(true); });
    expect(view.state.doc.toString()).toBe(initial);
    expect(onChange).toHaveBeenLastCalledWith(initial);
  });

  it("returns to plain text while retaining diff flashes and normalized external updates", () => {
    const onChange = vi.fn(), props = { content: "const count = 1;\r\n", flash: null, onChange, onSave: vi.fn() };
    const mounted = render(<EditorPane {...props} path="main.ts" />);
    const view = editor();
    const flash = { id: 1, from: 14, to: 15, removed: "old" };
    mounted.rerender(<EditorPane {...props} content={"const count = 2;\r\n"} flash={flash} path="main.ts" />);
    expect(view.state.doc.toString()).toBe("const count = 2;\n");
    expect(view.dom.querySelector(".cm-added-flash")?.textContent).toBe("2");
    expect(view.dom.querySelector(".cm-removed-ghost")?.textContent).toBe("old");
    mounted.rerender(<EditorPane {...props} content={"const count = 2;\r\n"} flash={flash} path="NOTES" />);
    expect(editor()).toBe(view);
    expect(view.dom.querySelector(".cm-added-flash")?.textContent).toBe("2");
    expect(view.dom.querySelector(".cm-removed-ghost")?.textContent).toBe("old");
    expect(ensureSyntaxTree(view.state, view.state.doc.length)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps existing tab selection memory and updates change callbacks", () => {
    const memory: EditorMemory = { state: null }, onChange = vi.fn(), latest = vi.fn();
    const props = { content: '{"limit":12}', flash: null, onChange, onSave: vi.fn(), memory, path: "config.json" };
    const first = render(<EditorPane {...props} />);
    act(() => editor().dispatch({ selection: { anchor: 2, head: 7 } }));
    first.unmount();
    const second = render(<EditorPane {...props} onChange={latest} />);
    expect(editor().state.selection.main.anchor).toBe(2); expect(editor().state.selection.main.head).toBe(7);
    expect(editor().contentDOM.querySelectorAll("span[class]").length).toBeGreaterThan(0);
    second.rerender(<EditorPane {...props} onChange={latest} path="plain.txt" />);
    act(() => editor().dispatch({ changes: { from: 9, to: 11, insert: "34" } }));
    expect(latest).toHaveBeenCalledExactlyOnceWith('{"limit":34}'); expect(onChange).not.toHaveBeenCalled();
  });
});
