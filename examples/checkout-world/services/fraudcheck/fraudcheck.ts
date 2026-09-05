import type {
  FraudAssessmentDecision,
  FraudAssessmentRequest,
} from "./contract";

/** The first real service used to prove Swarm IDE's build-derived topology. */
export function assess(request: FraudAssessmentRequest): FraudAssessmentDecision {
  if (request.amountMinor >= 100_000) {
    return { disposition: "review", reason: "high-value order" };
  }
  return { disposition: "allow", reason: "within automatic review budget" };
}
