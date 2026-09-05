import { describe, expect, it } from "vitest";
import { transformContentSecurityPolicy } from "../vite.config.mts";

const template = "connect-src 'self' __SWARM_DEV_WEBSOCKET_ORIGIN__;";

describe("renderer content security policy", () => {
  it("uses the resolved development server endpoint", () => {
    expect(
      transformContentSecurityPolicy(template, "serve", { host: "127.0.0.1", port: 55173 }),
    ).toBe("connect-src 'self' ws://127.0.0.1:55173;");
  });

  it("keeps production port-independent", () => {
    expect(transformContentSecurityPolicy(template, "build", {})).toBe("connect-src 'self' ;");
  });

  it.each([
    { host: undefined, port: 55173 },
    { host: true, port: 55173 },
    { host: "127.0.0.1", port: undefined },
  ])("rejects an unresolved development endpoint: %j", (server) => {
    expect(() => transformContentSecurityPolicy(template, "serve", server)).toThrow(
      "development CSP requires a concrete Vite server host and port",
    );
  });

  it("rejects an HTML document without the required placeholder", () => {
    expect(() => transformContentSecurityPolicy("connect-src 'self';", "build", {})).toThrow(
      "index.html is missing the development WebSocket CSP placeholder",
    );
  });
});
