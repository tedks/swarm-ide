export interface WorkingWorldObserverTimer {
  unref?(): void;
}

export interface WorkingWorldObserverClock {
  every(milliseconds: number, callback: () => void): WorkingWorldObserverTimer;
  cancel(timer: WorkingWorldObserverTimer): void;
}

const systemClock: WorkingWorldObserverClock = {
  every: (milliseconds, callback) => setInterval(callback, milliseconds),
  cancel: (timer) => clearInterval(timer as NodeJS.Timeout),
};

/**
 * Coalesces filesystem hints and a bounded polling fallback into one globally
 * ordered view of Git's working world. Only the newest requested computation
 * may publish success or failure.
 */
export class WorkingWorldObserver {
  private requested = 0;
  private processed = 0;
  private running = false;
  private closed = false;
  private timer: WorkingWorldObserverTimer | null = null;
  private lastFingerprint: string;
  private observationFailed = false;

  constructor(
    initialFingerprint: string,
    private readonly compute: () => Promise<string>,
    private readonly changed: (fingerprint: string) => void,
    private readonly failed: (error: Error) => void,
    private readonly pollMilliseconds = 1_000,
    private readonly clock: WorkingWorldObserverClock = systemClock,
  ) {
    this.lastFingerprint = initialFingerprint;
  }

  start(): void {
    if (this.closed || this.timer) return;
    // A periodic hint must not invalidate work already in flight: a slow Git
    // fingerprint still describes a real observed world, and the next tick
    // will sample again. Explicit filesystem/save hints continue to request a
    // newer generation through request().
    this.timer = this.clock.every(this.pollMilliseconds, () => {
      if (!this.running) this.request();
    });
    this.timer.unref?.();
  }

  request(): void {
    if (this.closed) return;
    this.requested += 1;
    if (!this.running) void this.drain();
  }

  observeKnown(fingerprint: string): void {
    this.lastFingerprint = fingerprint;
    this.observationFailed = false;
    // Invalidate a computation that may have started before the caller's
    // atomic save, then reconcile once more against Git's complete view.
    this.request();
  }

  close(): void {
    this.closed = true;
    if (this.timer) this.clock.cancel(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (!this.closed && this.processed < this.requested) {
        const generation = this.requested;
        try {
          const fingerprint = await this.compute();
          this.processed = generation;
          if (generation !== this.requested || this.closed) continue;
          const recovered = this.observationFailed;
          this.observationFailed = false;
          if (fingerprint !== this.lastFingerprint || recovered) {
            this.lastFingerprint = fingerprint;
            this.changed(fingerprint);
          }
        } catch (cause) {
          this.processed = generation;
          if (generation !== this.requested || this.closed) continue;
          if (!this.observationFailed) {
            this.observationFailed = true;
            this.failed(cause instanceof Error ? cause : new Error("unknown working-world observation failure"));
          }
        }
      }
    } finally {
      this.running = false;
      if (!this.closed && this.processed < this.requested) void this.drain();
    }
  }
}
