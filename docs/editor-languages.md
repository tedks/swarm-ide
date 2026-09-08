# Source language colors

Language colors are selected automatically from the opened file's name, in any
repository. They do not depend on a repo-specific configuration or execute the
file. This is syntax highlighting, not a language server, formatter or compiler.

## Coverage

| Language | Recognized files | Implementation |
| --- | --- | --- |
| JavaScript / JSX | `.js`, `.mjs`, `.cjs`, `.jsx` | CodeMirror JavaScript parser |
| TypeScript / TSX | `.ts`, `.mts`, `.cts`, `.tsx`, including `.d.ts` | CodeMirror TypeScript parser |
| JSON | `.json` | CodeMirror JSON parser |
| Markdown | `.md`, `.markdown` | CodeMirror Markdown parser |
| Bazel / Starlark | `BUILD`, `WORKSPACE`, `.bazel` (including `BUILD.bazel`, `WORKSPACE.bazel`, `MODULE.bazel`), `.bzl`, `.star` | Python parser used for shared lexical syntax; **not Starlark validation** |
| Nix | `.nix`, including `flake.nix`, `shell.nix`, `default.nix` | Replit's CodeMirror Nix parser |
| Python | `.py`, `.pyi`, `.pyw` | CodeMirror Python parser |
| CSS | `.css` | CodeMirror CSS parser |
| HTML | `.html`, `.htm` | CodeMirror HTML parser, including its embedded JS/CSS parsing |
| Shell | `.sh`, `.bash`, `.zsh`; `.envrc`, `.bashrc`, `.bash_profile`, `.bash_login`, `.bash_logout`, `.profile`, `.zshrc`, `.zshenv`, `.zprofile` | Shell stream mode; extended Zsh syntax is approximate |
| YAML | `.yaml`, `.yml`, `.clang-format`, `.clang-tidy` | YAML stream mode |
| TOML | `.toml`, including `Move.toml`, `Cargo.toml` | TOML stream mode |
| OCaml | `.ml`, `.mli` | OCaml stream mode |
| Rust | `.rs` | Rust stream mode |
| Move | `.move` | **Rust-like fallback** for shared strings, numbers, comments and some keywords/types; no Move-specific grammar or semantic checks |
| Go | `.go` | Go stream mode |
| C / C++ | `.c`, `.h`; `.cc`, `.cpp`, `.cxx`, `.hh`, `.hpp`, `.hxx` | C / C++ stream modes; ambiguous `.h` defaults to C |
| Kotlin | `.kt`, `.kts` | Kotlin stream mode |
| Swift | `.swift` | Swift stream mode |
| Dockerfile | `Dockerfile`, `Containerfile`, `Dockerfile.*`, `Containerfile.*`, `*.Dockerfile`, `*.Containerfile` | Dockerfile stream mode |
| SQL | `.sql` | Standard SQL stream mode, not a dialect validator |
| Protobuf | `.proto` | Protobuf stream mode |
| XML / SVG | `.xml`, `.svg`, `.xsd` | XML stream mode; SVG remains editable source, not executed content |
| Properties / INI | `.properties`, `.ini`, `.npmrc`, `.yarnrc`, `.editorconfig` | Properties stream mode, approximate for tool-specific extensions |

A stream mode recognizes tokens as text is scanned; it does not provide a full
language syntax tree. Upstream completion lists are removed. No added mode
installs keybindings, autocomplete or tag-closing behavior. Colors share the
existing dark palette.

Recognition uses the basename, case-insensitively, and accepts either path
separator. Backup suffixes (`~`, `.bak`, `.backup`, `.old`, `.orig`, `.rej`, `.swp`,
`.swo`) remain plain text, as do unknown formats. `source.ts/README` does not
become TypeScript because a directory has an extension. No shebang or content
sniffing occurs. Extensionless scripts, Dune/opam, JSONC, MDX, Vue/Svelte templates,
SCSS and a dedicated Move grammar remain follow-ups; this is not universal
coverage of every repository or file on GitHub.

## Grounding in the local projects

The bounded September 8 inventory counted tracked filenames, not private
transcripts or credentials. Goals is largely TS/TSX; Pure Sky combines Python,
JSX and CSS; Predictionbook and Pairmarket add Move/TOML; discord-agents contains
48 OCaml implementation files and 3 interfaces. Slowed was inspected at
`tedks/tedks-bootstrap/apps/slowed`. The Chaos speech checkout adds Kotlin, Go,
Swift, XML and Protobuf to the web/Move stack. Swarm itself adds Bazel and Nix.
These informed generic defaults; none of these project names is in the detector.

## Implementation and checks

[The source-language design](design/source-languages.md) connects the parser
selection to the existing editor and actual Bazel inputs.

`nix develop --command bazel test --jobs=3 //tools/demo-syntax:editor-tests`
runs both TypeScript boundaries, language-name and actual colored-token cases,
CodeMirror dependency identity, the real cursor command regression, and mounted
editor retention checks. Every new language sample verifies no extra keybindings
or completion source and a valid one-character cursor movement.

`SWARM_VIRTUAL_DISPLAY=:163 SWARM_VIRTUAL_DESKTOP_PORT=55403 nix develop
--command bazel run --jobs=3 //tools/demo-syntax:smoke` uses a disposable owned
desktop. It opens actual Git-tracked TS/JSON/Markdown/Bazel/Nix/Python through the
packaged file broker, checks computed colors, edits TS, switches among files,
returns with exact text/cursor/cameras, and performs one explicit disk save.
No model request is involved. The scratch repository has no configured services;
its other context widgets are not proof of a working deployment or Bazel build.

The package versions and the existing `@codemirror/state` override remain pinned.
After updating this PR, materialize with `nix develop --command pnpm install
--frozen-lockfile`. The actual dependency-resolution regression checks that the
language, command and view packages resolve the same state implementation.

Upstream references: [CodeMirror stream modes](https://github.com/codemirror/legacy-modes)
and [Replit's Nix parser](https://github.com/replit/codemirror-lang-nix).
