// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production truth and privilege boundaries", () => {
  it("boots the real provider and keeps deterministic fixtures out of the worker", async () => {
    const worker = await readFile("core/worker.ts", "utf8");
    expect(worker).toContain('import { RealWorkspaceProvider } from "./provider"');
    expect(worker).not.toMatch(/from ["'][^"']*fixtures/);
  });

  it("keeps Node and filesystem authority out of the sandboxed renderer", async () => {
    const [application, editor, electron] = await Promise.all([
      readFile("app/renderer/App.tsx", "utf8"),
      readFile("app/renderer/EditorPane.tsx", "utf8"),
      readFile("app/electron/main.ts", "utf8"),
    ]);
    expect(`${application}\n${editor}`).not.toMatch(/from ["']node:|require\s*\(/);
    expect(electron).toContain("sandbox: true");
    expect(electron).toContain("nodeIntegration: false");
  });
});
