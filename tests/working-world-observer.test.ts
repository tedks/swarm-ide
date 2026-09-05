// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WorkingWorldObserver, type WorkingWorldObserverClock } from "../core/working-world-observer";

const inertClock: WorkingWorldObserverClock = {
  every: () => ({ unref: () => undefined }),
  cancel: () => undefined,
};

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("working-world observer", () => {
  it("detects changes outside explicitly opened files", async () => {
    const changed: string[] = [];
    const observer = new WorkingWorldObserver("a", async () => "b", (fingerprint) => changed.push(fingerprint), () => undefined, 1_000, inertClock);
    observer.start();
    observer.request();
    await settle();
    expect(changed).toEqual(["b"]);
    observer.close();
  });

  it("never publishes an older failure after a newer request succeeds", async () => {
    let rejectOld!: (error: Error) => void;
    const old = new Promise<string>((_resolve, reject) => { rejectOld = reject; });
    let calls = 0;
    const changed: string[] = [];
    const failed: string[] = [];
    const observer = new WorkingWorldObserver("a", async () => ++calls === 1 ? old : "c", (fingerprint) => changed.push(fingerprint), (error) => failed.push(error.message), 1_000, inertClock);
    observer.request();
    observer.request();
    rejectOld(new Error("stale failure"));
    await settle();
    await settle();
    expect(changed).toEqual(["c"]);
    expect(failed).toEqual([]);
    observer.close();
  });

  it("coalesces bursts and suppresses unchanged fingerprints", async () => {
    let release!: (fingerprint: string) => void;
    const first = new Promise<string>((resolve) => { release = resolve; });
    let calls = 0;
    const changed: string[] = [];
    const observer = new WorkingWorldObserver("a", async () => ++calls === 1 ? first : "a", (fingerprint) => changed.push(fingerprint), () => undefined, 1_000, inertClock);
    observer.request();
    observer.request();
    observer.request();
    release("b");
    await settle();
    await settle();
    expect(calls).toBe(2);
    expect(changed).toEqual([]);
    observer.close();
  });

  it("publishes recovery even when the successful fingerprint is unchanged", async () => {
    let calls = 0;
    const changed: string[] = [];
    const failed: string[] = [];
    const observer = new WorkingWorldObserver(
      "a",
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("git unavailable");
        return "a";
      },
      (fingerprint) => changed.push(fingerprint),
      (error) => failed.push(error.message),
      1_000,
      inertClock,
    );
    observer.request();
    await settle();
    observer.request();
    await settle();
    expect(failed).toEqual(["git unavailable"]);
    expect(changed).toEqual(["a"]);
    observer.close();
  });

  it("does not let periodic ticks starve a slower fingerprint computation", async () => {
    let tick!: () => void;
    let release!: (fingerprint: string) => void;
    let calls = 0;
    const changed: string[] = [];
    const slow = new Promise<string>((resolve) => { release = resolve; });
    const clock: WorkingWorldObserverClock = {
      every: (_milliseconds, callback) => { tick = callback; return {}; },
      cancel: () => undefined,
    };
    const observer = new WorkingWorldObserver("a", async () => { calls += 1; return slow; }, (fingerprint) => changed.push(fingerprint), () => undefined, 1_000, clock);
    observer.start();
    tick();
    tick();
    tick();
    expect(calls).toBe(1);
    release("b");
    await settle();
    expect(changed).toEqual(["b"]);
    observer.close();
  });
});
