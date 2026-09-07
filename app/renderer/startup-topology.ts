import { useEffect } from "react";
import type { WorkspaceSnapshot } from "../../protocol/schema";

export interface StartupTopologyMemory {
  generation?: number;
  settled?: boolean;
}

export interface StartupTopologyContext {
  snapshot: WorkspaceSnapshot | null;
  coreGeneration: number;
  observedCoreGeneration: number | null;
  ready: boolean;
  restoredDocument: boolean;
}

// A document gets one automatic attempt, not one per component mount, source
// change, or core recovery. Keep that latch across Fast Refresh, including
// replacement of this module itself. Nothing is persisted to disk or storage.
const hot = import.meta.hot?.data as { startupTopology?: StartupTopologyMemory } | undefined;
const documentMemory: StartupTopologyMemory = hot?.startupTopology ?? {};
if (hot) hot.startupTopology = documentMemory;

/** `start` uses the normal reconciliation request and its existing error UI. */
export function useStartupTopology(
  { snapshot, coreGeneration, observedCoreGeneration, ready, restoredDocument }: StartupTopologyContext,
  start: () => void,
  memory: StartupTopologyMemory = documentMemory,
): void {
  useEffect(() => {
    if (memory.settled) return;
    // Even a replacement that happens before the initial fingerprint arrives
    // is recovery, not permission to launch a new automatic build.
    if (memory.generation !== undefined && memory.generation !== coreGeneration) {
      memory.settled = true;
      return;
    }
    if (!ready) return;
    memory.generation ??= coreGeneration;
    if (restoredDocument) {
      memory.settled = true;
      return;
    }
    // Retained HMR/navigation snapshots cannot confer live-core authority.
    if (!snapshot || observedCoreGeneration !== coreGeneration) return;
    const repository = snapshot.graphs.find((graph) => graph.topologyId === "repo" && graph.directory);
    const service = snapshot.graphs.find((graph) => graph.topologyId === "service");
    if (!repository || !service ||
        snapshot.reconciliation.status === "red" || snapshot.reconciliation.status === "green" ||
        snapshot.reconciliation.lastConsistentFingerprint !== "unobserved" || snapshot.revisions.built.id ||
        snapshot.jobs.some((job) => job.kind === "build") || snapshot.activity.some((item) => item.kind === "build")) {
      memory.settled = true;
      return;
    }
    // Registration is initially gray/unavailable. The independent source
    // observer supplies the first real fingerprint and marks it yellow.
    if (snapshot.revisions.working.evidence !== "observed" || !snapshot.revisions.working.fingerprint) return;
    // Consume before invoking: pending, failed, or unknown outcomes must not
    // replay when React runs effects again. Explicit Build remains available.
    memory.settled = true;
    start();
  }, [snapshot, coreGeneration, observedCoreGeneration, ready, restoredDocument, start, memory]);
}
