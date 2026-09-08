// Local illustration of payments.proto, not a payment gateway or network client.
type PaymentAuthorizationRequest = { orderId: string; amountMinor: number };
type PaymentAuthorizationDecision = { authorized: boolean; authorizationId: string };

/** Produces a deterministic sample result without moving money or calling a service. */
export function authorize(request: PaymentAuthorizationRequest): PaymentAuthorizationDecision {
  const authorized = request.orderId.length > 0 && Number.isSafeInteger(request.amountMinor) && request.amountMinor > 0;
  return { authorized, authorizationId: authorized ? `example-${request.orderId}` : "" };
}
