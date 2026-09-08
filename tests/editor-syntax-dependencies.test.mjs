// @vitest-environment node
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
describe("syntax parser state identity", () => {
  it("uses the same actual state implementation throughout the language/view/command graph", () => {
    const expected = realpathSync(require.resolve("@codemirror/state"));
    const seen = new Set();
    const inspect = (entry) => {
      if (seen.has(entry)) return;
      seen.add(entry);
      const local = createRequire(entry);
      for (const dependency of ["@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/autocomplete", "@codemirror/lint"]) {
        let resolved;
        try { resolved = realpathSync(local.resolve(dependency)); } catch { continue; }
        if (dependency === "@codemirror/state") expect(resolved).toBe(expected);
        else inspect(resolved);
      }
    };
    for (const dependency of ["@codemirror/commands", "@codemirror/view", "@codemirror/language", "@codemirror/lang-javascript", "@codemirror/lang-json", "@codemirror/lang-markdown",
      "@codemirror/lang-css", "@codemirror/lang-html", "@codemirror/lang-python", "@replit/codemirror-lang-nix", "@codemirror/legacy-modes/mode/shell"])
      inspect(require.resolve(dependency));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
