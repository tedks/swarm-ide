"use strict";
const assert = require("node:assert/strict");

// Direct user delivery policy accepts this exact noncritical resize diagnostic.
// Preserve it in evidence; classification is not a historical-cause repair.
function classifyRendererDiagnostics(errors) {
  const acceptedResizeWarnings = [], blockingErrors = [];
  for (const error of errors) (error.message === "ResizeObserver loop completed with undelivered notifications."
    ? acceptedResizeWarnings : blockingErrors).push(error);
  return { acceptedResizeWarnings, blockingErrors };
}
function validatePlansProof(proof) {
  assert(proof && proof.ok === true && proof.realDitz === true && proof.packagedCore === true && proof.modelTurns === 0);
  assert(Array.isArray(proof.rendererErrors));
  assert(proof.rendererErrors.every((error) => error && typeof error.stage === "string" && typeof error.message === "string"));
  const diagnostics = classifyRendererDiagnostics(proof.rendererErrors);
  assert.equal(diagnostics.blockingErrors.length, 0);
  assert.deepEqual(proof.diagnostics, diagnostics, "Recorded classification must match preserved raw diagnostics");
  return diagnostics;
}
module.exports = { classifyRendererDiagnostics, validatePlansProof };
