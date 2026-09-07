export interface ResourceSummary {
  count: number;
  mean: number;
  median: number;
  p95: number;
  peak: number;
}

/** Missing/invalid is not zero. Median averages middle values; p95 is nearest rank. */
export function summarizeSamples(samples: readonly (number | null | undefined)[]): ResourceSummary | null {
  const sorted = samples.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const count = sorted.length;
  if (!count) return null;
  const middle = Math.floor(count / 2);
  return {
    count,
    mean: sorted.reduce((mean, value, index) => mean + (value - mean) / (index + 1), 0),
    median: count % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2,
    p95: sorted[Math.ceil(count * 0.95) - 1],
    peak: sorted[count - 1],
  };
}

/** Fixed, authored demo; never populated from a selected job or this machine. */
export const EXAMPLE_BUILD_PROFILE = {
  target: "//demo:build",
  windowSeconds: 60,
  intervalSeconds: 5,
  cpuPercent: [0, 95, 240, 380, 520, 680, 720, 615, 450, 290, 130, 35],
  memoryMiB: [180, 340, 620, 960, 1320, 1690, 1840, 1780, 1500, 1120, 700, 260],
} as const;

/** The ordered, finite example series only. Zero baseline; no interpolated data. */
export function samplePoints(samples: readonly number[]): string {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) return "";
  const peak = Math.max(1, ...samples);
  return samples.map((value, index) => `${samples.length === 1 ? 55 : index * 110 / (samples.length - 1)},${26 - value / peak * 24}`).join(" ");
}
