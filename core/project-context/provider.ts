import { ProjectContextObservationSchema, type ProjectContextObservation } from "../../protocol/project-context";
import { discoverNodeServers } from "./node";
import { discoverDockerContainers } from "./docker";
import { discoverProjectCatalog } from "./catalog";

export class ProjectContextProvider {
  private lifetime = new AbortController();
  private pending: Promise<ProjectContextObservation> | null = null;
  private cached: ProjectContextObservation | null = null;
  constructor(private root: string, private repositoryId: string, private worldId: string,
    private discoverNode = discoverNodeServers, private discoverDocker = discoverDockerContainers,
    private discoverCatalog = discoverProjectCatalog) {}

  observe(): Promise<ProjectContextObservation> {
    if (this.lifetime.signal.aborted) return Promise.reject(new Error("Project context closed"));
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - Date.parse(this.cached.observedAt) < 5_000) return Promise.resolve(this.cached);
    const read = new AbortController();
    const cancel = () => read.abort();
    this.lifetime.signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 3_000);
    this.pending = (async () => {
      const [node, docker, catalog] = await Promise.all([
        this.discoverNode(this.root, read.signal).catch(() => ({ scan: { status: "unavailable" as const, message: "Local server discovery unavailable" }, servers: [] })),
        this.discoverDocker(this.root, read.signal).catch(() => ({ scan: { status: "unavailable" as const, message: "Docker unavailable" }, containers: [] })),
        this.discoverCatalog(this.root, read.signal).catch(() => ({ scan: { status: "unavailable" as const }, components: [], relationships: [], sites: [] })),
      ]);
      if (this.lifetime.signal.aborted) throw new Error("Project context closed");
      const observedAt = new Date().toISOString();
      const previous = this.cached;
      const keepNode = node.scan.status === "unavailable" && previous?.node.observedAt;
      const keepDocker = docker.scan.status === "unavailable" && previous?.docker.observedAt;
      const keepCatalog = catalog.scan.status === "unavailable" && previous?.catalog?.scan.observedAt;
      this.cached = ProjectContextObservationSchema.parse({ repositoryId: this.repositoryId, worldId: this.worldId,
        observedAt,
        servers: keepNode ? previous.servers : node.servers,
        containers: keepDocker ? previous.containers : docker.containers,
        node: { ...node.scan, ...(keepNode ? { retained: true, observedAt: previous.node.observedAt } : node.scan.status !== "unavailable" ? { observedAt } : {}) },
        docker: { ...docker.scan, ...(keepDocker ? { retained: true, observedAt: previous.docker.observedAt } : docker.scan.status !== "unavailable" ? { observedAt } : {}) },
        catalog: { ...(keepCatalog ? previous.catalog : catalog),
          scan: { ...catalog.scan, ...(keepCatalog ? { retained: true, observedAt: previous.catalog!.scan.observedAt } : catalog.scan.status !== "unavailable" ? { observedAt } : {}) } },
      });
      return this.cached;
    })().finally(() => {
      clearTimeout(timeout); this.lifetime.signal.removeEventListener("abort", cancel); this.pending = null;
    });
    return this.pending;
  }

  async dispose(): Promise<void> { this.lifetime.abort(); await this.pending?.catch(() => {}); }
}
