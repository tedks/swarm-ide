// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFileWatchers, type WatchHandle } from "../core/watchers";

class FakeWatcher implements WatchHandle {
  closed = false;
  errorListener: ((error: Error) => void) | null = null;
  close(): void { this.closed = true; }
  on(_event: "error", listener: (error: Error) => void): this { this.errorListener = listener; return this; }
}

afterEach(() => vi.useRealTimers());

describe("workspace file watchers", () => {
  it("deduplicates concurrent registrations and cancels a pending registration cleanly", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let resolves = 0;
    const created: FakeWatcher[] = [];
    const registry = new WorkspaceFileWatchers("/workspace", () => undefined, () => undefined, {
      resolve: async () => { resolves += 1; await blocked; return { absolutePath: "/workspace/src/file.ts" }; },
      create: () => { const watcher = new FakeWatcher(); created.push(watcher); return watcher; },
    }, 0);
    const first = registry.watch("src/file.ts");
    const second = registry.watch("src/file.ts");
    registry.unwatch("src/file.ts");
    release();
    await Promise.all([first, second]);
    expect(resolves).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]?.closed).toBe(true);
    expect(registry.activeCount()).toBe(0);
  });

  it("keeps the parent watcher alive across deletion and recreation notifications", async () => {
    vi.useFakeTimers();
    const changed: string[] = [];
    const created: FakeWatcher[] = [];
    let notify!: (eventType: string, name: string | Buffer | null) => void;
    const registry = new WorkspaceFileWatchers("/workspace", (path) => changed.push(path), () => undefined, {
      resolve: async () => ({ absolutePath: "/workspace/src/file.ts" }),
      create: (_parent, listener) => { notify = listener; const watcher = new FakeWatcher(); created.push(watcher); return watcher; },
    }, 1);
    await registry.watch("src/file.ts");
    notify("rename", "file.ts");
    await vi.runAllTimersAsync();
    notify("rename", "file.ts");
    await vi.runAllTimersAsync();
    notify("change", "other.ts");
    await vi.runAllTimersAsync();
    expect(changed).toEqual(["src/file.ts", "src/file.ts"]);
    expect(created).toHaveLength(1);
    expect(created[0]?.closed).toBe(false);
    expect(registry.activeCount()).toBe(1);
  });
});
