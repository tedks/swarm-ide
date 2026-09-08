import { randomUUID } from "node:crypto";
import { BuildJobRequestSchema, BuildJobsObservationSchema, type BuildJobRequest, type BuildJobsObservation, type TargetBuildJob } from "../protocol/build-jobs";
import { createTargetBuildExecutor, type TargetBuildExecutor } from "./target-build-process";

export class TargetBuildService {
  private jobs: TargetBuildJob[] = [];
  private active?: { job: TargetBuildJob; abort: AbortController; pending: Promise<void>; started: number };
  private closed = false;
  private blocked = false;
  private closing?: Promise<void>;
  constructor(private readonly root: string, private readonly repositoryId: string, private readonly worldId: string,
    private readonly executor: TargetBuildExecutor = createTargetBuildExecutor(root), private readonly now = Date.now) {}

  observe(): BuildJobsObservation {
    if (this.active) this.active.job.elapsedMs = Math.max(0, this.now() - this.active.started);
    return BuildJobsObservationSchema.parse({ repositoryId: this.repositoryId, worldId: this.worldId, jobs: this.jobs, blocked: this.blocked });
  }

  request(input: BuildJobRequest): BuildJobsObservation {
    const request = BuildJobRequestSchema.parse(input);
    if (request.repositoryId !== this.repositoryId || request.worldId !== this.worldId) throw new Error("Build belongs to a different workspace");
    if (this.closed) throw new Error("Build service is shutting down");
    if (request.type === "build.observe") return this.observe();
    if (request.type === "build.cancel") {
      const job = this.jobs.find((item) => item.id === request.jobId);
      if (!job) throw new Error("Build job is not present in this workspace");
      if (this.active?.job === job) { job.status = "stopping"; job.message = "Stopping build"; this.active.abort.abort(); }
      return this.observe();
    }
    if (this.active) throw new Error("A build is already running in this workspace");
    if (this.blocked) throw new Error("Previous build cleanup could not be confirmed; restart the core before another build");
    const started = this.now(), abort = new AbortController();
    const job: TargetBuildJob = { id: randomUUID(), target: request.target, status: "running", startedAt: new Date(started).toISOString(),
      elapsedMs: 0, message: "Starting Bazel", output: "", cleanup: "pending" };
    this.jobs = [job, ...this.jobs].slice(0, 20);
    const active = { job, abort, pending: Promise.resolve(), started };
    this.active = active;
    active.pending = Promise.resolve().then(() => this.executor.run(job.target, abort.signal, (message) => {
      if (this.active === active && job.status === "running") job.message = message.slice(0, 512);
    })).then((result) => {
      job.cleanup = result.cleanup; this.blocked ||= result.cleanup !== "confirmed";
      job.exitCode = result.exitCode; job.output = result.output;
      job.status = result.cleanup !== "confirmed" ? "failed" : abort.signal.aborted ? "cancelled" : result.exitCode === 0 && !result.error ? "succeeded" : "failed";
      job.message = result.cleanup !== "confirmed" ? "Build stopped; process cleanup needs attention" : job.status === "cancelled" ? "Build cancelled" : job.status === "succeeded" ? "Build complete" : result.error ?? `Bazel exited with ${result.exitCode ?? "no result"}`;
    }, (error) => {
      // Only pre-launch/configuration failures may reject. The collector returns
      // explicit unknown cleanup after any owned process was launched.
      job.cleanup = "confirmed"; job.status = abort.signal.aborted ? "cancelled" : "failed";
      job.message = (error instanceof Error ? error.message : "Build failed to start").slice(0, 512);
    }).finally(() => {
      job.finishedAt = new Date(this.now()).toISOString(); job.elapsedMs = Math.max(0, this.now() - started);
      if (this.active === active) this.active = undefined;
    });
    return this.observe();
  }

  dispose(): Promise<void> {
    return this.closing ??= (async () => {
      this.closed = true;
      this.active?.abort.abort();
      await this.active?.pending;
      if (this.blocked) throw new Error("Build process cleanup could not be confirmed");
      await this.executor.dispose();
    })();
  }
}
