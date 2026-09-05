// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BoundedRequestIds } from "../core/request-ids";

describe("bounded request id replay protection", () => {
  it("rejects duplicate pending or completed ids while bounding retained history", () => {
    const ids = new BoundedRequestIds(2);
    expect(ids.accept("request:a")).toBe(true);
    expect(ids.accept("request:a")).toBe(false);
    expect(ids.accept("request:b")).toBe(true);
    expect(ids.accept("request:b")).toBe(false);
    expect(ids.accept("request:c")).toBe(true);
    expect(ids.accept("request:a")).toBe(true);
  });

  it("rejects invalid limits", () => {
    expect(() => new BoundedRequestIds(0)).toThrow("positive integer");
  });
});
