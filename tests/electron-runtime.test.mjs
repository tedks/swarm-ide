import { describe, expect, it } from "vitest";
import { resolveElectronRuntimeArguments } from "../tools/electron-runtime.mjs";

describe("Electron runtime arguments", () => {
  it("preserves the Chromium OS sandbox by default", () => {
    expect(resolveElectronRuntimeArguments({})).toEqual([]);
  });

  it("allows the explicit CI-only no-sandbox setting", () => {
    expect(resolveElectronRuntimeArguments({ SWARM_ELECTRON_NO_SANDBOX: "1" })).toEqual([
      "--no-sandbox",
    ]);
  });

  it.each(["", "0", "true", "yes", " 1", "1 "])("rejects ambiguous setting %j", (value) => {
    expect(() =>
      resolveElectronRuntimeArguments({ SWARM_ELECTRON_NO_SANDBOX: value }),
    ).toThrow("SWARM_ELECTRON_NO_SANDBOX must be exactly '1' when set");
  });
});
