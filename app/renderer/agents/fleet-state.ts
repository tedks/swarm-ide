import type { TrustedSnapshot, TrustedRunSummary } from "../../../protocol/trusted-local";

/** Presentation uses the ROOT-cleared shared contract; values are already validated. */
export type FleetSnapshot = TrustedSnapshot;
export interface FleetComposer { text: string; revision: number }
export interface FleetState {
  selected: string | null;
  summaries: TrustedRunSummary[];
  catalogSequence: number;
  details: Readonly<Record<string, { snapshot: FleetSnapshot; sequence: number }>>;
  composers: Readonly<Record<string, FleetComposer>>;
}
export const emptyFleet = (): FleetState => ({ selected: null, summaries: [], catalogSequence: -1, details: {}, composers: {} });
export const emptyComposer: FleetComposer = { text: "", revision: 0 };

export function observeFleet(state: FleetState, snapshot: FleetSnapshot, sequence: number): FleetState {
  let next = state;
  if (sequence >= state.catalogSequence) {
    const summaries = snapshot.runs ?? (snapshot.runToken ? [{ runToken: snapshot.runToken,
      title: "Codex conversation", createdAt: "", updatedAt: "", status: snapshot.status,
      archived: snapshot.archived ?? false, approvalCount: snapshot.approvals.length,
      taskReference: snapshot.taskReference ?? null, message: snapshot.message }] : state.summaries);
    next = { ...next, catalogSequence: sequence, summaries };
  }
  const token = snapshot.runToken;
  if (token && sequence >= (state.details[token]?.sequence ?? -1)) {
    next = { ...next, details: { ...next.details, [token]: { snapshot, sequence } } };
  }
  // Selection is deliberately NOT changed by observation or a command reply.
  return next;
}

export function selectFleetRun(state: FleetState, token: string): FleetState {
  return { ...state, selected: token };
}
export function editFleetComposer(state: FleetState, token: string, text: string): FleetState {
  const previous = state.composers[token] ?? emptyComposer;
  return { ...state, composers: { ...state.composers, [token]: { text, revision: previous.revision + 1 } } };
}
export function acknowledgeFleetComposer(state: FleetState, token: string, revision: number): FleetState {
  return state.composers[token]?.revision === revision ? editFleetComposer(state, token, "") : state;
}
export function resetFleetAuthority(state: FleetState): FleetState {
  return { ...emptyFleet(), selected: state.selected, composers: state.composers };
}
