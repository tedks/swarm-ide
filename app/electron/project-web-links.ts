/** Native browser handoff is limited to ordinary web links, never file/custom
 * handlers, embedded credentials, wildcard listeners, or navigation in the IDE. */
export function projectWebUrl(value: string): string | null {
  if (value.length > 2048 || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      ["0.0.0.0", "[::]"].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
