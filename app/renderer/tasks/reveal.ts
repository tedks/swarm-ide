import { protectsBuffer } from "../recovery";
export { canRevealTaskRef as validTaskReference } from "./display";

export function taskLineTarget(tab: { content: string; savedContent: string; status: string }, line: number | null):
  { line: number | null; notice: string } {
  if (protectsBuffer(tab) || tab.status !== "saved") return { line: null,
    notice: "Working buffer preserved; metadata line cannot safely map to unsaved or unreconciled text. Cursor retained." };
  if (line === null) return { line: null, notice: "Opened current working file; no line was recorded." };
  // CodeMirror treats CRLF and lone CR as line breaks as well as LF.
  const lines = tab.savedContent.split(/\r\n?|\n/).length;
  if (!Number.isSafeInteger(line) || line < 1 || line > lines) return { line: null,
    notice: `Referenced line ${line} is unavailable in the current saved file; opened file without inventing a location.` };
  return { line, notice: `Opened current working file at recorded line ${line}; metadata is not a source revision.` };
}
