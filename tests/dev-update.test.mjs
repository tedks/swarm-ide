import { describe, it, expect } from "vitest";
import { classifyUpdate } from "../tools/dev-update.mjs";
const baseline = new Map([["app/electron/main.js", "shell"], ["app/electron/preload.js", "bridge"], ["core/worker.js", "core"]]);
describe("minimal executable invalidation", () => {
  it("ignores builds with identical executable output", () => expect(classifyUpdate(baseline, new Map(baseline))).toBe("unchanged"));
  it.each([
    ["core/worker.js", "core"], ["app/electron/preload.js", "preload"], ["app/electron/main.js", "restart-required"],
  ])("invalidates only %s", (path, action) => expect(classifyUpdate(baseline, new Map(baseline).set(path, "new"))).toBe(action));
  it("coalesces shared changes, with shell restart taking precedence", () => {
    const next = new Map(baseline).set("core/worker.js", "new").set("app/electron/preload.js", "new");
    expect(classifyUpdate(baseline, next)).toBe("core-preload");
    expect(classifyUpdate(baseline, next.set("app/electron/main.js", "new"))).toBe("restart-required");
  });
});
