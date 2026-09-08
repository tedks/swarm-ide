import { useEffect, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import type { ProjectContextObservation, ProjectEndpoint, ProjectScan } from "../../../protocol/project-context";
import "./project-context.css";

type Identity = { repositoryId: string; worldId: string; generation: number; ready: boolean };
type State = { identity: string; observation?: ProjectContextObservation; stale: boolean; error: string };
function endpointLabel(endpoint: ProjectEndpoint) {
  return `${endpoint.address.includes(":") ? `[${endpoint.address}]` : endpoint.address}:${endpoint.port}${endpoint.protocol === "udp" ? " UDP" : ""}`;
}
function Endpoints({ endpoints }: { endpoints: ProjectEndpoint[] }) {
  return <div className="project-endpoints">{endpoints.map((endpoint) => endpoint.url
    ? <a key={endpointLabel(endpoint)} href={endpoint.url} target="_blank" rel="noreferrer" title={`Listening on ${endpointLabel(endpoint)}`}>{endpoint.url}</a>
    : <span key={endpointLabel(endpoint)}>{endpointLabel(endpoint)}</span>)}</div>;
}
const memory = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
function Retained({ scan }: { scan?: ProjectScan }) {
  return scan?.retained && scan.observedAt ? <small title={new Date(scan.observedAt).toLocaleString()}>Last seen {new Date(scan.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small> : null;
}

/** Runtime observations never change the user's source, graph or Context subject. */
export function ProjectContextPanel({ repositoryId, worldId, generation, ready }: Identity) {
  const identity = `${repositoryId}\n${worldId}\n${generation}`;
  const [state, setState] = useState<State>({ identity, stale: true, error: "" });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true, pending = false;
    const update = async () => {
      if (!ready || pending || document.visibilityState === "hidden" || !window.swarm) return;
      pending = true;
      try {
        const request = { protocolVersion: PROTOCOL_VERSION, requestId: `project-context:${crypto.randomUUID()}`, type: "projectContext.observe" as const, repositoryId, worldId };
        const response = parseCoreResponseForRequest(await window.swarm.request(request), request);
        if (!alive) return;
        if (!response.ok || !response.projectContext) throw new Error("Runtime context unavailable");
        setState({ identity, observation: response.projectContext, stale: false, error: "" });
      } catch {
        if (alive) setState((old) => ({ identity, observation: old.identity === identity ? old.observation : undefined, stale: true, error: "Runtime context unavailable" }));
      } finally { pending = false; }
    };
    void update();
    const interval = ready ? setInterval(() => { void update(); }, 10_000) : undefined;
    const visible = () => { if (document.visibilityState !== "hidden") void update(); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [identity, repositoryId, worldId, ready, refresh]);
  const observation = state.identity === identity ? state.observation : undefined;
  const stale = !ready || state.stale || state.identity !== identity;
  return <section className="project-runtime" aria-label="Project runtime">
    <header><span className="eyebrow">Project runtime</span><button type="button" aria-label="Refresh project runtime" disabled={!ready} onClick={() => setRefresh((value) => value + 1)}>↻</button></header>
    {observation ? <small className="project-runtime-time" title={new Date(observation.observedAt).toLocaleString()}>{stale ? "Last seen" : "Updated"} {new Date(observation.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small> : null}
    <h3>Dev servers <Retained scan={observation?.node} /></h3>
    {!observation?.servers.length ? <p className="project-runtime-empty">{observation?.node.status === "unavailable" ? "Server discovery unavailable" : observation ? "No dev servers found" : ready ? "Looking for dev servers…" : "Waiting for connection"}</p> : observation.servers.map((server) => <article key={server.pid}>
      <div className="project-runtime-name"><strong>{server.name}</strong><small>PID {server.pid}</small></div>
      <Endpoints endpoints={server.endpoints} />
      <small title={server.directory}>{server.association === "bazel-output" ? "Bazel output" : "This worktree"}</small>
    </article>)}
    {observation?.node.status === "partial" ? <p className="project-runtime-empty">Some processes could not be inspected</p> : null}
    <h3>Containers <Retained scan={observation?.docker} /></h3>
    {!observation?.containers.length ? <p className="project-runtime-empty">{observation?.docker.status === "unavailable" ? "Docker unavailable" : observation ? "No containers for this worktree" : "Looking for containers…"}</p> : observation.containers.map((container) => <article key={container.id}>
      <div className="project-runtime-name"><strong>{container.service ?? container.name}</strong><small>{container.health ?? container.state}</small></div>
      <small title={container.image}>{container.name}</small>
      <Endpoints endpoints={container.endpoints} />
      <dl className="project-runtime-resources">
        {container.cpuPercent !== undefined ? <div><dt>CPU</dt><dd>{container.cpuPercent.toFixed(1)}%</dd></div> : null}
        {container.memoryBytes !== undefined ? <div><dt>Memory</dt><dd>{memory(container.memoryBytes)}{container.memoryLimitBytes ? ` / ${memory(container.memoryLimitBytes)}` : ""}</dd></div> : null}
      </dl>
    </article>)}
    {observation?.docker.status === "partial" ? <p className="project-runtime-empty">Some container details unavailable</p> : null}
    {state.identity === identity && state.error ? <p className="project-runtime-empty">{state.error}</p> : null}
  </section>;
}
