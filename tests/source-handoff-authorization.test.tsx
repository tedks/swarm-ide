// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorPane, type SourceLineNavigation } from "../app/renderer/EditorPane";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const content = "one\r\ntwo\r\nthree";
const currentEditor = () => EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;

describe("real source navigation execution-time authorization", () => {
  it.each([false, true])("revokes a committed command before selection/focus (invalid payload: %s)", (invalid) => {
    let authorized = true;
    const retire = vi.fn(), acknowledge = vi.fn(), isCurrent = vi.fn(() => authorized);
    const navigation: SourceLineNavigation = { nonce: 8, content: invalid ? "different" : content,
      line: invalid ? 0 : 3, focus: true, authorization: { isCurrent, retire } };
    function Parent({ revoke, command }: { revoke: boolean; command: SourceLineNavigation | null }) {
      // The command prop remains present and was valid when offered. Parent
      // layout revocation happens before the real child's passive delivery.
      useLayoutEffect(() => { if (revoke) authorized = false; }, [revoke]);
      return <EditorPane content={content} flash={null} onChange={() => undefined} onSave={() => undefined}
        navigation={command} onNavigation={acknowledge} />;
    }
    const view = render(<Parent revoke={false} command={null} />);
    const editor = currentEditor(), element = editor.dom;
    act(() => editor.dispatch({ selection: { anchor: 2 } }));
    const dispatch = vi.spyOn(editor, "dispatch"), focus = vi.spyOn(editor, "focus");
    view.rerender(<Parent revoke command={navigation} />);
    expect(isCurrent).toHaveBeenCalled(); expect(isCurrent).toHaveReturnedWith(false);
    expect(retire).toHaveBeenCalledOnce(); expect(acknowledge).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
    expect(currentEditor().dom).toBe(element); expect(editor.state.selection.main.anchor).toBe(2);
    expect(editor.state.doc.toString()).toBe("one\ntwo\nthree");
  });

  it("applies a normalized non-null line and acknowledges after its own focus advances authority", () => {
    let authorized = true;
    const retire = vi.fn(), acknowledge = vi.fn(), isCurrent = vi.fn(() => authorized);
    const navigation: SourceLineNavigation = { nonce: 9, content, line: 2, focus: true,
      authorization: { isCurrent, retire } };
    const view = render(<div onFocusCapture={() => { authorized = false; }}><EditorPane content={content}
      flash={null} onChange={() => undefined} onSave={() => undefined} onNavigation={acknowledge} /></div>);
    const editor = currentEditor(), focus = vi.spyOn(editor, "focus");
    view.rerender(<div onFocusCapture={() => { authorized = false; }}><EditorPane content={content}
      flash={null} onChange={() => undefined} onSave={() => undefined} navigation={navigation} onNavigation={acknowledge} /></div>);
    expect(editor.state.selection.main.anchor).toBe(4); expect(focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editor.contentDOM); expect(authorized).toBe(false);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(9, true); expect(retire).not.toHaveBeenCalled();
    expect(isCurrent).toHaveReturnedWith(true);
  });

  it.each([0, 4, 1.5, Number.NaN])("retains a current invalid-line error for %s without selection/focus", (line) => {
    const retire = vi.fn(), acknowledge = vi.fn();
    const view = render(<EditorPane content={content} flash={null} onChange={() => undefined} onSave={() => undefined} />);
    const editor = currentEditor(), dispatch = vi.spyOn(editor, "dispatch"), focus = vi.spyOn(editor, "focus");
    view.rerender(<EditorPane content={content} flash={null} onChange={() => undefined} onSave={() => undefined}
      navigation={{ nonce: 10, content, line, focus: true, authorization: { isCurrent: () => true, retire } }} onNavigation={acknowledge} />);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(10, false); expect(retire).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
  });
});
