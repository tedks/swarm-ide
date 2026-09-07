import type { ContextSubject } from "../../../protocol/context";
import type { FocusRef } from "../../../protocol/schema";
import { isRepositoryPath } from "../../../protocol/repository";

export interface ContextAttention { subject: ContextSubject | null; generation: number; realm: string }
export type AttentionEvent = { type: "inspect"; subject: ContextSubject | null } | { type: "realm"; realm: string };
export const emptyContextAttention: ContextAttention = { subject: null, generation: 0, realm: "" };
export function reduceContextAttention(state: ContextAttention, event: AttentionEvent): ContextAttention {
  if (event.type === "realm") return event.realm === state.realm ? state : { subject: null, generation: state.generation + 1, realm: event.realm };
  return { ...state, subject: event.subject, generation: state.generation + 1 };
}
export interface ContextActivation { realm: string; generation: number; intent: number; path: string }
export function permitsContextActivation(state: ContextAttention, token: ContextActivation, intent: number, realm: string, path: string): boolean {
  return state.realm === realm && token.realm === realm && state.generation === token.generation && token.intent === intent && token.path === path && isRepositoryPath(path);
}
export function subjectFromFocus(repositoryId: string, worldId: string, focus: FocusRef): ContextSubject | null {
  if (focus.worldId !== worldId) return null;
  const identity = { repositoryId, worldId };
  if (focus.domain === "repo") {
    const path = focus.path ?? (focus.key === "dir:" ? "" : null);
    if (path === null) return null;
    if (focus.key === `dir:${path}` && isRepositoryPath(path, true)) return { ...identity, kind: "directory", path };
    if (focus.key === `file:${path}` && isRepositoryPath(path)) return { ...identity, kind: "file", path };
  }
  if (focus.domain === "service" || focus.domain === "interface") return { ...identity, kind: focus.domain, id: focus.key };
  return null;
}
