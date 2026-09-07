import type { ContextSubject } from "../../../protocol/context";
import type { ContextFile } from "./compose";

export interface LatencyProfile {
  association: string; scope: string; window: string; samples: number;
  rows: Array<{ operation: string; mean: number; median: number; p90: number; p99: number }>;
}

/** Authored demo profiles, never measurements or inferred cursor functions. */
export function illustrativeLatency(subject: ContextSubject, file: ContextFile | undefined, targets: readonly string[]): LatencyProfile | undefined {
  if (subject.kind !== "file") return undefined;
  const target = "//examples/checkout-world/services/fraudcheck:fraudcheck_sources";
  const tagged = file && /^\s*(?:\/\/|#)\s*@swarm-demo-latency checkout\.assess\s*$/m.test(file.savedContent);
  const example = subject.path === "examples/checkout-world/services/fraudcheck/fraudcheck.ts" && targets.includes(target);
  if (!tagged && !example) return undefined;
  return {
    association: tagged ? "Saved-source demo tag · checkout.assess" : `Authored target profile · ${target}`,
    scope: "Checkout assessment · named example operations, not cursor matching",
    window: "Illustrative 15-minute load window", samples: 12000,
    rows: [
      { operation: "Assess request", mean: 8.4, median: 6.2, p90: 14.8, p99: 31.6 },
      { operation: "Evaluate rules", mean: 2.1, median: 1.4, p90: 4.0, p99: 8.7 },
      { operation: "Risk lookup", mean: 4.7, median: 3.2, p90: 9.1, p99: 22.4 },
    ],
  };
}
