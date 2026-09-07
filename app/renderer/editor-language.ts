import { javascriptLanguage, jsxLanguage, typescriptLanguage, tsxLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

// Only language parsers: the packages' broader support helpers also install
// completion/tag-closing/Markdown key bindings, outside a highlighting change.
// Never source execution or asynchronous language discovery.
const languages: Record<string, Extension> = {
  javascript: javascriptLanguage,
  jsx: jsxLanguage,
  typescript: typescriptLanguage,
  tsx: tsxLanguage,
  json: jsonLanguage,
  markdown: markdownLanguage,
  plain: [],
};

export function sourceLanguageName(path = ""): string {
  const filename = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  const extension = filename.includes(".") ? filename.split(".").at(-1) : "";
  switch (extension) {
    case "js": case "mjs": case "cjs": return "javascript";
    case "jsx": return "jsx";
    case "ts": case "mts": case "cts": return "typescript";
    case "tsx": return "tsx";
    case "json": return "json";
    case "md": case "markdown": return "markdown";
    default: return "plain";
  }
}

export const sourceLanguage = (path?: string): Extension => languages[sourceLanguageName(path)];

// Deliberately restrained against the existing #081213 source background.
export const sourceHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#b7a5d9" },
  { tag: [tags.string, tags.regexp], color: "#97c9b2" },
  { tag: [tags.number, tags.bool, tags.null], color: "#dbbd88" },
  { tag: tags.comment, color: "#789a95", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#8ec6d3" },
  { tag: [tags.typeName, tags.className, tags.tagName], color: "#d2c38f" },
  { tag: [tags.propertyName, tags.attributeName], color: "#aecbd5" },
  { tag: tags.heading, color: "#8dd6be", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "#98bde0", textDecoration: "underline" },
  { tag: tags.monospace, color: "#dbbd88" },
]);

export const sourceSyntaxHighlighting = syntaxHighlighting(sourceHighlightStyle);
