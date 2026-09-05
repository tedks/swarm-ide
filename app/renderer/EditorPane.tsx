import { useEffect, useRef } from "react";
import { defaultKeymap } from "@codemirror/commands";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import type { SourceFlash } from "./source-diff";

const setSourceFlash = StateEffect.define<SourceFlash | null>();

class RemovedTextWidget extends WidgetType {
  constructor(private readonly removed: string) { super(); }
  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-removed-ghost";
    element.dataset.testid = "removed-source-ghost";
    element.textContent = this.removed;
    element.title = "Text removed from the working file";
    return element;
  }
  eq(other: RemovedTextWidget): boolean { return other.removed === this.removed; }
}

function flashDecorations(documentLength: number, flash: SourceFlash | null): DecorationSet {
  if (!flash) return Decoration.none;
  const decorations = [];
  const from = Math.min(flash.from, documentLength);
  const to = Math.min(Math.max(flash.to, from), documentLength);
  if (to > from) decorations.push(Decoration.mark({ class: "cm-added-flash" }).range(from, to));
  if (flash.removed) decorations.push(Decoration.widget({ widget: new RemovedTextWidget(flash.removed), side: -1 }).range(from));
  return Decoration.set(decorations, true);
}

const sourceFlashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setSourceFlash)) next = flashDecorations(transaction.newDoc.length, effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function EditorPane({ content, flash, onChange, onSave }: {
  content: string;
  flash: SourceFlash | null;
  onChange: (content: string) => void;
  onSave: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const suppressChange = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!container.current) return;
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        drawSelection(),
        highlightActiveLine(),
        sourceFlashField,
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => { onSaveRef.current(); return true; } },
          ...defaultKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressChange.current) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", backgroundColor: "#081213", color: "#c8d7d4" },
          ".cm-content": { caretColor: "#57d3ad", fontFamily: '"DM Mono", ui-monospace, monospace', fontSize: "11px" },
          ".cm-cursor": { borderLeftColor: "#57d3ad" },
          ".cm-gutters": { backgroundColor: "#0a1516", color: "#4f6965", borderRight: "1px solid #1a2b2c" },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#102021" },
          "&.cm-focused": { outline: "none" },
        }),
      ],
    });
    view.current = new EditorView({ state, parent: container.current });
    return () => { view.current?.destroy(); view.current = null; };
    // A source tab owns one editor instance; content changes are synchronized below.
  }, []);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === content) return;
    suppressChange.current = true;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: content }, effects: setSourceFlash.of(flash) });
    suppressChange.current = false;
  }, [content, flash]);

  useEffect(() => {
    const current = view.current;
    if (!current || !flash) return;
    current.dispatch({ effects: setSourceFlash.of(flash) });
    const timer = window.setTimeout(() => current.dispatch({ effects: setSourceFlash.of(null) }), 1_800);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return <div ref={container} className="source-editor" data-testid="source-editor" />;
}
