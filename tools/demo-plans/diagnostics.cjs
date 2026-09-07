"use strict";

// Direct user delivery policy accepts this exact noncritical resize diagnostic.
// Preserve it in evidence; classification is not a historical-cause repair.
function classifyRendererDiagnostics(errors) {
  const acceptedResizeWarnings = [], blockingErrors = [];
  for (const error of errors) (error.message === "ResizeObserver loop completed with undelivered notifications."
    ? acceptedResizeWarnings : blockingErrors).push(error);
  return { acceptedResizeWarnings, blockingErrors };
}
module.exports = { classifyRendererDiagnostics };
