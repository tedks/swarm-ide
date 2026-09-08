import type { ContextSubject } from "../../../protocol/context";
import type { ContextFile } from "./compose";

export interface LatencyProfile {
  association: string; scope: string; window: string; samples: number;
  rows: Array<{ operation: string; mean: number; median: number; p90: number; p99: number }>;
}

/** Explicitly opted-in synthetic values, never measurements or inferred calls. */
export function illustrativeLatency(subject: ContextSubject, file: ContextFile | undefined, _targets: readonly string[]): LatencyProfile | undefined {
  if (subject.kind !== "file") return undefined;
  const tagged = file && /^\s*(?:\/\/|#)\s*@swarm-demo-latency operations\s*$/m.test(file.savedContent);
  if (!tagged) return undefined;
  return {
    association: "Saved-source illustrative tag · operations",
    scope: "Synthetic operation timings · not measured functions or calls",
    window: "Illustrative 15-minute load window", samples: 12000,
    rows: [
      { operation: "Operation A", mean: 8.4, median: 6.2, p90: 14.8, p99: 31.6 },
      { operation: "Operation B", mean: 2.1, median: 1.4, p90: 4.0, p99: 8.7 },
      { operation: "Operation C", mean: 4.7, median: 3.2, p90: 9.1, p99: 22.4 },
    ],
  };
}
