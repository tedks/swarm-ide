import { useEffect, useRef } from "react";
import { defaultKeymap } from "@codemirror/commands";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
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
import { sourceLanguage, sourceSyntaxHighlighting } from "./editor-language";
import { bazelStringAt } from "./bazel-reference";

const setSourceFlash = StateEffect.define<SourceFlash | null>();

/** Tab-local memory, not persisted text or filesystem authority. */
export interface EditorMemory { state: EditorState | null }
export interface SourceLineNavigation {
  nonce: number; line: number | null; content: string; focus?: boolean;
  /** Renderer-local authority, checked at delivery rather than render time. */
  authorization?: { isCurrent: () => boolean; retire: () => void };
}

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

function minimalReplacement(previous: string, next: string): { from: number; to: number; insert: string } {
  let from = 0;
  const prefixLimit = Math.min(previous.length, next.length);
  while (from < prefixLimit && previous.charCodeAt(from) === next.charCodeAt(from)) from += 1;
  let suffix = 0;
  const suffixLimit = Math.min(previous.length - from, next.length - from);
  while (
    suffix < suffixLimit &&
    previous.charCodeAt(previous.length - suffix - 1) === next.charCodeAt(next.length - suffix - 1)
  ) suffix += 1;
  return { from, to: previous.length - suffix, insert: next.slice(from, next.length - suffix) };
}

export function EditorPane({ path, content, flash, onChange, onSave, memory, navigation, onNavigation, onReference }: {
  path?: string;
  content: string;
  flash: SourceFlash | null;
  onChange: (content: string) => void;
  onSave: () => void;
  memory?: EditorMemory;
  navigation?: SourceLineNavigation | null;
  onNavigation?: (nonce: number, applied: boolean) => void;
  /** Resolve against the current matching repository observation; true consumes Alt-click. */
  onReference?: (reference: string) => boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const suppressChange = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onNavigationRef = useRef(onNavigation);
  const onReferenceRef = useRef(onReference);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onNavigationRef.current = onNavigation;
  onReferenceRef.current = onReference;

  useEffect(() => {
    if (!container.current) return;
    const state = EditorState.create({
      doc: content,
      extensions: [
        language.current.of(sourceLanguage(path)),
        sourceSyntaxHighlighting,
        lineNumbers(),
        drawSelection(),
        highlightActiveLine(),
        sourceFlashField,
        EditorView.domEventHandlers({
          mousedown(event, editor) {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0 || !onReferenceRef.current) return false;
            const position = editor.posAtCoords({ x: event.clientX, y: event.clientY });
            if (position === null) return false;
            const reference = bazelStringAt(editor.state.doc.toString(), position);
            if (!reference || !onReferenceRef.current(reference)) return false;
            event.preventDefault();
            return true;
          },
        }),
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
    // Rebuild extensions so callbacks belong to this component lifetime, while
    // restoring a tab's selection. Never reuse extensions closing over an old
    // component's change/save handlers.
    const prior = memory?.state;
    const selection = prior?.doc.toString() === content.replace(/\r\n?/g, "\n") ? prior.selection : undefined;
    view.current = new EditorView({ state: selection ? state.update({ selection }).state : state, parent: container.current });
    return () => { if (memory) memory.state = view.current?.state ?? null; view.current?.destroy(); view.current = null; };
    // A source tab owns one editor instance; content changes are synchronized below.
  }, []);

  useEffect(() => {
    const current = view.current;
    const extension = sourceLanguage(path);
    if (current && language.current.get(current.state) !== extension) {
      // Reconfigure only parsing: text, selection, decorations and other fields
      // remain in the same EditorView (including any installed undo history).
      current.dispatch({ effects: language.current.reconfigure(extension) });
    }
  }, [path]);

  useEffect(() => {
    const current = view.current;
    const normalized = content.replace(/\r\n?/g, "\n");
    if (!current || current.state.doc.toString() === normalized) return;
    const change = minimalReplacement(current.state.doc.toString(), normalized);
    suppressChange.current = true;
    current.dispatch({ changes: change, effects: setSourceFlash.of(flash) });
    suppressChange.current = false;
  }, [content, flash]);

  useEffect(() => {
    const current = view.current;
    if (!current || !navigation) return;
    // A committed effect may run after a newer gesture, before new props arrive.
    // Obsolescence is not a buffer error and must not ask for notice focus.
    if (navigation.authorization && !navigation.authorization.isCurrent()) {
      navigation.authorization.retire(); return;
    }
    if (current.state.doc.toString() !== navigation.content.replace(/\r\n?/g, "\n") ||
        (navigation.line !== null && (!Number.isSafeInteger(navigation.line) || navigation.line < 1 || navigation.line > current.state.doc.lines))) {
      onNavigationRef.current?.(navigation.nonce, false); return;
    }
    if (navigation.line !== null) current.dispatch({ selection: { anchor: current.state.doc.line(navigation.line).from }, scrollIntoView: true });
    if (navigation.focus) current.focus();
    onNavigationRef.current?.(navigation.nonce, true);
  }, [navigation]);

  useEffect(() => {
    const current = view.current;
    if (!current || !flash) return;
    current.dispatch({ effects: setSourceFlash.of(flash) });
    const timer = window.setTimeout(() => current.dispatch({ effects: setSourceFlash.of(null) }), 1_800);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return <div ref={container} className="source-editor" data-testid="source-editor" />;
}
