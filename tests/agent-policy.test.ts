// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AgentCapabilitiesSchema } from "../protocol/agents";
import { READ_ONLY_ACCESS, unavailablePolicyCapabilities, validateCodexThreadPolicy } from "../core/agents/policy";

describe("agent policy evidence (no provider execution)", () => {
  it("defaults to typed unavailable, not policy verification inferred from help or schemas", () => {
    const capabilities = AgentCapabilitiesSchema.parse(unavailablePolicyCapabilities("0.153.4"));
    expect(capabilities).toMatchObject({ availability: "unavailable", policy: "unverified", reason: { code: "ADAPTER_POLICY_UNAVAILABLE" }, controls: { launch: false, steer: false, cancel: false } });
    expect(READ_ONLY_ACCESS).toMatchObject({ hostConfidentiality: false, sendsSelectedContentToProvider: true, toolNetwork: false });
  });

  it("accepts only necessary echoed fields without upgrading effective policy capabilities", () => {
    expect(validateCodexThreadPolicy({ cwd: "/workspace", sandbox: { type: "readOnly", networkAccess: false }, approvalPolicy: "never", model: "fixture" }, "/workspace")).toEqual({ ok: true, value: { cwd: "/workspace", policy: "read-only" } });
    expect(unavailablePolicyCapabilities().controls.launch).toBe(false);
  });

  it.each([
    { cwd: "/elsewhere" }, { cwd: "/workspace/" }, { approvalPolicy: "on-request" },
    { sandbox: { type: "readOnly" } }, { sandbox: { type: "readOnly", networkAccess: true } },
    { sandbox: { type: "readOnly", networkAccess: false, writableRoots: ["/workspace"] } },
    { sandbox: { type: "workspaceWrite", networkAccess: false } }, { sandbox: null },
  ])("rejects missing/unknown/mismatched authority evidence: %j", (delta) => {
    expect(validateCodexThreadPolicy({ cwd: "/workspace", approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false }, ...delta }, "/workspace")).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
  });

  it("rejects noncanonical core cwd and absent/nonobject provider evidence", () => {
    for (const cwd of ["relative", "/workspace/", "/workspace/../private"]) {
      expect(validateCodexThreadPolicy({ cwd, approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false } }, cwd).ok).toBe(false);
    }
    for (const response of [null, "invalid", {}, { cwd: "/workspace", sandbox: { type: "readOnly", networkAccess: false } }]) {
      expect(validateCodexThreadPolicy(response, "/workspace")).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    }
  });
});
