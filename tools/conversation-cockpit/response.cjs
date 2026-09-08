/** TEST ONLY: retain the real read envelope, replace only its operation result. */
function controlledSendEnvelope(base, input, receiptId) {
  return { ...base, response: { ...base.response, external: { kind: "send", sessionId: input.sessionId,
    status: "delivery-unknown", receiptId, message: "Controlled test response; no queue invocation or agent message." } } };
}
module.exports = { controlledSendEnvelope };
