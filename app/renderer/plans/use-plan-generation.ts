import { useEffect, useRef, useState } from "react";
import type { PlanGenerationSettings } from "../../../protocol/plan-generation";
import type { TrustedSnapshot } from "../../../protocol/trusted-local";
import type { PlanGenerationAction } from "./PlanGeneration";

export class PlanGenerationUnconfirmedError extends Error {}
type Run = { token: string; pending: boolean; notice: string; retry?: boolean };
const storageKey = (identity: string) => `swarm.component-plan.run.v1:${identity}`;
function restore(identity: string): Run | null {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(identity)) ?? "null");
    if (saved && typeof saved === "object" && "token" in saved && typeof saved.token === "string" && /^[a-f0-9-]{36}$/.test(saved.token))
      return { token: saved.token, pending: true, retry: true, notice: "Checking the generation agent…" };
  } catch { /* Core admission also rejects a second active generation. */ }
  return null;
}

export function usePlanGeneration({ identity, connected, launch, onOpen, observation }: {
  identity: string; connected: boolean;
  launch(token: string, settings: PlanGenerationSettings): Promise<void>;
  onOpen(token: string): void; observation: TrustedSnapshot | null;
}): PlanGenerationAction & { refreshVersion: number } {
  const runs = useRef(new Map<string, Run | null>()), admissions = useRef(new Set<string>());
  if (!runs.current.has(identity)) runs.current.set(identity, restore(identity));
  const [, update] = useState(0), [refreshVersion, setRefreshVersion] = useState(0);
  const boundary = useRef({ identity, connected, epoch: 0 });
  if (boundary.current.identity !== identity || boundary.current.connected !== connected)
    boundary.current = { identity, connected, epoch: boundary.current.epoch + 1 };
  const origin = boundary.current.epoch;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const setRun = (owner: string, value: Run) => {
    runs.current.set(owner, value);
    try { sessionStorage.setItem(storageKey(owner), JSON.stringify({ token: value.token })); } catch { /* Optional profile memory. */ }
    if (live.current) update(value => value + 1);
  };
  const run = runs.current.get(identity) ?? null;
  useEffect(() => {
    if (!connected || !run?.pending || admissions.current.has(identity) || !observation) return;
    const summary = observation.runs?.find(item => item.runToken === run.token);
    const status = observation.runToken === run.token ? observation.status : summary?.status;
    if (!status || !["ready", "failed", "closed"].includes(status)) return;
    setRun(identity, { ...run, pending: false, notice: status === "ready"
      ? "Agent finished. Reading the component plan…"
      : status === "closed" ? "Generation stopped. Any files already written remain in the worktree."
      : (observation.runToken === run.token ? observation.message : summary?.message) || "Generation failed. Open the agent to inspect its output." });
    setRefreshVersion(value => value + 1);
  }, [identity, connected, observation, run]);
  const start = (settings: PlanGenerationSettings, retry = false) => {
    const previous = runs.current.get(identity);
    if (!live.current || !connected || boundary.current.epoch !== origin || admissions.current.has(identity) ||
      (retry ? !previous?.retry : previous?.pending)) return;
    admissions.current.add(identity);
    // Explicit recovery reuses the permanently reserved identity. If the first
    // request reached core, its admission guard rejects this without execution.
    const token = retry && previous ? previous.token : crypto.randomUUID();
    setRun(identity, { token, pending: true, notice: "Starting design agent…" });
    // Capture this workspace's launch closure before any asynchronous work.
    void launch(token, settings).then(() => {
      setRun(identity, { token, pending: true, notice: "Design agent is working. Follow its conversation for progress and Stop." });
      if (live.current && boundary.current.epoch === origin) onOpen(token);
    }).catch((error: unknown) => {
      const uncertain = error instanceof PlanGenerationUnconfirmedError;
      setRun(identity, { token, pending: uncertain, retry: uncertain, notice: error instanceof Error ? error.message : "Could not start the design agent." });
      if (live.current && boundary.current.epoch === origin) setRefreshVersion(value => value + 1);
    }).finally(() => { admissions.current.delete(identity); });
  };
  return { pending: run?.pending ?? false, notice: run?.notice ?? "", start, refreshVersion,
    ...(run?.retry ? { retry: (settings: PlanGenerationSettings) => start(settings, true) } : {}),
    ...(run ? { open: () => { if (live.current && boundary.current.epoch === origin) onOpen(run.token); } } : {}) };
}
