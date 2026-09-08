import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { cursorCharForwardLogical } from "@codemirror/commands";
import { highlightTree } from "@lezer/highlight";
import { sourceHighlightStyle, sourceLanguage, sourceLanguageName } from "../app/renderer/editor-language";

const samples: [string, string, string, string[]][] = [
  ["BUILD.bazel", "starlark", 'load("//tools:defs.bzl", "rule")\n# build\nrule(name = "demo", srcs = ["app.py"])', ['"demo"', '# build']],
  ["flake.nix", "nix", 'let answer = 42; in { name = "demo"; } # nix', ["let", "42", '"demo"', '# nix']],
  ["main.py", "python", 'def answer():\n    return "demo" # python', ['def', 'return', '"demo"', '# python']],
  ["run.sh", "shell", 'if true; then echo "demo"; fi # shell', ['if', '"demo"', '# shell']],
  ["config.yaml", "yaml", 'enabled: true\ncount: 42\n# yaml', ['42', '# yaml']],
  ["Move.toml", "toml", '[package]\nname = "demo"\n# toml', ['package', '"demo"', '# toml']],
  ["style.css", "css", '.demo { color: red; width: 42px; } /* css */', ['color', '42', '/* css */']],
  ["index.html", "html", '<main class="demo">Hello</main><!-- html -->', ['main', 'class', '"demo"', '<!-- html -->']],
  ["agent.ml", "ocaml", 'let name = "demo" (* ocaml *)', ['let', '"demo"', '(* ocaml *)']],
  ["lib.rs", "rust", 'pub fn demo() { let n = 42; } // rust', ['pub', '42', '// rust']],
  ["main.go", "go", 'package main\nfunc main() { println("demo") } // go', ['package', 'func', '"demo"', '// go']],
  ["source.c", "c", 'int main() { return 42; } // C', ['int', 'return', '42', '// C']],
  ["source.cpp", "cpp", 'class Demo { int count = 42; }; // C++', ['class', '42', '// C++']],
  ["app.kt", "kotlin", 'fun main() { val name = "demo" } // kotlin', ['fun', 'val', '"demo"', '// kotlin']],
  ["app.swift", "swift", 'let name = "demo" // swift', ['let', '"demo"', '// swift']],
  ["source.move", "move", 'module demo::test { public fun value(): u64 { 42 } } // Move', ['42', '// Move']],
  ["Dockerfile", "dockerfile", 'FROM node:22\n# container\nWORKDIR /app', ['FROM', '# container', 'WORKDIR']],
  ["schema.sql", "sql", 'SELECT name FROM items WHERE id = 42; -- SQL', ['SELECT', 'FROM', '42', '-- SQL']],
  ["schema.proto", "protobuf", 'syntax = "proto3";\nmessage Demo { string name = 1; }', ['"proto3"', 'message', 'string', '1']],
  ["pom.xml", "xml", '<project name="demo"><!-- xml --></project>', ['project', 'name', '"demo"', '<!-- xml -->']],
  ["gradle.properties", "properties", '# properties\nname=demo', ['# properties']],
];

describe("project language highlighting", () => {
  it.each(samples)("recognizes and colors %s", (path, name, content, expected) => {
    expect(sourceLanguageName(path)).toBe(name);
    const extension = sourceLanguage(path);
    expect(sourceLanguage(`other/${path}`)).toBe(extension);
    const state = EditorState.create({ doc: content, extensions: extension });
    const tree = ensureSyntaxTree(state, content.length, 200);
    expect(tree).not.toBeNull();
    const tokens: string[] = [];
    highlightTree(tree!, sourceHighlightStyle, (from, to, style) => {
      expect(style).not.toBe(""); tokens.push(content.slice(from, to));
    });
    for (const token of expected) expect(tokens.join("|")).toContain(token);
    expect(state.facet(keymap)).toEqual([]);
    expect(state.languageDataAt("autocomplete", 0)).toEqual([]);
    let next = state;
    expect(cursorCharForwardLogical({ state, dispatch: (transaction) => { next = transaction.state; } })).toBe(true);
    expect(next.selection.main.anchor).toBe(1);
    expect(next.selection.main.head).toBe(1);
  });

  it.each([
    ["BUILD", "starlark"], ["WORKSPACE", "starlark"], ["WORKSPACE.bazel", "starlark"],
    ["MODULE.bazel", "starlark"], ["defs.bzl", "starlark"], ["pkg\\BUILD.bazel", "starlark"],
    ["default.nix", "nix"], ["shell.nix", "nix"], [".envrc", "shell"], [".bashrc", "shell"],
    [".bash_profile", "shell"], [".zshrc", "shell"], [".profile", "shell"], ["setup.bash", "shell"],
    [".clang-format", "yaml"], [".clang-tidy", "yaml"], [".prettierrc.yaml", "yaml"],
    ["docker-compose.yml", "yaml"], ["config.TOML", "toml"], ["types.pyi", "python"],
    ["api.mli", "ocaml"], ["gradle.kts", "kotlin"], ["header.hpp", "cpp"],
    ["Dockerfile.dev", "dockerfile"], ["worker.Dockerfile", "dockerfile"], ["Containerfile", "dockerfile"],
    ["image.svg", "xml"], [".npmrc", "properties"], [".editorconfig", "properties"],
    ["file.bzl.bak", "plain"], ["flake.nix/README", "plain"], ["BUILD.backup", "plain"],
    ["Dockerfile.bak", "plain"], ["MODULE.bazel.lock", "plain"], ["secret.env", "plain"],
    ["document.unknown", "plain"], ["", "plain"],
  ])("resolves special name %s without content inference", (path, expected) => {
    expect(sourceLanguageName(path)).toBe(expected);
  });
});
