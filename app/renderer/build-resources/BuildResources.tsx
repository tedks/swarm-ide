import { useId, useState } from "react";
import type { Job } from "../../../protocol/schema";
import type { BuildJobsObservation, TargetBuildJob } from "../../../protocol/build-jobs";
import { EXAMPLE_BUILD_PROFILE, samplePoints, summarizeSamples } from "./stats";
import "./build-resources.css";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function Distribution({ label, samples, unit }: { label: string; samples: readonly number[]; unit: string }) {
  const summary = summarizeSamples(samples);
  if (!summary) return <p className="resource-muted">{label} · No samples</p>;
  return <section className={`resource-distribution resource-${label.toLowerCase()}`} aria-label={`Illustrative ${label} distribution`}>
    <header><strong>{label}</strong><span>{unit === "%" ? "% · 100% = 1 core" : "MiB · resident memory"}</span></header>
    <div className="resource-distribution-body">
      <svg viewBox="0 0 110 28" role="img" aria-label={`${label}: ${summary.count} illustrative samples, 0 to ${summary.peak} ${unit}, 5-second spacing`}>
        <path className="resource-baseline" d="M0 26H110" />
        <polyline points={samplePoints(samples)} />
      </svg>
      <dl>
        <div><dt>Median</dt><dd>{number.format(summary.median)}<small>{unit}</small></dd></div>
        <div><dt>p95</dt><dd>{number.format(summary.p95)}<small>{unit}</small></dd></div>
        <div><dt>Peak</dt><dd>{number.format(summary.peak)}<small>{unit}</small></dd></div>
      </dl>
    </div>
  </section>;
}

function JobCard({ job }: { job: Job }) {
  // The current contract has no sample timestamps/provenance. The real provider
  // sends all-zero placeholders; fixtures can send nonzero values. Show neither
  // as verified live telemetry, and never derive percentiles from repaint events.
  const hasValues = job.resources.cpuPercent > 0 || job.resources.memoryMiB > 0;
  const status = { queued: "Queued", running: "Running", failed: "Failed", succeeded: "Complete" }[job.status];
  const indeterminate = job.status === "running" && job.progress === 0;
  return <article className={`resource-job status-${job.status === "failed" ? "red" : job.status === "succeeded" ? "green" : "yellow"}`} data-job-id={job.id}>
    <header><strong title={job.label}>{job.label}</strong><span>{status}</span></header>
    <div className="resource-progress-row">
      <progress value={indeterminate ? undefined : job.progress} max={1} aria-label={`${job.label} progress`} />
      <span>{indeterminate ? "Progress unavailable" : `${Math.round(job.progress * 100)}%`}</span>
    </div>
    {job.message ? <p className="resource-job-message">{job.message}</p> : null}
    {hasValues ? <details className="resource-snapshot"><summary>Unverified resource snapshot</summary>
      <dl><div><dt>CPU</dt><dd>{number.format(job.resources.cpuPercent)}%</dd></div><div><dt>Memory</dt><dd>{number.format(job.resources.memoryMiB)} MiB</dd></div></dl>
      <p>Single provider values, not a distribution. Source, observation time and CPU normalization are not supplied; these may be fixture values.</p>
    </details> : <span className="resource-muted">No resource samples</span>}
  </article>;
}

function TargetJobCard({ job, onCancel }: { job: TargetBuildJob; onCancel?: (id: string) => void }) {
  const active = job.status === "running" || job.status === "stopping";
  const status = { running: "Running", stopping: "Stopping", succeeded: "Complete", failed: "Failed", cancelled: "Cancelled" }[job.status];
  return <article className={`resource-job status-${job.status === "failed" ? "red" : job.status === "succeeded" ? "green" : "yellow"}`} data-target-build-id={job.id}>
    <header><strong title={job.target}>{job.target}</strong><span>{status}</span></header>
    <div className="resource-progress-row">{active ? <progress aria-label={`${job.target} build in progress`} /> : null}<span>{number.format(job.elapsedMs / 1000)} s</span>
      <time dateTime={job.startedAt} title={new Date(job.startedAt).toLocaleString()}>{new Date(job.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      {onCancel && active ? <button type="button" disabled={job.status === "stopping"} onClick={() => onCancel(job.id)}>Stop</button> : null}</div>
    <p className="resource-job-message">{job.message}</p>
    {job.output ? <details><summary>Build output</summary><pre className="resource-build-output">{job.output}</pre></details> : null}
  </article>;
}

export function BuildResources({ jobs, targetBuilds, buildError, onCancel }: { jobs: readonly Job[]; targetBuilds?: BuildJobsObservation; buildError?: string; onCancel?: (id: string) => void }) {
  const [example, setExample] = useState(false);
  const id = useId();
  const rank = { running: 0, queued: 1, failed: 2, succeeded: 3 };
  const ordered = [...jobs].sort((a, b) => rank[a.status] - rank[b.status]);
  const summary = (["running", "queued", "failed", "succeeded"] as const).map((state) => {
    const count = jobs.filter((job) => job.status === state).length;
    return count ? `${count} ${state === "succeeded" ? "complete" : state}` : null;
  }).filter(Boolean).join(" · ");
  // React Flow's input guard also recognizes .nokey. Without it,
  // its window-level Space pan shortcut cancels native <summary> activation.
  return <div className="build-resources nokey">
    {buildError ? <p role="alert">{buildError}</p> : null}
    {targetBuilds?.jobs.length ? <div className="resource-jobs" aria-label="Selected target builds">{targetBuilds.jobs.map((job) => <TargetJobCard key={job.id} job={job} onCancel={onCancel} />)}</div> : null}
    {jobs.length ? <><p className="resource-job-summary" aria-label="Build job counts">{summary}</p><div className="resource-jobs">{ordered.map((job) => <JobCard job={job} key={job.id} />)}</div></>
      : !targetBuilds?.jobs.length ? <p className="resource-idle">No build jobs</p> : null}
    <button type="button" className="resource-example-toggle" aria-expanded={example} aria-controls={id} onClick={() => setExample((open) => !open)}>
      <span aria-hidden="true">{example ? "▾" : "▸"}</span> Example profile
      <small>illustrative</small>
    </button>
    {example ? <section id={id} className="resource-example" aria-label="Illustrative Bazel profile">
      <header className="resource-example-heading"><strong>Bazel profile</strong><code>{EXAMPLE_BUILD_PROFILE.target}</code></header>
      <p className="resource-example-basis">12 synthetic samples · 60 s window · every 5 s</p>
      <Distribution label="CPU" unit="%" samples={EXAMPLE_BUILD_PROFILE.cpuPercent} />
      <Distribution label="Memory" unit="MiB" samples={EXAMPLE_BUILD_PROFILE.memoryMiB} />
      <details className="resource-profile-basis"><summary>Profile basis</summary>
        <p>Illustrative only, not the current job or repository. The target is a fictional example, not a build action.</p>
        <p>12 authored samples at 2.5, 7.5, …, 57.5 seconds. CPU is summed across a hypothetical Bazel process and its actions: 100% equals one logical core, not the whole host. Memory is summed resident memory (RSS); one MiB is 1,048,576 bytes, and shared pages may be counted more than once.</p>
        <p>Median averages the middle two values. p95 uses nearest rank (ceil(0.95 × n)); with 12 samples p95 equals peak. Lines connect sample values over time from a zero baseline, scaled independently for each metric. No smoothing or inferred samples.</p>
        <p>CPU samples (%): {EXAMPLE_BUILD_PROFILE.cpuPercent.join(", ")}.</p>
        <p>Memory samples (MiB): {EXAMPLE_BUILD_PROFILE.memoryMiB.join(", ")}.</p>
        <p>Current job telemetry is separate. Zero-filled resource placeholders are not evidence of measured idle usage.</p>
      </details>
    </section> : null}
  </div>;
}
