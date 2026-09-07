// @vitest-environment node
import { describe, expect, it } from "vitest";
import { composeContext, indexCapture, indexService, type ContextObservations } from "../app/renderer/context/compose";
import { RealWorkspaceProvider } from "../core/provider";
import { contextDependencies } from "./context-fixture";
import { fileBuildTargets } from "../app/renderer/repository/build-view";
import type { ContextSubject } from "../protocol/context";

async function setup(path: string) {
  const provider = await RealWorkspaceProvider.create("/unused", contextDependencies); await provider.startReconciliation(() => undefined);
  const snapshot = provider.snapshot(); provider.dispose();
  const subject: ContextSubject = { repositoryId: snapshot.project.id, worldId: snapshot.world.id, kind: "file", path };
  const input: ContextObservations = { snapshot, service: indexService(snapshot.serviceContext), capture: indexCapture(undefined), realm: "realm", session: "session", ready: true,
    files: [{ path, content: "source", savedContent: "source", revision: "c".repeat(64), status: "saved", message: "Watching", contextRead: { revision: "c".repeat(64), receivedAt: "2026-09-07T03:01:00.000Z", realm: "realm", session: "session" } }] };
  return { subject, input };
}
describe("exact Context composition", () => {
  it("distinguishes ordinary, implementation, provided and required declarations", async () => {
    for (const [path, labels] of [["core/files.ts", []], ["example/fraudcheck.ts", ["Implementation member of"]], ["example/fraudcheck.proto", ["Implementation member of", "Declares provided interface"]], ["example/payments.proto", ["Declares required interface"]]] as const) {
      const { subject, input } = await setup(path); const sections = composeContext(subject, input), service = sections.find((item) => item.id === "services")!;
      expect(service.rows.filter((row) => ["Implementation member of", "Declares provided interface", "Declares required interface"].includes(row.label)).map((row) => row.label)).toEqual(labels);
      expect(sections.find((item) => item.id === "source")?.rows[0]?.value).toBe(path);
      if (!labels.length) expect(service.notice).toMatch(/other service coverage unavailable/);
    }
  });
  it("preserves independent receipts and never treats unavailable, failed or old-core inputs as green", async () => {
    const { subject, input } = await setup("example/fraudcheck.ts");
    const freshness = () => composeContext(subject, input).find((item) => item.id === "services")?.evidence?.freshness;
    expect(freshness()).toBe("current");
    input.files[0]!.content = "unsaved";
    expect(composeContext(subject, input).find((item) => item.id === "source")?.notice).toMatch(/not represented/);
    expect(freshness()).toBe("current"); // Disk build, with separate buffer warning.
    input.snapshot.revisions.working.evidence = "unavailable"; expect(freshness()).toBe("retained");
    input.snapshot.revisions.working.evidence = "observed"; input.snapshot.reconciliation.status = "red"; expect(freshness()).toBe("retained");
    input.snapshot.reconciliation.status = "green"; input.session = "restored"; expect(freshness()).toBe("retained");
    const source = composeContext(subject, input).find((item) => item.id === "source")!;
    expect(source.evidence).toMatchObject({ freshness: "retained", observedAt: "2026-09-07T03:01:00.000Z", timeBasis: "client receipt" });
    input.session = "session"; input.files[0]!.status = "error"; expect(freshness()).toBe("retained");
  });
  it("does not fill B from A or another repository and handles old optional snapshots honestly", async () => {
    const { subject, input } = await setup("example/fraudcheck.ts");
    const b = { ...subject, kind: "file" as const, path: "core/files.ts" };
    expect(composeContext(b, input).find((item) => item.id === "source")?.evidence).toBeUndefined();
    expect(composeContext({ ...subject, repositoryId: "other" }, input)[0]?.id).toBe("unavailable");
    input.service = indexService(undefined);
    expect(composeContext(subject, input).find((item) => item.id === "services")?.notice).toBe("No matching service observation.");
  });
  it("indexes exact capture references once with helper-equivalent semantics and bounded partial display", async () => {
    const { subject, input } = await setup("example/fraudcheck.ts");
    const capture = { repositoryId: subject.repositoryId, revision: "capture-a", command: "bazel query", capturedAt: "2026-09-06T01:00:00.000Z", links: Array.from({ length: 40 }, (_, i) => ({ from: `//example:target${i}`, fromPath: "example", to: "//example:fraudcheck.ts", toPath: "example/fraudcheck.ts" })) };
    input.capture = indexCapture(capture);
    expect(input.capture.paths.get("example/fraudcheck.ts")).toEqual(fileBuildTargets(capture, "example/fraudcheck.ts"));
    const section = composeContext(subject, input).find((item) => item.id === "capture")!;
    expect(section.rows).toHaveLength(32); expect(section.total).toBe(40); expect(section.evidence?.freshness).toBe("CAPTURE");
    expect(indexCapture({ ...capture, links: Array.from({ length: 4097 }, () => capture.links[0]!) }).capture).toBeUndefined();
    expect(indexCapture({ ...capture, command: "x".repeat(513) }).capture).toBeUndefined();
    expect(indexService(undefined).paths.size).toBe(0);
  });
});
