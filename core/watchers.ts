import { watch as nodeWatch } from "node:fs";
import { basename, dirname } from "node:path";
import { resolveWorkspaceFile } from "./files";

export interface WatchHandle {
  close(): void;
  on(event: "error", listener: (error: Error) => void): this;
}

export interface WatchDependencies {
  resolve(workspaceRoot: string, path: string): Promise<{ absolutePath: string }>;
  create(parent: string, listener: (eventType: string, changedName: string | Buffer | null) => void): WatchHandle;
}

const defaultDependencies: WatchDependencies = {
  resolve: resolveWorkspaceFile,
  create: (parent, listener) => nodeWatch(parent, { persistent: false }, listener),
};

export class WorkspaceFileWatchers {
  private readonly watchers = new Map<string, { watcher: WatchHandle; timer: NodeJS.Timeout | null }>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly desired = new Set<string>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly changed: (path: string) => void,
    private readonly failed: (path: string, error: Error) => void,
    private readonly dependencies: WatchDependencies = defaultDependencies,
    private readonly debounceMilliseconds = 45,
  ) {}

  async watch(path: string): Promise<void> {
    this.desired.add(path);
    if (this.watchers.has(path)) return;
    const existing = this.pending.get(path);
    if (existing) {
      await existing;
      if (!this.watchers.has(path) && this.desired.has(path)) return this.watch(path);
      return;
    }
    const creation = this.create(path);
    this.pending.set(path, creation);
    try {
      await creation;
    } finally {
      if (this.pending.get(path) === creation) this.pending.delete(path);
    }
  }

  unwatch(path: string): void {
    this.desired.delete(path);
    const entry = this.watchers.get(path);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.watcher.close();
    this.watchers.delete(path);
  }

  closeAll(): void {
    for (const path of [...this.desired]) this.unwatch(path);
  }

  activeCount(): number {
    return this.watchers.size;
  }

  private async create(path: string): Promise<void> {
    const resolved = await this.dependencies.resolve(this.workspaceRoot, path);
    const watchedName = basename(resolved.absolutePath);
    const entry = { watcher: null as unknown as WatchHandle, timer: null as NodeJS.Timeout | null };
    entry.watcher = this.dependencies.create(dirname(resolved.absolutePath), (_eventType, changedName) => {
      if (changedName && changedName.toString() !== watchedName) return;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        if (this.desired.has(path) && this.watchers.get(path) === entry) this.changed(path);
      }, this.debounceMilliseconds);
    });
    entry.watcher.on("error", (error) => {
      this.failed(path, error);
      this.unwatch(path);
    });
    if (!this.desired.has(path)) entry.watcher.close();
    else this.watchers.set(path, entry);
  }
}
