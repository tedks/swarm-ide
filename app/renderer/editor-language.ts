import { javascriptLanguage, jsxLanguage, typescriptLanguage, tsxLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import { pythonLanguage } from "@codemirror/lang-python";
import { nixLanguage } from "@replit/codemirror-lang-nix";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { oCaml } from "@codemirror/legacy-modes/mode/mllike";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { go } from "@codemirror/legacy-modes/mode/go";
import { c, cpp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { protobuf } from "@codemirror/legacy-modes/mode/protobuf";
import { xml } from "@codemirror/legacy-modes/mode/xml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

// Only language parsers: the packages' broader support helpers also install
// completion/tag-closing/Markdown key bindings, outside a highlighting change.
// Never source execution or asynchronous language discovery.
function stream<State>(parser: StreamParser<State>): Extension {
  // Several upstream stream modes carry completion lists. Keep highlighting
  // and comment/indent metadata, but do not install a new completion source.
  const languageData = { ...parser.languageData };
  delete languageData.autocomplete;
  return StreamLanguage.define({ ...parser, languageData });
}

const languages: Record<string, Extension> = {
  javascript: javascriptLanguage,
  jsx: jsxLanguage,
  typescript: typescriptLanguage,
  tsx: tsxLanguage,
  json: jsonLanguage,
  markdown: markdownLanguage,
  css: cssLanguage,
  html: htmlLanguage,
  python: pythonLanguage,
  // Starlark shares Python's lexical syntax; this is coloring, not Bazel validation.
  starlark: pythonLanguage,
  nix: nixLanguage,
  shell: stream(shell),
  yaml: stream(yaml),
  toml: stream(toml),
  ocaml: stream(oCaml),
  rust: stream(rust),
  // Useful shared comments/strings/numbers; not a dedicated Move grammar.
  move: stream(rust),
  go: stream(go),
  c: stream(c),
  cpp: stream(cpp),
  kotlin: stream(kotlin),
  swift: stream(swift),
  dockerfile: stream(dockerFile),
  sql: stream(standardSQL),
  protobuf: stream(protobuf),
  xml: stream(xml),
  properties: stream(properties),
  plain: [],
};

const specialNames: Record<string, string> = {
  build: "starlark", workspace: "starlark",
  dockerfile: "dockerfile", containerfile: "dockerfile",
  ".envrc": "shell", ".bashrc": "shell", ".bash_profile": "shell", ".bash_login": "shell",
  ".bash_logout": "shell", ".profile": "shell", ".zshrc": "shell", ".zshenv": "shell", ".zprofile": "shell",
  ".clang-format": "yaml", ".clang-tidy": "yaml",
  ".npmrc": "properties", ".yarnrc": "properties", ".editorconfig": "properties",
};

export function sourceLanguageName(path = ""): string {
  const filename = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  if (Object.hasOwn(specialNames, filename)) return specialNames[filename];
  // Never color editor backups as source, including Dockerfile.bak.
  if (/(?:~|\.(?:bak|backup|old|orig|rej|swp|swo))$/.test(filename)) return "plain";
  if (/^(?:dockerfile|containerfile)\./.test(filename)) return "dockerfile";
  const extension = filename.includes(".") ? filename.split(".").at(-1) : "";
  switch (extension) {
    case "js": case "mjs": case "cjs": return "javascript";
    case "jsx": return "jsx";
    case "ts": case "mts": case "cts": return "typescript";
    case "tsx": return "tsx";
    case "json": return "json";
    case "md": case "markdown": return "markdown";
    case "bzl": case "bazel": case "star": return "starlark";
    case "nix": return "nix";
    case "py": case "pyi": case "pyw": return "python";
    case "sh": case "bash": case "zsh": return "shell";
    case "yaml": case "yml": return "yaml";
    case "toml": return "toml";
    case "css": return "css";
    case "html": case "htm": return "html";
    case "ml": case "mli": return "ocaml";
    case "rs": return "rust";
    case "move": return "move";
    case "go": return "go";
    case "c": case "h": return "c";
    case "cc": case "cpp": case "cxx": case "hh": case "hpp": case "hxx": return "cpp";
    case "kt": case "kts": return "kotlin";
    case "swift": return "swift";
    case "dockerfile": case "containerfile": return "dockerfile";
    case "sql": return "sql";
    case "proto": return "protobuf";
    case "xml": case "svg": case "xsd": return "xml";
    case "properties": case "ini": return "properties";
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
