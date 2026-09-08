import { ProjectContextObservationSchema, type ProjectContextObservation } from "../../protocol/project-context";
import { discoverNodeServers } from "./node";
import { discoverDockerContainers } from "./docker";

export class ProjectContextProvider {
  private lifetime = new AbortController();
  private pending: Promise<ProjectContextObservation> | null = null;
  private cached: ProjectContextObservation | null = null;
  constructor(private root: string, private repositoryId: string, private worldId: string,
    private discoverNode = discoverNodeServers, private discoverDocker = discoverDockerContainers) {}

  observe(): Promise<ProjectContextObservation> {
    if (this.lifetime.signal.aborted) return Promise.reject(new Error("Project context closed"));
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - Date.parse(this.cached.observedAt) < 5_000) return Promise.resolve(this.cached);
    const read = new AbortController();
    const cancel = () => read.abort();
    this.lifetime.signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 3_000);
    this.pending = (async () => {
      const [node, docker] = await Promise.all([
        this.discoverNode(this.root, read.signal).catch(() => ({ scan: { status: "unavailable" as const, message: "Local server discovery unavailable" }, servers: [] })),
        this.discoverDocker(this.root, read.signal).catch(() => ({ scan: { status: "unavailable" as const, message: "Docker unavailable" }, containers: [] })),
      ]);
      if (this.lifetime.signal.aborted) throw new Error("Project context closed");
      this.cached = ProjectContextObservationSchema.parse({ repositoryId: this.repositoryId, worldId: this.worldId,
        observedAt: new Date().toISOString(), servers: node.servers, containers: docker.containers, node: node.scan, docker: docker.scan });
      return this.cached;
    })().finally(() => {
      clearTimeout(timeout); this.lifetime.signal.removeEventListener("abort", cancel); this.pending = null;
    });
    return this.pending;
  }

  async dispose(): Promise<void> { this.lifetime.abort(); await this.pending?.catch(() => {}); }
}
