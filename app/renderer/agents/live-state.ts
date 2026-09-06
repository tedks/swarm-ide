import type { AgentSnapshot, PreparedAgentContext, Run, TranscriptRecord } from "../../../protocol/agents";
import type { FocusRef } from "../../../protocol/schema";

export interface LaunchForm {
  focus: FocusRef;
  task: string;
  model: string;
  prepared: PreparedAgentContext | null;
  confirmed: boolean;
  preparing: boolean;
}

export interface LocalOperation {
  requestId: string;
  runId: string;
  kind: "launch" | "steer" | "cancel";
  text: string | null;
  status: "pending" | "accepted" | "rejected" | "delivery-unknown";
  message: string;
  // Explicit permission to lose this local copy on document refresh, NOT a
  // delivery/cancellation receipt. Keep identity/status for no-replay guards.
  documentLossAcknowledged?: boolean;
}

export interface LiveAgentState {
  snapshot: AgentSnapshot | null;
  connected: boolean;
  notice: string;
  selectedRunId: string | null;
  paneOpen: boolean;
  height: number;
  draft: LaunchForm | null;
  run: Run | null;
  records: TranscriptRecord[];
  pageCursor: number;
  pageTruncated: boolean;
  reading: boolean;
  detailStale: boolean;
  following: boolean;
  instructions: Record<string, string>;
  operations: LocalOperation[];
}

export const emptyLiveAgentState = (): LiveAgentState => ({
  snapshot: null, connected: false, notice: "Connecting to local agent service…",
  selectedRunId: null, paneOpen: false, height: 290, draft: null, run: null,
  records: [], pageCursor: 0, pageTruncated: false, reading: false, detailStale: true, following: true,
  instructions: {}, operations: [],
});

export function recoverLiveAgentState(state: LiveAgentState): LiveAgentState {
  return { ...state, connected: false, detailStale: true, reading: false,
    draft: state.draft ? { ...state.draft, preparing: false, confirmed: false } : null,
    operations: state.operations.map((op) => op.status === "pending"
      ? { ...op, status: "delivery-unknown", message: "Renderer connection replaced before acknowledgement. Never resent automatically." } : op),
  };
}

export function displayAgentText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, (char) => char === "\n" || char === "\t" ? char : `\\u{${char.codePointAt(0)!.toString(16)}}`);
}

export const unresolvedOperation = (op: LocalOperation): boolean => op.status === "pending" || op.status === "delivery-unknown";

export function protectsAgentIntent(state: LiveAgentState): boolean {
  return state.draft !== null || Object.values(state.instructions).some((text) => text.length > 0) ||
    state.operations.some((op) => unresolvedOperation(op) && !op.documentLossAcknowledged);
}
