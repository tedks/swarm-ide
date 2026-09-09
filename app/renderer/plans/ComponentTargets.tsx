import type { PlanNode } from "../../../protocol/plans";
import type { BuildGraphObservation } from "../../../protocol/build-graph";
import { SelectedBuildTargetSchema } from "../../../protocol/build-jobs";
import "./component-targets.css";

/** Publication from the existing plan reader, not a second discovery lane. */
export interface ComponentSelection {
  node: PlanNode | null;
  current: boolean;
  repositoryId: string;
  worldId: string;
  generation: number;
}

export function componentTargets(selection: ComponentSelection, observation?: BuildGraphObservation) {
  const graph = observation?.graph;
  const sameWorkspace = observation?.repositoryId === selection.repositoryId && observation.worldId === selection.worldId &&
    graph?.repositoryId === selection.repositoryId && graph.worldId === selection.worldId;
  return (selection.node?.design?.buildTargets ?? []).map((mapping) => {
    const target = sameWorkspace ? graph?.targets.find((item) => item.label === mapping.label) : undefined;
    const executable = target?.kind === "rule" && SelectedBuildTargetSchema.safeParse(mapping.label).success;
    const kind = !executable ? "unavailable" : target.ruleClass === "test_suite" || target.ruleClass?.endsWith("_test") ? "test" : "build";
    return { ...mapping, kind, ruleClass: target?.ruleClass,
      ready: Boolean(executable && selection.current && observation?.status === "current"),
    };
  });
}

export function ComponentTargets({ selection, observation, busy, onRun, onOpenTarget, onRefresh }: {
  selection: ComponentSelection;
  observation?: BuildGraphObservation;
  busy: boolean;
  onRun(label: string, operation: "build" | "test"): void;
  onOpenTarget(label: string): void;
  onRefresh(): void;
}) {
  const targets = componentTargets(selection, observation);
  const tests = targets.filter((target) => target.kind === "test");
  const builds = targets.filter((target) => target.kind === "build");
  const unavailable = targets.filter((target) => target.kind === "unavailable");
  return <section className="artifact-context component-targets" aria-label="Component targets" data-component-id={selection.node?.id}>
    <div className="instrument-heading"><div><span className="eyebrow">Context · Component</span>
      <h2>{selection.node?.title ?? "Component"}</h2></div></div>
    {selection.node?.design?.summary ? <p className="component-target-summary">{selection.node.design.summary}</p> : null}
    {!selection.current ? <p role="status">Refreshing component…</p> : null}
    {([['Tests', tests, 'test'], ['Build targets', builds, 'build']] as const).map(([heading, rows, operation]) =>
      <section className="component-target-group" key={heading} aria-label={heading}>
        <h3>{heading} <small>{rows.length}</small></h3>
        {!rows.length ? <p className="component-target-empty">{operation === "test" ? "No test targets" : "No build targets"}</p> :
          <ul>{rows.map((target) => <li key={target.label}>
            <button className="component-target-link" title={target.ruleClass} disabled={!target.ready} onClick={() => onOpenTarget(target.label)}>{target.label}</button>
            <p>{target.role}</p>
            <button className="component-target-run" aria-label={`${operation === "test" ? "Test" : "Build"} ${target.label}`} disabled={!target.ready || busy}
              onClick={() => { if (target.ready && !busy) onRun(target.label, operation); }}>
              <span aria-hidden="true">▶</span> {operation === "test" ? "Test" : "Build"}
            </button>
          </li>)}</ul>}
      </section>)}
    {unavailable.length ? <section className="component-target-group" aria-label="Other mappings"><h3>Other mappings</h3>
      <ul>{unavailable.map((target) => <li key={target.label}><code>{target.label}</code><p>{target.role}</p><small>Not available as a current Bazel rule</small></li>)}</ul>
    </section> : null}
    {observation?.status !== "current" || unavailable.length ? <button type="button" disabled={busy || observation?.status === "refreshing"} onClick={onRefresh}>Refresh targets</button> : null}
    <p className="component-target-note">Mapped by this component's design. Results appear in Builds &amp; resources.</p>
  </section>;
}
