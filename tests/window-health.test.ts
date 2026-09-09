import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { watchWindowHealth } from "../app/electron/window-health";

describe("native window health", () => {
  it("records actual lifecycle transitions without reloading or leaking console payloads", () => {
    const window = new EventEmitter(), contents = new EventEmitter();
    const report = vi.fn();
    const stop = watchWindowHealth(window, contents, report);
    window.emit("unresponsive"); window.emit("responsive");
    contents.emit("render-process-gone", {}, { reason: "oom", exitCode: -1 });
    contents.emit("console-message", { message: "private contents" });
    contents.emit("console-message", { message: "[renderer-health] render-error" });
    contents.emit("did-fail-load", {}, -7, "private URL and description", "file:///private", true);
    contents.emit("did-fail-load", {}, -3, "aborted", "file:///private", false);
    expect(report.mock.calls).toEqual([["unresponsive"], ["responsive"], ["render-process-gone", { reason: "oom", exitCode: -1 }], ["render-error"], ["load-failed", { errorCode: -7 }]]);
    stop(); window.emit("unresponsive"); contents.emit("render-process-gone", {}, {});
    expect(report).toHaveBeenCalledTimes(5);
  });
});
