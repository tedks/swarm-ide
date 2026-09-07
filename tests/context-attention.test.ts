import { describe, expect, it } from "vitest";
import { emptyContextAttention, permitsContextActivation, reduceContextAttention, subjectFromFocus } from "../app/renderer/context/attention";
const a = { repositoryId: "repo", worldId: "world", kind: "file" as const, path: "a.ts" };
const b = { ...a, path: "b.ts" };
describe("deliberate Context attention", () => {
  it("allows pending B while A remains inspected, then rejects A-B-A supersession", () => {
    let state = reduceContextAttention(emptyContextAttention, { type: "realm", realm: "core:1" });
    state = reduceContextAttention(state, { type: "inspect", subject: a });
    const token = { realm: state.realm, generation: state.generation, intent: 1, path: b.path };
    expect(state.subject).toEqual(a);
    expect(permitsContextActivation(state, token, 1, "core:1", "b.ts")).toBe(true);
    for (const subject of [b, a]) state = reduceContextAttention(state, { type: "inspect", subject });
    expect(permitsContextActivation(state, token, 1, "core:1", "b.ts")).toBe(false);
  });
  it("rejects wrong intent, destination or core and clears attention when repository/world/core changes", () => {
    const state = reduceContextAttention({ ...emptyContextAttention, realm: "realm" }, { type: "inspect", subject: a });
    const token = { realm: state.realm, generation: state.generation, intent: 1, path: b.path };
    expect(permitsContextActivation(state, token, 2, "realm", b.path)).toBe(false);
    expect(permitsContextActivation(state, token, 1, "new core", b.path)).toBe(false);
    expect(permitsContextActivation(state, token, 1, "realm", a.path)).toBe(false);
    expect(reduceContextAttention(state, { type: "realm", realm: "new world" }).subject).toBeNull();
    expect(reduceContextAttention(state, { type: "realm", realm: "realm" })).toBe(state);
  });
  it("does not infer file identity from a service's preferred path or invalid path", () => {
    const focus = { worldId: "world", revisionKind: "working" as const, revisionId: "a", domain: "service" as const, key: "service:example", path: "a.ts" };
    expect(subjectFromFocus("repo", "world", focus)).toEqual({ repositoryId: "repo", worldId: "world", kind: "service", id: "service:example" });
    expect(subjectFromFocus("repo", "world", { ...focus, domain: "repo", key: "file:../escape", path: "../escape" })).toBeNull();
    expect(subjectFromFocus("repo", "other", focus)).toBeNull();
  });
});
