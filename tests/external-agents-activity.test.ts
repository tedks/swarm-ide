import { describe, expect, it } from "vitest";
import { extractEntries } from "../core/external-agents-activity";
import { ExternalEntrySchema } from "../protocol/external-agents";

const at = "2026-09-08T03:45:00Z";
const call = (name: string, args: unknown) => ({ timestamp: at, type: "response_item", payload: { type: "function_call", name, call_id: "call-1", arguments: JSON.stringify(args) } });
const custom = (name: string, input: string) => ({ timestamp: at, type: "response_item", payload: { type: "custom_tool_call", name, call_id: "custom-1", input } });
const patch = "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n*** Add File: src/b.ts\n+second\n*** End Patch";

describe("recorded external activity literals", () => {
  it("exposes real command and workdir with no path attribution from a shell string", () => {
    const [entry] = extractEntries(call("functions.exec_command", { cmd: "git show abc -- src/a.ts", workdir: "/repo/worker" }), "row:4");
    expect(entry).toMatchObject({ id: "row:4", at, kind: "tool-call", text: "Ran git show abc -- src/a.ts", command: "git show abc -- src/a.ts", cwd: "/repo/worker", callId: "call-1" });
    expect(entry).not.toHaveProperty("path");
    expect(ExternalEntrySchema.parse(entry)).toEqual(entry);
  });

  it("splits patch requests into exact file hunks with deterministic unique IDs", () => {
    const entries = extractEntries(custom("functions.apply_patch", patch), "row:5");
    expect(entries.map((entry) => [entry.id, entry.path, entry.text])).toEqual([
      ["row:5:file:0", "src/a.ts", "Edited src/a.ts"], ["row:5:file:1", "src/b.ts", "Edited src/b.ts"],
    ]);
    expect(entries[0]?.patch).toContain("-old\n+new");
    expect(entries[0]?.patch).not.toContain("src/b.ts");
    expect(entries[1]?.patch).not.toContain("-old");
    expect(entries.every((entry) => entry.kind === "tool-call" && entry.attribution === "recorded-tool-event")).toBe(true);
  });

  it("reads literal commands and patches from the actual functions.exec wrapper without evaluating it", () => {
    const source = `text(await tools.exec_command({cmd: "git status", workdir: "/repo/one", yield_time_ms: 1000}));\ntext(await tools.apply_patch(${JSON.stringify(patch)}));`;
    const entries = extractEntries(custom("functions.exec", source), "row:6");
    expect(entries.map((entry) => entry.command ?? entry.path)).toEqual(["git status", "src/a.ts", "src/b.ts"]);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
    expect(entries.every((entry) => ExternalEntrySchema.safeParse(entry).success)).toBe(true);
    const repeated = extractEntries(custom("functions.exec", `await tools.apply_patch(${JSON.stringify(patch)}); await tools.apply_patch(${JSON.stringify(patch)});`), "x".repeat(100));
    expect(new Set(repeated.map((entry) => entry.id)).size).toBe(4);
  });

  it("accepts whitespace/comments around supported top-level statements but ignores commented examples", () => {
    const example = 'tools.exec_command({cmd: "example"})';
    const source = `// ${example}\n/* ${example} */\nawait /* comment */ tools . exec_command ( {cmd: "real"} );\n// end`;
    expect(extractEntries(custom("functions.exec", source), "row").map((entry) => entry.command)).toEqual(["real"]);
  });

  it("keeps the whole wrapper generic for unexecuted branches/functions or mixed supported and unsupported syntax", () => {
    const real = 'await tools.exec_command({cmd: "real"});';
    const cases = [
      'if (false) { await tools.exec_command({cmd: "never"}); }',
      `async function notCalled() { await tools.apply_patch(${JSON.stringify(patch)}); }`,
      `${real} if (false) { await tools.apply_patch(${JSON.stringify(patch)}); }`,
      `${real} const later = 1;`,
      `const before = 1; ${real}`,
      `${real} throw new Error("stop");`,
      `${JSON.stringify(real)};`,
      '`await tools.exec_command({cmd: "template"});`;',
      '/tools.exec_command({cmd: "regex"})/;',
      'tools.exec_command({cmd: "not-awaited"});',
      `${real} /* unfinished`,
      `${real}${" ".repeat(262144)} const hidden = 1;`,
    ];
    for (const source of cases) {
      const entries = extractEntries(custom("functions.exec", source), "row");
      expect(entries, source.slice(0, 120)).toHaveLength(1);
      expect(entries[0]).toMatchObject({ tool: "functions.exec", text: "Ran functions.exec" });
      expect(entries[0]).not.toHaveProperty("command");
      expect(entries[0]).not.toHaveProperty("path");
      expect(entries[0]).not.toHaveProperty("patch");
    }
  });

  it("omits dynamic expressions, variable patches, spread arguments and object-member lookalikes", () => {
    const source = 'tools.exec_command({cmd: steal()}); tools.apply_patch(patch); tools.exec_command({cmd: "prefix" + secret}); tools.exec_command({...config}); example.tools.exec_command({cmd: "not-global"});';
    expect(extractEntries(custom("functions.exec", source), "row")).toEqual([
      expect.objectContaining({ text: "Ran functions.exec", tool: "functions.exec" }),
    ]);
  });

  it("omits user/reasoning/raw-output content and never extracts file associations from assistant prose", () => {
    const message = (role: string, phase?: string) => ({ type: "response_item", payload: { type: "message", role, phase, content: [{ type: "output_text", text: "Edited /secret/file" }] } });
    expect(extractEntries(message("user"), "row")).toEqual([]);
    expect(extractEntries(message("assistant", "analysis"), "row")).toEqual([]);
    expect(extractEntries(message("assistant"), "row")[0]).not.toHaveProperty("path");
    const output = extractEntries({ type: "response_item", payload: { type: "function_call_output", output: "PRIVATE_OUTPUT" } }, "row");
    expect(JSON.stringify(output)).not.toContain("PRIVATE_OUTPUT");
    expect(output[0]?.kind).toBe("tool-result");
  });

  it("bounds display payloads while refusing to truncate navigation identities", () => {
    const entries = extractEntries(call("exec_command", { cmd: "x".repeat(6000), workdir: "x".repeat(5000) }), "row");
    expect(entries[0]?.command?.length).toBeLessThanOrEqual(4096);
    expect(entries[0]?.text.length).toBeLessThanOrEqual(4096);
    expect(entries[0]?.command).toContain("[truncated]");
    expect(entries[0]).not.toHaveProperty("cwd");
    const [entry] = extractEntries(custom("apply_patch", `*** Begin Patch\n*** Add File: a.ts\n+${"x".repeat(20000)}\n*** End Patch`), "row");
    expect(entry?.patch?.length).toBeLessThanOrEqual(16384);
    expect(entry?.patch).toContain("[truncated]");
    expect(extractEntries(custom("apply_patch", `*** Begin Patch\n*** Add File: ${"x".repeat(5000)}\n+x\n*** End Patch`), "row")[0]).not.toHaveProperty("path");
  });

  it("handles malformed records/arguments without leaking them or throwing", () => {
    for (const input of [null, 4, [], {}, { payload: null }]) expect(extractEntries(input, "row")).toEqual([]);
    const malformed = { type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: "PRIVATE_MALFORMED" } };
    expect(extractEntries(malformed, "row")[0]?.text).toBe("Ran exec_command");
    expect(JSON.stringify(extractEntries(malformed, "row"))).not.toContain("PRIVATE");
  });
});
