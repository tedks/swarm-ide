# Show real Bazel milestones while building

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An explicit service build already writes a private Bazel Build Event Protocol
(BEP) JSON-lines file. Read new complete lines while the process runs and show a
bounded, throttled latest milestone in the existing job message. Keep running
progress indeterminate; process exit, artifact validation and matching source
fingerprints alone still decide success. There is no new event platform or UI.

## Progress

- [x] Confirmed current `runBazel` writes BEP but only reads it after process exit.
- [x] Confirmed official BEP event shapes and coordinated BuildResources ownership.
- [ ] Add a bounded incremental file reader and optional builder progress callback.
- [ ] Prove chunk handling, live delivery, throttling, late-event fencing and cleanup.
- [ ] Native review, focused local checks, pushed stacked PR and handoff.

## Context and Orientation

`core/provider.ts` starts the explicit fixed service-artifact build, then checks
its BEP output path and input fingerprints. `ProviderDependencies.build` is the
testable process seam. An optional second callback reports only message text.
`startReconciliation` publishes `job.changed` only for its current attempt and
epoch and a still-running matching job. The Activity UI owner already renders
job.message and indeterminate zero progress; no renderer changes are needed here.

## Assumptions and Failure Modes

The file belongs to one owned private build directory and is append-only. Missing
file at startup is normal. Partial lines and UTF-8 bytes wait for completion.
Malformed, replaced, truncated, nonregular or oversized files stop telemetry
without granting success or bypassing the strict final artifact reader. Advisory
output must be bounded and stripped of terminal control sequences. Late messages
from cancelled/superseded/disposed attempts must not mutate the current job.

## Plan of Work

Create `core/build-progress.ts` for a bounded complete-line decoder and a
nonoverlapping file-read timer. Read only newly appended bytes from a validated
regular file, using at most 4 MiB per attempt and a 256 KiB incomplete-line bound.
Emit at most one latest changed message per 250 ms sample plus final drain.
Support configured/completed target, test and stdout/stderr progress events;
ignore command-line/configuration/environment payloads. Stop and drain the reader
before the build's temporary-directory removal, even if process execution fails.

Extend the builder's optional callback, and fence its job message updates by
attempt, epoch, disposed state and exact running job ID. Do not change process
launch flags, invoke more builds or assign percentages from event counts.

## Concrete Steps and Validation

Work only in the designated usability-continuous-build worktree, on a new
`feature/build-progress-milestones` branch stacked above ready PR108. Add a focused
Bazel target under tools/build-graph that runs build-progress/provider tests and
both TypeScript checks. Run it via `nix develop --command bazel test --jobs=3`.
Use one finite real Bazel invocation for actual streaming evidence if practical;
distinguish it from controlled file/bridge tests. No physical GUI automation,
shared preview writes, broad suites or foreign review cycles.

## Decision Log

Use the existing BEP JSON file rather than parsing terminal output or introducing
a remote Build Event Service. Official sources:
https://bazel.build/remote/bep and Bazel 7.6.0's build_event_stream.proto.
Keep telemetry failures separate from final build authority. Use a stacked PR so
the reviewed automatic query increment remains independently landable.

## Idempotence and Recovery

No persistent reader or replay queue. Each build owns one reader; stop is
idempotent and waits for in-flight reads before cleanup. Keep branch, worktree and
evidence. ROOT normally merges/adopts; this branch never edits App or master.

## Interfaces and Dependencies

`build(workspaceRoot, onProgress?)` remains compatible with existing fake builders.
The callback receives one sanitized bounded human message. `job.changed` and
existing job.message carry progress; no protocol version or UI API changes.

## Surprises & Discoveries

The versioned documentation URL returned 404, so event field spelling was checked
against the pinned Bazel 7.6.0 protobuf source. BEP target completion does not mean
the whole build or its tests succeeded. No progress denominator is promised.

## Outcomes & Retrospective

Implementation pending. Scope is one existing explicit build path, not external
agent builds, generic test discovery or automatic binary builds.
