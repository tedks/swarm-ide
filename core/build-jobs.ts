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
      if (this.active?.job === job) { job.status = "stopping"; job.message = job.operation === "test" ? "Stopping tests" : "Stopping build"; this.active.abort.abort(); }
      return this.observe();
    }
    if (this.active) throw new Error("A build or test job is already running in this workspace");
    if (this.blocked) throw new Error("Previous job cleanup could not be confirmed; restart the core before another build or test");
    const started = this.now(), abort = new AbortController(), operation = request.operation ?? "build";
    const activity = operation === "test" ? "Tests" : "Build";
    const job: TargetBuildJob = { id: randomUUID(), target: request.target, operation, status: "running", startedAt: new Date(started).toISOString(),
      elapsedMs: 0, message: operation === "test" ? "Starting Bazel tests" : "Starting Bazel", output: "", cleanup: "pending" };
    this.jobs = [job, ...this.jobs].slice(0, 20);
    const active = { job, abort, pending: Promise.resolve(), started };
    this.active = active;
    active.pending = Promise.resolve().then(() => this.executor.run(job.target, abort.signal, (message) => {
      if (this.active === active && job.status === "running") job.message = message.slice(0, 512);
    }, operation)).then((result) => {
      job.cleanup = result.cleanup; this.blocked ||= result.cleanup !== "confirmed";
      job.exitCode = result.exitCode; job.output = result.output;
      job.status = result.cleanup !== "confirmed" ? "failed" : abort.signal.aborted ? "cancelled" : result.exitCode === 0 && !result.error ? "succeeded" : "failed";
      const failure = result.error ?? (operation === "test" && result.exitCode === 4 ? "no tests were found for the selected target" : `Bazel exited with ${result.exitCode ?? "no result"}`);
      job.message = (result.cleanup !== "confirmed" ? `${activity} stopped; process cleanup needs attention` : job.status === "cancelled" ? `${activity} cancelled` :
        job.status === "succeeded" ? operation === "test" ? "Tests passed" : "Build complete" : operation === "test" ? `Tests failed: ${failure}` : failure).slice(0, 512);
    }, (error) => {
      // Only pre-launch/configuration failures may reject. The collector returns
      // explicit unknown cleanup after any owned process was launched.
      job.cleanup = "confirmed"; job.status = abort.signal.aborted ? "cancelled" : "failed";
      const failure = error instanceof Error ? error.message : `${activity} failed to start`;
      job.message = (job.status === "cancelled" ? `${activity} cancelled` : operation === "test" ? `Tests failed: ${failure}` : failure).slice(0, 512);
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
