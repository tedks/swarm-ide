import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlanHierarchy } from "./PlanHierarchy";
import { TaskGraph } from "../tasks/TaskGraph";
import type { TaskBridgeClient, TaskClientState } from "../tasks/client";
import type { TaskSnapshot } from "../../../protocol/tasks";
import "./plans.css";
import "./workspace.css";
import { DesignWorkspace, type DesignWorkspaceParts } from "./DesignWorkspace";
import { usePlanNavigation } from "./navigation";

export function PlanWorkspace({ visible, worldId, repositoryId, generation, connected, tasks, client, onOpenFile, onOpenTask, onOpenBuild, initialView = "design", renderWorkspace, documentVisible, onOpenDesign, restoreSelection, onSelectComponent }: {
  visible: boolean; worldId: string; repositoryId: string; generation: number; connected: boolean; tasks: TaskClientState;
  client: TaskBridgeClient; onOpenFile: (path: string) => void; onOpenTask: (snapshot: TaskSnapshot, id: string) => Promise<boolean>;
  onOpenBuild?: (label: string) => void;
  initialView?: "tasks" | "plans" | "design";
  renderWorkspace?: (parts: DesignWorkspaceParts) => ReactNode;
  documentVisible?: boolean;
  onOpenDesign?: () => void;
  restoreSelection?: { id: string; serial: number };
  onSelectComponent?: (id: string) => void;
}) {
  const [view, setView] = useState(initialView);
  const baseNavigation = usePlanNavigation({ visible: visible && view !== "tasks", worldId, repositoryId, generation, connected });
  const restored = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (restoreSelection && baseNavigation.current && restored.current !== restoreSelection.serial) {
      restored.current = restoreSelection.serial; baseNavigation.select(restoreSelection.id);
    }
  }, [restoreSelection, baseNavigation]);
  const navigation = { ...baseNavigation, select: (id: string) => { baseNavigation.select(id); if (baseNavigation.current) onSelectComponent?.(id); } };
  if (renderWorkspace) return <DesignWorkspace visible={visible} worldId={worldId} repositoryId={repositoryId} generation={generation} connected={connected}
    navigation={navigation} documentVisible={documentVisible} onOpenDesign={onOpenDesign} renderWorkspace={renderWorkspace}
    onOpenFile={onOpenFile} onOpenBuild={onOpenBuild} taskPane={<TaskGraph client={client} state={tasks} visible={visible} onOpen={onOpenTask} />}
    onOpenTask={(id) => { const snapshot = tasks.observation?.snapshot; if (snapshot) void onOpenTask(snapshot, id); }} />;
  return <section className="planning-field" aria-label="Planning workspace" hidden={!visible}>
    <nav className="planning-tabs" aria-label="Planning projections">
      <button aria-pressed={view === "design"} onClick={() => setView("design")}>System design</button>
      <button aria-pressed={view === "plans"} onClick={() => setView("plans")}>Plans & components</button>
      <button aria-pressed={view === "tasks"} onClick={() => setView("tasks")}>Task blockage</button>
    </nav>
    <PlanHierarchy worldId={worldId} repositoryId={repositoryId} generation={generation} connected={connected} tasks={tasks}
      visible={visible && view === "plans"} onOpenFile={onOpenFile} onOpenTask={onOpenTask} navigation={navigation} />
    <DesignWorkspace visible={visible && view !== "plans"} taskOnly={view === "tasks"} worldId={worldId} repositoryId={repositoryId} generation={generation} connected={connected}
      navigation={navigation} onOpenFile={onOpenFile} onOpenBuild={onOpenBuild}
      taskPane={<TaskGraph client={client} state={tasks} visible={visible && view !== "plans"} onOpen={onOpenTask} />}
      onOpenTask={(id) => { const snapshot = tasks.observation?.snapshot; if (snapshot) void onOpenTask(snapshot, id); }} />
  </section>;
}
