import { describe, expect, it } from "vitest";
import { sourceFlash } from "../app/renderer/source-diff";

describe("source observatory diff", () => {
  it("locates inserted text for green emphasis", () => {
    expect(sourceFlash("alpha\nomega\n", "alpha\nnew\nomega\n", 1)).toEqual({ id: 1, from: 6, to: 10, removed: "" });
  });

  it("retains removed text at its former boundary for a red ghost", () => {
    expect(sourceFlash("alpha\nold\nomega\n", "alpha\nomega\n", 2)).toEqual({ id: 2, from: 6, to: 6, removed: "old\n" });
  });

  it("returns no decoration for an unchanged observation", () => {
    expect(sourceFlash("same", "same", 3)).toBeNull();
  });
});
