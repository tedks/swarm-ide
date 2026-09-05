export interface FraudAssessmentRequest {
  orderId: string;
  accountId: string;
  amountMinor: number;
}

export interface FraudAssessmentDecision {
  disposition: "allow" | "review" | "deny";
  reason: string;
}

export interface PaymentAuthorizationRequest {
  orderId: string;
  amountMinor: number;
}

export interface PaymentAuthorizationDecision {
  authorized: boolean;
  authorizationId?: string;
}
