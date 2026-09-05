export interface SourceFlash {
  id: number;
  from: number;
  to: number;
  removed: string;
}

export function sourceFlash(previous: string, next: string, id: number): SourceFlash | null {
  if (previous === next) return null;
  const lines = (content: string) => content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const previousLines = lines(previous);
  const nextLines = lines(next);
  let prefixLines = 0;
  const prefixLimit = Math.min(previousLines.length, nextLines.length);
  while (prefixLines < prefixLimit && previousLines[prefixLines] === nextLines[prefixLines]) prefixLines += 1;

  let suffixLines = 0;
  const suffixLimit = Math.min(previousLines.length - prefixLines, nextLines.length - prefixLines);
  while (
    suffixLines < suffixLimit &&
    previousLines[previousLines.length - suffixLines - 1] === nextLines[nextLines.length - suffixLines - 1]
  ) suffixLines += 1;

  const from = nextLines.slice(0, prefixLines).join("").length;
  const added = nextLines.slice(prefixLines, nextLines.length - suffixLines).join("");
  const removed = previousLines.slice(prefixLines, previousLines.length - suffixLines).join("");

  return {
    id,
    from,
    to: from + added.length,
    removed,
  };
}
