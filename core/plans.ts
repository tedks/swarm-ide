import { createHash } from "node:crypto";
import { PLAN_INDEX_PATH, PLAN_LIMITS, PLAN_READ_MESSAGES, PlanIndexSchema, type PlanReadResult } from "../protocol/plans";
import { readCanonicalWorkspaceBytes, WorkspaceFileError } from "./files";
import { componentPlanMissing } from "./plan-generation";

/** The registered workspace owns the fixed index path. Read one bounded regular
 * file; its raw-byte revision makes no freshness claim about referenced files. */
export async function readPlanIndex(root: string): Promise<PlanReadResult> {
  const unavailable = (code: keyof typeof PLAN_READ_MESSAGES): Extract<PlanReadResult, { status: "unavailable" }> => ({
    status: "unavailable", code, message: PLAN_READ_MESSAGES[code],
  });
  let bytes: Buffer;
  try {
    bytes = await readCanonicalWorkspaceBytes(root, PLAN_INDEX_PATH, PLAN_LIMITS.indexBytes);
  } catch (error) {
    if (await componentPlanMissing(root)) return { ...unavailable("PLAN_INDEX_UNAVAILABLE"), missing: true };
    return unavailable(error instanceof WorkspaceFileError && error.code === "FILE_TOO_LARGE"
      ? "PLAN_INDEX_LIMIT_EXCEEDED" : "PLAN_INDEX_UNAVAILABLE");
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const index = PlanIndexSchema.parse(JSON.parse(source));
    return { status: "observed", index, revision: createHash("sha256").update(bytes).digest("hex"), observedAt: new Date().toISOString() };
  } catch {
    // Never return parser output, author text, OS errors or private workspace paths.
    return unavailable("PLAN_INDEX_MALFORMED");
  }
}
