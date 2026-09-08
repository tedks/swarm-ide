import { describe, expect, it } from "vitest";
import { bazelStringAt, resolveBazelReference } from "../app/renderer/bazel-reference";
import type { BuildTarget } from "../protocol/build-graph";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";

const rule = (label: string, buildFile: string): BuildTarget => ({ label, kind: "rule", path: label.slice(2).split(":")[0]!, buildFile });
const source = (label: string, path: string): BuildTarget => ({ label, kind: "source", path });
const capture = (...targets: BuildTarget[]): BuildLinkSnapshot => ({ repositoryId: "repo", revision: "observed", capturedAt: "2026-09-08T02:00:00.000Z", command: "bazel query //...:*", links: [], targets });
const sample = () => capture(
  rule("//:root", "BUILD.bazel"), rule("//pkg:library", "pkg/BUILD"), rule("//other:lib", "other/BUILD.bazel"),
  source("//pkg:source.ts", "pkg/source.ts"), source("//pkg:defs/helpers.bzl", "pkg/defs/helpers.bzl"),
  source("//:README.md", "README.md"), source("//other:plain", "other/plain"),
);

describe("literal Bazel strings under a deliberate pointer", () => {
  it.each(["\"//pkg:library\"", "'//pkg:library'"])("reads an unescaped single-line %s", (literal) => {
    const text = `deps = [${literal}], # comment`;
    expect(bazelStringAt(text, text.indexOf("pkg"))).toBe("//pkg:library");
    expect(bazelStringAt(text, text.indexOf(literal))).toBeNull();
  });
  it.each([
    '# deps = ["//pkg:library"]', 'x = """\n //pkg:library\n "quoted"\n"""',
    'x = "//pkg:lib\\rary"', 'x = r"//pkg:library"', 'x = "//pkg:" + "library"',
    'x = "prefix" + "//pkg:library"', 'x = "//pkg:library" "second"',
    'x = "//pkg:library" # joining later\n + "second"', 'x = "//pkg:library" % values',
    'x = "//pkg:library" r"suffix"', 'x = "//pkg:library" * 2', 'x = "//pkg:library".format()',
    'x = "//pkg:library', 'x = "//pkg:\nlibrary"',
  ])("does not infer computed, commented, escaped or multiline references: %s", (text) => {
    expect(bazelStringAt(text, text.indexOf("pkg"))).toBeNull();
  });
  it("tracks multiline-string boundaries before the selected line", () => {
    const text = 'doc = """\n # "//wrong:file"\n"""\ndeps = ["//pkg:library"]';
    expect(bazelStringAt(text, text.indexOf("wrong"))).toBeNull();
    expect(bazelStringAt(text, text.indexOf("pkg"))).toBe("//pkg:library");
  });
  it("bounds content, line length and offsets", () => {
    for (const offset of [-1, 0.5, NaN, Infinity, 999]) expect(bazelStringAt('"file"', offset)).toBeNull();
    expect(bazelStringAt('"file"' + " ".repeat(8192), 2)).toBeNull();
    expect(bazelStringAt('"file"\n' + "\n".repeat(1024 * 1024), 2)).toBeNull();
    expect(bazelStringAt(`"${"x".repeat(513)}"`, 2)).toBeNull();
  });
});

describe("observed Bazel reference resolution", () => {
  it("opens exact observed BUILD versus BUILD.bazel and source declarations", () => {
    expect(resolveBazelReference("pkg/BUILD", "//other:lib", sample())).toEqual({ path: "other/BUILD.bazel", target: "//other:lib" });
    expect(resolveBazelReference("pkg/BUILD", ":library", sample())).toEqual({ path: "pkg/BUILD", target: "//pkg:library" });
    expect(resolveBazelReference("pkg/BUILD", "source.ts", sample())).toEqual({ path: "pkg/source.ts", target: "//pkg:source.ts" });
    expect(resolveBazelReference("BUILD.bazel", ":README.md", sample())).toEqual({ path: "README.md", target: "//:README.md" });
    expect(resolveBazelReference("pkg/BUILD", "//other:plain", sample())).toEqual({ path: "other/plain", target: "//other:plain" });
    expect(resolveBazelReference("pkg/BUILD", "//other:plain", capture(source("//other:plain", "other/plain")))).toEqual({ path: "other/plain", target: "//other:plain" });
  });
  it("does not guess the caller package for relative .bzl macro labels", () => {
    expect(resolveBazelReference("pkg/defs/helpers.bzl", ":library", sample())).toBeNull();
    expect(resolveBazelReference("pkg/defs/helpers.bzl", "source.ts", sample())).toBeNull();
    expect(resolveBazelReference("pkg/defs/helpers.bzl", "//pkg:library", sample())).toEqual({ path: "pkg/BUILD", target: "//pkg:library" });
    const nested = sample(); nested.targets!.push(rule("//pkg/defs:nested", "pkg/defs/BUILD.bazel"));
    expect(resolveBazelReference("pkg/defs/helpers.bzl", ":nested", nested)).toBeNull();
    expect(resolveBazelReference("pkg/defs/helpers.bzl", ":library", nested)).toBeNull();
    expect(resolveBazelReference("pkg/defs/helpers.bzl", "//pkg/defs:nested", nested)).toEqual({ path: "pkg/defs/BUILD.bazel", target: "//pkg/defs:nested" });
    expect(resolveBazelReference("pkg/BUILD", "defs/helpers.bzl", nested)).toBeNull();
  });
  it.each(["@external//pkg:library", "@@canonical//pkg:library", "//pkg", "//pkg:", "//pkg:../secret", "../secret", "/etc/passwd", "//pkg:.git/config", "//pkg//nested:file", "//pkg:source.ts:line", "//pkg:source.ts\u0000", "//pkg:source.ts ", "file://etc/passwd", "//pkg:..\\secret"])("declines external, unsafe or unsupported reference %s", (reference) => {
    expect(resolveBazelReference("pkg/BUILD", reference, sample())).toBeNull();
  });
  it("does not resolve without targets, known declarations, or a Bazel source context", () => {
    expect(resolveBazelReference("pkg/BUILD", ":library", undefined)).toBeNull();
    expect(resolveBazelReference("pkg/BUILD", ":library", { ...sample(), targets: undefined })).toBeNull();
    expect(resolveBazelReference("pkg/BUILD", ":missing", sample())).toBeNull();
    expect(resolveBazelReference("pkg/source.ts", "//pkg:library", sample())).toBeNull();
    expect(resolveBazelReference("../pkg/BUILD", "//pkg:library", sample())).toBeNull();
    expect(resolveBazelReference("pkg/BUILD.bazel", ":library", sample())).toBeNull();
  });
  it("declines generated/unresolved targets and fabricated rule or source locations", () => {
    for (const target of [
      { label: "//pkg:x", kind: "generated", path: "pkg/x" },
      { label: "//pkg:x", kind: "unresolved", path: null },
      { label: "//pkg:x", kind: "rule", path: "pkg" },
      { label: "//pkg:x", kind: "rule", path: "wrong", buildFile: "pkg/BUILD" },
      { label: "//pkg:x", kind: "rule", path: "pkg", buildFile: "other/BUILD" },
      { label: "//pkg:x", kind: "source", path: "other/x" },
      { label: "//pkg:x", kind: "source", path: "pkg/x", buildFile: "other/BUILD" },
    ] as BuildTarget[]) {
      const observed = sample(); observed.targets!.push(target);
      expect(resolveBazelReference("pkg/BUILD", ":x", observed)).toBeNull();
    }
  });
  it("declines duplicate identities and ambiguous BUILD declarations", () => {
    const duplicate = sample(); duplicate.targets!.push(rule("//pkg:library", "pkg/BUILD"));
    expect(resolveBazelReference("pkg/BUILD", ":library", duplicate)).toBeNull();
    const ambiguous = sample(); ambiguous.targets!.push(rule("//pkg:second", "pkg/BUILD.bazel"));
    expect(resolveBazelReference("pkg/BUILD", ":library", ambiguous)).toBeNull();
    expect(resolveBazelReference("pkg/defs/helpers.bzl", ":source.ts", ambiguous)).toBeNull();
    expect(resolveBazelReference("other/BUILD.bazel", "//pkg:library", ambiguous)).toBeNull();
  });
  it("bounds the snapshot and never falls back to link path heuristics", () => {
    const observed = sample(); observed.targets = Array.from({ length: 2001 }, (_, index) => rule(`//pkg:r${index}`, "pkg/BUILD"));
    expect(resolveBazelReference("pkg/BUILD", ":r0", observed)).toBeNull();
    expect(resolveBazelReference("pkg/BUILD", "source.ts", { ...sample(), targets: [], links: [{ from: "//pkg:library", to: "//pkg:source.ts", fromPath: "pkg", toPath: "pkg/source.ts" }] })).toBeNull();
  });
});
