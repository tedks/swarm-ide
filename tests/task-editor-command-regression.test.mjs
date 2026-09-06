// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { cursorCharForwardLogical } from "@codemirror/commands";

describe("real editor commands after task Reveal", () => {
  it("keeps actual command-produced selections compatible with the editor state", () => {
    const state = EditorState.create({ doc: "ab\ncd" });
    let dispatched;
    // Deliberately JavaScript: TypeScript rejects the split dependency types,
    // but the actual browser command also needs a runtime regression.
    expect(cursorCharForwardLogical({ state, dispatch: (transaction) => { dispatched = transaction; } })).toBe(true);
    expect(dispatched).toBeDefined();
    const next = dispatched.state;
    expect(next.selection.main.anchor).toBe(1);
    expect(next.selection.main.head).toBe(1);
    expect(Number.isSafeInteger(next.selection.main.anchor)).toBe(true);
    expect(next.doc.lineAt(next.selection.main.anchor).number).toBe(1);
    expect(next.doc.toString()).toBe("ab\ncd");
  });
});
