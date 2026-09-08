import { isRepositoryPath } from "../../protocol/repository";
import type { BuildTarget } from "../../protocol/build-graph";
import type { BuildLinkSnapshot } from "./repository/layers";

const MAX_CONTENT = 1024 * 1024;
const MAX_LINE = 8192;
const MAX_REFERENCE = 512;
const buildName = /(?:^|\/)BUILD(?:\.bazel)?$/;
const join = (directory: string, name: string) => directory ? `${directory}/${name}` : name;
const directory = (path: string) => path.split("/").slice(0, -1).join("/");

interface Token { start: number; end: number; value: string; string: boolean; simple?: boolean }

/** Only literal, single-line strings; never evaluate Starlark expressions. */
export function bazelStringAt(content: string, position: number): string | null {
  if (content.length > MAX_CONTENT || !Number.isInteger(position) || position < 0 || position >= content.length) return null;
  const lineStart = content.lastIndexOf("\n", position - 1) + 1;
  const nextLine = content.indexOf("\n", position);
  if ((nextLine < 0 ? content.length : nextLine) - lineStart > MAX_LINE) return null;

  let previous: Token | undefined, candidate: Token | undefined;
  const accept = (token?: Token) => candidate && !["+", "%", "*", "."].includes(token?.value ?? "") && !token?.string &&
    !(token && /[rRbBuUfF]/.test(token.value) && /["']/.test(content[token.end] ?? ""))
    ? candidate.value : null;
  // Scan the bounded prefix so quotes inside multiline strings or comments
  // cannot be mistaken for a file reference on the clicked line.
  for (let index = 0; index < content.length;) {
    const start = index, character = content[index]!;
    if (/\s/.test(character)) { index++; continue; }
    if (character === "#") {
      const end = content.indexOf("\n", index);
      index = end < 0 ? content.length : end + 1;
      continue;
    }
    let token: Token;
    if (character === "\"" || character === "'") {
      const triple = content.slice(index, index + 3) === character.repeat(3);
      const delimiter = triple ? character.repeat(3) : character;
      index += delimiter.length;
      const valueStart = index;
      let escaped = false, closed = false;
      while (index < content.length) {
        if (content[index] === "\\") { escaped = true; index += 2; continue; }
        if (!triple && (content[index] === "\n" || content[index] === "\r")) return null;
        if (content.slice(index, index + delimiter.length) === delimiter) { closed = true; break; }
        index++;
      }
      if (!closed) return null;
      const value = content.slice(valueStart, index);
      index += delimiter.length;
      token = { start, end: index, value, string: true, simple: !triple && !escaped && value.length > 0 && value.length <= MAX_REFERENCE };
    } else {
      index++;
      token = { start, end: index, value: character, string: false };
    }
    if (candidate) return accept(token);
    if (position >= token.start && position < token.end) {
      if (!token.string || !token.simple || position === token.start || position === token.end - 1 ||
          previous?.string || previous?.value === "+" || previous?.value === "%" ||
          previous?.end === token.start && /[\w]/.test(previous.value)) return null;
      candidate = token;
    }
    previous = token;
  }
  return accept();
}

function labelParts(label: string): { pkg: string; name: string } | null {
  if (label.length > MAX_REFERENCE || !label.startsWith("//") || /[\s\\\x00-\x1f\x7f]/.test(label)) return null;
  const split = label.slice(2).split(":");
  if (split.length !== 2 || !isRepositoryPath(split[0]!, true) || !isRepositoryPath(split[1]!)) return null;
  return { pkg: split[0]!, name: split[1]! };
}

function observedBuildFile(target: BuildTarget): string | undefined {
  const parts = labelParts(target.label);
  if (!parts || target.path === null) return undefined;
  if (target.kind === "rule" && target.path === parts.pkg &&
      (target.buildFile === join(parts.pkg, "BUILD") || target.buildFile === join(parts.pkg, "BUILD.bazel"))) return target.buildFile;
  if (target.kind === "source" && target.path === join(parts.pkg, parts.name) &&
      (parts.name === "BUILD" || parts.name === "BUILD.bazel")) return target.path;
  return undefined;
}

/** Resolve observed local target identities, not a guessed filesystem index.
 * The caller remains responsible for matching this snapshot to the selected
 * repository/worktree and sending the result through ordinary source opening.
 */
function observedPackages(targets: BuildTarget[]) {
  const packages = new Map<string, Set<string>>();
  for (const target of targets) {
    const path = observedBuildFile(target);
    if (!path) continue;
    const pkg = directory(path), files = packages.get(pkg) ?? new Set<string>();
    files.add(path); packages.set(pkg, files);
  }
  return packages;
}

export function resolveBazelReference(sourcePath: string, reference: string, capture: BuildLinkSnapshot | undefined): { path: string; target?: string } | null {
  if (!isRepositoryPath(sourcePath) || !(buildName.test(sourcePath) || sourcePath.endsWith(".bzl")) ||
      !reference || reference.length > MAX_REFERENCE || !capture?.targets || capture.targets.length > 2000) return null;
  const targets = capture.targets, packages = observedPackages(targets);
  let label = reference;
  if (!reference.startsWith("//")) {
    if (reference.startsWith("@") || reference.startsWith("/")) return null;
    // In a .bzl macro, a relative label may refer to the caller's package.
    // Source location alone cannot establish that package; require //pkg:name.
    if (!buildName.test(sourcePath)) return null;
    const pkg = directory(sourcePath);
    // A retained BUILD.bazel observation must not invent a BUILD declaration.
    const files = packages.get(pkg);
    if (!files || files.size !== 1 || !files.has(sourcePath)) return null;
    const name = reference.startsWith(":") ? reference.slice(1) : reference;
    label = `//${pkg}:${name}`;
  }
  return resolveObservedTarget(label, targets, packages);
}

/** Absolute authored links use the same observed-target checks as editor links,
 * without inventing an editor source path to establish a package. */
export function resolveBazelTarget(label: string, capture: BuildLinkSnapshot | undefined): { path: string; target?: string } | null {
  if (!capture?.targets || capture.targets.length > 2000) return null;
  return resolveObservedTarget(label, capture.targets, observedPackages(capture.targets));
}

function resolveObservedTarget(label: string, targets: BuildTarget[], packages: Map<string, Set<string>>): { path: string; target?: string } | null {
  const parts = labelParts(label);
  if (!parts) return null;
  const matches = targets.filter((target) => target.label === label);
  if (matches.length !== 1) return null;
  const target = matches[0]!;
  if ((packages.get(parts.pkg)?.size ?? 0) > 1) return null;
  if (target.kind === "rule") {
    const path = observedBuildFile(target);
    return path ? { path, target: label } : null;
  }
  if (target.kind !== "source" || target.path !== join(parts.pkg, parts.name) || !isRepositoryPath(target.path) ||
      target.buildFile !== undefined && !packages.get(parts.pkg)?.has(target.buildFile)) return null;
  // A source label cannot cross another observed package boundary.
  if ([...packages.keys()].some((pkg) => pkg !== parts.pkg && pkg.startsWith(parts.pkg ? `${parts.pkg}/` : "") && target.path!.startsWith(`${pkg}/`))) return null;
  return { path: target.path, target: label };
}
