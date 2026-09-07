import { describe, expect, it } from "vitest";
import { EXAMPLE_BUILD_PROFILE, samplePoints, summarizeSamples } from "../app/renderer/build-resources/stats";

describe("build resource statistics", () => {
  it("does not convert missing or invalid observations into zero", () => {
    expect(summarizeSamples([])).toBeNull();
    expect(summarizeSamples([null, undefined, NaN, Infinity, -Infinity, -1])).toBeNull();
    expect(summarizeSamples([null, 0, undefined, 10, NaN, -1])).toEqual({ count: 2, mean: 5, median: 5, p95: 10, peak: 10 });
  });

  it("keeps measured zero and singleton/constant distributions finite", () => {
    expect(summarizeSamples([0])).toEqual({ count: 1, mean: 0, median: 0, p95: 0, peak: 0 });
    expect(summarizeSamples([7, 7, 7])).toEqual({ count: 3, mean: 7, median: 7, p95: 7, peak: 7 });
    expect(summarizeSamples([0, 0])).toEqual({ count: 2, mean: 0, median: 0, p95: 0, peak: 0 });
  });

  it("uses conventional median and nearest-rank p95 without mutating sample order", () => {
    const values = Object.freeze([20, 10, 30, 0]);
    expect(summarizeSamples(values)).toEqual({ count: 4, mean: 15, median: 15, p95: 30, peak: 30 });
    expect(values).toEqual([20, 10, 30, 0]);
    expect(summarizeSamples([8, 1, 3])?.median).toBe(3);
    expect(summarizeSamples(Array.from({ length: 100 }, (_, index) => index + 1))?.p95).toBe(95);
  });

  it("does not overflow middle averaging or the mean for a finite pair", () => {
    expect(summarizeSamples([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual({ count: 2,
      mean: Number.MAX_VALUE, median: Number.MAX_VALUE, p95: Number.MAX_VALUE, peak: Number.MAX_VALUE });
  });

  it("keeps the mean finite when rounding three extreme divided values would overflow", () => {
    expect(summarizeSamples([Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE])?.mean).toBe(Number.MAX_VALUE);
  });

  it("has declared synthetic CPU/core and memory/MiB series, not job-derived history", () => {
    expect(EXAMPLE_BUILD_PROFILE.target).toBe("//demo:build");
    expect(EXAMPLE_BUILD_PROFILE.cpuPercent).toHaveLength(12);
    expect(EXAMPLE_BUILD_PROFILE.memoryMiB).toHaveLength(12);
    expect(EXAMPLE_BUILD_PROFILE.windowSeconds / EXAMPLE_BUILD_PROFILE.intervalSeconds).toBe(12);
    expect(summarizeSamples(EXAMPLE_BUILD_PROFILE.cpuPercent)).toEqual({ count: 12, mean: 346.25, median: 335, p95: 720, peak: 720 });
    expect(summarizeSamples(EXAMPLE_BUILD_PROFILE.memoryMiB)?.median).toBe(1040);
  });

  it("draws finite zero-baseline points and refuses invalid series", () => {
    expect(samplePoints([])).toBe("");
    expect(samplePoints([0])).toBe("55,26");
    expect(samplePoints([0, 0])).toBe("0,26 110,26");
    expect(samplePoints([0, 20])).toBe("0,26 110,2");
    expect(samplePoints([NaN, 0])).toBe("");
    expect(samplePoints([-1])).toBe("");
  });
});
