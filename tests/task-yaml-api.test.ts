// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseAllDocuments, parseDocument, isAlias, isMap, isScalar, isSeq, visit } from "yaml";
import { version } from "yaml/package.json";

/** T0 checks exact dependency capabilities, not T1's still-unimplemented safe
 * metadata reader. A parsed document alone is deliberately NOT accepted data. */
describe("pinned task parser document API", () => {
  it("pins the exact materialized version and exposes node inspection before conversion", () => {
    expect(version).toBe("2.8.1");
    const doc = parseDocument("id: task-1\nstatus: unstarted\nfile_refs:\n  - path: docs/design.md\n    line: 2\n", { uniqueKeys: true, prettyErrors: false });
    expect(doc.errors).toEqual([]); expect(doc.warnings).toEqual([]);
    expect(isMap(doc.contents)).toBe(true);
    const kinds = new Set<string>();
    visit(doc, (_key, node) => {
      if (isMap(node)) kinds.add("map");
      if (isSeq(node)) kinds.add("seq");
      if (isScalar(node)) kinds.add("scalar");
    });
    expect([...kinds].sort()).toEqual(["map", "scalar", "seq"]);
    expect(doc.toJS({ mapAsMap: true, maxAliasCount: 0 })).toBeInstanceOf(Map);
  });
  it("reports duplicate keys and multiple documents without needing unsafe conversion", () => {
    const doc = parseDocument("id: one\nid: two\n", { uniqueKeys: true, prettyErrors: false });
    expect(doc.errors.some((error) => error.code === "DUPLICATE_KEY")).toBe(true);
    expect(parseAllDocuments("id: one\n---\nid: two\n")).toHaveLength(2);
  });
  it("exposes aliases, tags and non-string keys for T1 to reject explicitly", () => {
    const doc = parseDocument("source: &a value\nalias: *a\ntag: !!str value\n1: numeric-key\n", { prettyErrors: false });
    let aliases = 0; let tags = 0; let numericKeys = 0;
    visit(doc, (key, node) => {
      if (isAlias(node)) aliases++;
      if (isScalar(node) && node.tag) tags++;
      if (key === "key" && isScalar(node) && typeof node.value !== "string") numericKeys++;
    });
    expect({ aliases, tags, numericKeys }).toEqual({ aliases: 1, tags: 1, numericKeys: 1 });
    expect(() => doc.toJS({ maxAliasCount: 0 })).toThrow();
  });
});
