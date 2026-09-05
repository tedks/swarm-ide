import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEV_PORT,
  parseDevPort,
  resolveDevEndpoint,
} from "../tools/dev-port.mjs";

describe("development port", () => {
  it("defaults to 5173 only when the setting is absent", () => {
    expect(parseDevPort(undefined)).toBe(DEFAULT_DEV_PORT);
    expect(resolveDevEndpoint({}).rendererUrl).toBe("http://127.0.0.1:5173");
  });

  it.each([
    ["1", 1],
    ["5173", 5173],
    ["55173", 55173],
    ["65535", 65535],
  ])("accepts decimal port %s", (rawPort, expected) => {
    expect(parseDevPort(rawPort)).toBe(expected);
  });

  it.each(["", " 55173", "55173 ", "+55173", "1e3", "12.5", "-1", "0", "65536", "nope"])(
    "rejects malformed or out-of-range value %j",
    (rawPort) => {
      expect(() => parseDevPort(rawPort)).toThrow(
        "SWARM_DEV_PORT must be a decimal integer between 1 and 65535",
      );
    },
  );

  it("derives the renderer and HMR origins from the same port", () => {
    expect(resolveDevEndpoint({ SWARM_DEV_PORT: "55173" })).toEqual({
      host: "127.0.0.1",
      port: 55173,
      rendererUrl: "http://127.0.0.1:55173",
      webSocketOrigin: "ws://127.0.0.1:55173",
    });
  });
});
