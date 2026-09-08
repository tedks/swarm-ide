// These structural types mirror fraudcheck.proto for the deliberately tiny demo
// implementation. A language plugin can replace them with generated bindings.
type FraudAssessmentRequest = { orderId: string; accountId: string; amountMinor: number };
type FraudAssessmentDecision = { disposition: "allow" | "review" | "deny"; reason: string };

/** Local example of a risk decision; it does not call a payment service. */
export function assess(request: FraudAssessmentRequest): FraudAssessmentDecision {
  if (request.amountMinor >= 100_000) {
    return { disposition: "review", reason: "high-value order" };
  }
  return { disposition: "allow", reason: "within automatic review budget" };
}
