import { createRequire } from "node:module";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { classifyRendererDiagnostics } = require("../tools/demo-plans/diagnostics.cjs");

it("retains exactly the user-accepted resize warning and blocks every other diagnostic", () => {
  const accepted = { stage: "bounded-coverage", message: "ResizeObserver loop completed with undelivered notifications." };
  const others = [
    { stage: "navigation", message: "Minified React error #185" },
    { stage: "navigation", message: `${accepted.message} Additional failure` },
    { stage: "navigation", message: "ResizeObserver loop limit exceeded" },
    { stage: "navigation", message: "Uncaught TypeError" },
  ];
  const errors = [accepted, ...others];
  const result = classifyRendererDiagnostics(errors);
  expect(result.acceptedResizeWarnings).toEqual([accepted]);
  expect(result.blockingErrors).toEqual(others);
  expect(errors).toEqual([accepted, ...others]);
  expect(result.acceptedResizeWarnings[0]).toBe(accepted);
});
