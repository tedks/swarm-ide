import { useCallback, useEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import type { BuildJobRequest, BuildJobsObservation } from "../../../protocol/build-jobs";

/** Read-only polling while a build runs. Neither refresh nor recovery replays Start. */
export function useTargetBuilds(repositoryId: string | undefined, worldId: string | undefined, realm: string, enabled: boolean) {
  const [observation, setObservation] = useState<BuildJobsObservation>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const current = useRef({ repositoryId, worldId, realm, enabled });
  current.current = { repositoryId, worldId, realm, enabled };
  const controls = useRef<{ send(action: Action): Promise<void> } | undefined>(undefined);
  type Action = { type: "build.observe" } | { type: "build.start"; target: string } | { type: "build.cancel"; jobId: string };
  useEffect(() => {
    setObservation(undefined); setError(undefined); setPending(false);
    if (!repositoryId || !worldId || !enabled || !window.swarm) return;
    let disposed = false, reading = false, mutation = false, generation = 0, readAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = () => !disposed && current.current.repositoryId === repositoryId && current.current.worldId === worldId && current.current.realm === realm && current.current.enabled;
    async function send(action: Action) {
      if (!valid() || action.type !== "build.observe" && mutation) return;
      if (action.type === "build.observe" && (reading || mutation)) { readAgain = true; return; }
      clearTimeout(timer);
      const isRead = action.type === "build.observe";
      const ownGeneration = isRead ? generation : ++generation;
      if (isRead) reading = true; else { mutation = true; setPending(true); }
      try {
        const request: BuildJobRequest = { ...action, requestId: `target-build:${crypto.randomUUID()}`, protocolVersion: PROTOCOL_VERSION, repositoryId: repositoryId!, worldId: worldId! };
        const response = parseCoreResponseForRequest(await window.swarm!.request(request), request);
        if (!valid()) return;
        // An earlier read must not overwrite a newer Start/Stop response.
        if (ownGeneration !== generation) return;
        if (!response.ok) throw new Error(response.error.message);
        setObservation(response.buildJobs); setError(undefined);
        if (response.buildJobs?.jobs.some((job) => job.status === "running" || job.status === "stopping"))
          timer = setTimeout(() => { void send({ type: "build.observe" }); }, 500);
      } catch (failure) {
        if (valid() && ownGeneration === generation) {
          setError(failure instanceof Error ? failure.message : "Build status unavailable");
          // Recover observation only: a lost admission reply never causes a retry.
          timer = setTimeout(() => { void send({ type: "build.observe" }); }, 1500);
        }
      } finally {
        if (isRead) reading = false; else { mutation = false; if (valid()) setPending(false); }
        if (valid() && !reading && !mutation && readAgain) { readAgain = false; void send({ type: "build.observe" }); }
      }
    }
    const control = { send }; controls.current = control;
    const refresh = () => { void send({ type: "build.observe" }); };
    window.addEventListener("focus", refresh); refresh();
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener("focus", refresh); if (controls.current === control) controls.current = undefined; };
  }, [repositoryId, worldId, realm, enabled]);
  const start = useCallback((target: string) => controls.current?.send({ type: "build.start", target }), []);
  const cancel = useCallback((jobId: string) => controls.current?.send({ type: "build.cancel", jobId }), []);
  const scoped = observation && observation.repositoryId === repositoryId && observation.worldId === worldId ? observation : undefined;
  return { observation: scoped, error, start, cancel, busy: pending || Boolean(scoped?.blocked || scoped?.jobs.some((job) => job.status === "running" || job.status === "stopping")) };
}
