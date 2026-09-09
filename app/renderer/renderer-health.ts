import { useLayoutEffect, useRef } from "react";

export interface RecoveryText { label: string; text: string }
type Reader = () => RecoveryText[];
const readers = new Map<symbol, Reader>();
const defaultOwner = Symbol("standalone recovery reader");

/** One current reader, not an accumulating transcript or persistent text store. */
export const recoveryText = {
  set(next: Reader, owner = defaultOwner) { readers.set(owner, next); },
  clear(owner?: symbol) { if (owner) readers.delete(owner); else readers.clear(); },
  read(): RecoveryText[] {
    const text: RecoveryText[] = [];
    for (const read of readers.values()) {
      try { text.push(...read().map(({ label, text }) => ({ label, text }))); }
      catch { /* A failed reader must not hide text from other mounted owners. */ }
    }
    return text;
  },
};

/** Readers exist only for mounted owners. The boundary snapshots before cleanup. */
export function useRecoveryText(read: Reader) {
  const latest = useRef(read); latest.current = read;
  useLayoutEffect(() => {
    const owner = Symbol("mounted recovery reader");
    recoveryText.set(() => latest.current(), owner);
    return () => recoveryText.clear(owner);
  }, []);
}

/** No error payloads, source text, URLs or rejected values cross into logs. */
export function installRendererDiagnostics(target: Window, report: (message: string) => void = console.error) {
  const error = () => report("[renderer-health] script-error");
  const rejection = () => report("[renderer-health] unhandled-rejection");
  target.addEventListener("error", error);
  target.addEventListener("unhandledrejection", rejection);
  return () => { target.removeEventListener("error", error); target.removeEventListener("unhandledrejection", rejection); };
}
