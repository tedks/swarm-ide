import { useState } from "react";
import { PlanHierarchy } from "./PlanHierarchy";
import { TaskGraph } from "../tasks/TaskGraph";
import type { TaskBridgeClient, TaskClientState } from "../tasks/client";
import type { TaskSnapshot } from "../../../protocol/tasks";
import "./plans.css";

export function PlanWorkspace({ visible, worldId, repositoryId, generation, connected, tasks, client, onOpenFile, onOpenTask }: {
  visible: boolean; worldId: string; repositoryId: string; generation: number; connected: boolean; tasks: TaskClientState;
  client: TaskBridgeClient; onOpenFile: (path: string) => void; onOpenTask: (snapshot: TaskSnapshot, id: string) => Promise<boolean>;
}) {
  const [view, setView] = useState<"tasks" | "plans">("tasks");
  return <section className="planning-field" aria-label="Planning workspace" hidden={!visible}>
    <nav className="planning-tabs" aria-label="Planning projections">
      <button aria-pressed={view === "tasks"} onClick={() => setView("tasks")}>Task blockage</button>
      <button aria-pressed={view === "plans"} onClick={() => setView("plans")}>Plans & components</button>
    </nav>
    <TaskGraph client={client} state={tasks} visible={visible && view === "tasks"} onOpen={onOpenTask} />
    <PlanHierarchy worldId={worldId} repositoryId={repositoryId} generation={generation} connected={connected} tasks={tasks}
      visible={visible && view === "plans"} onOpenFile={onOpenFile} onOpenTask={onOpenTask} />
  </section>;
}
