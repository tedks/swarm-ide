// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { composeContext, indexCapture, indexService, type ContextObservations } from "../app/renderer/context/compose";
import { ContextPane } from "../app/renderer/context/ContextPane";
import { GlobalContext } from "../app/renderer/context/GlobalContext";
import { illustrativeLatency } from "../app/renderer/context/latency";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";
import type { ContextSubject } from "../protocol/context";

afterEach(cleanup);
function graph(): BuildLinkSnapshot {
  const targets: NonNullable<BuildLinkSnapshot["targets"]> = [
    { label: "//src:entry.ts", path: "src/entry.ts", kind: "source" },
    { label: "//src:other.ts", path: "src/other.ts", kind: "source" },
    ...["direct", "upper", "top", "generator", "generatedConsumer", "unrelated"].map((name) => ({ label: `//:${name}`, path: "", kind: "rule" as const })),
    { label: "//:generated.txt", path: "generated.txt", kind: "generated" },
    { label: "@external//:unresolved", path: null, kind: "unresolved" },
  ];
  const pairs = [["//:direct", "//src:entry.ts"], ["//:upper", "//:direct"], ["//:top", "//:upper"], ["//:top", "//:direct"],
    ["//:direct", "//:top"], ["//:generator", "//src:entry.ts"], ["//:generated.txt", "//:generator"], ["//:generatedConsumer", "//:generated.txt"],
    ["//:direct", "//:unrelated"], ["//:unrelated", "//src:other.ts"], ["@external//:unresolved", "//:direct"]];
  const edges = pairs.map(([from, to]) => ({ from: from!, to: to! }));
  const paths = new Map(targets.map((target) => [target.label, target.path]));
  return { repositoryId: "test", revision: "observed", command: "bazel query //...:*", capturedAt: "2026-09-07T12:00:00Z", targets, graphEdges: edges,
    observation: { status: "current", coverage: "bounded query", complete: true },
    links: edges.filter((edge) => paths.get(edge.from) !== null && paths.get(edge.to) !== null).map((edge) => ({ ...edge, fromPath: paths.get(edge.from)!, toPath: paths.get(edge.to)! })) };
}
function input() {
  const snapshot = initialSnapshot(); snapshot.project.id = "test";
  snapshot.revisions.working = { id: "a".repeat(64), fingerprint: "a".repeat(64), evidence: "observed" };
  snapshot.revisions.built = { id: "b".repeat(64), sourceFingerprint: "a".repeat(64) };
  snapshot.revisions.deployed = { id: "", buildId: "", environment: "not configured" };
  const subject: ContextSubject = { kind: "file", path: "src/entry.ts", repositoryId: "test", worldId: snapshot.world.id };
  const observations: ContextObservations = { snapshot, files: [{ path: subject.path, content: "// @swarm-demo-latency operations\n", savedContent: "// @swarm-demo-latency operations\n", revision: "c".repeat(64), status: "saved", message: "Ready",
    contextRead: { revision: "c".repeat(64), receivedAt: "2026-09-07T12:00:00Z", realm: "realm", session: "session" } }],
    service: indexService(undefined), capture: indexCapture(graph(), snapshot.world.id), realm: "realm", session: "session", ready: true };
  return { observations, subject };
}
describe("bounded Context instruments", () => {
  it("does not infer illustrative latency from a source path or build target", () => {
    const { observations, subject } = input();
    const file = { ...observations.files[0]!, savedContent: "export const operation = () => undefined;" };
    expect(illustrativeLatency(subject, file, ["//src:operations"])).toBeUndefined();
    expect(illustrativeLatency({ ...subject, kind: "directory", path: "src" }, observations.files[0], [])).toBeUndefined();
  });
  it("hides only the Repository reader disclosure while retaining directory facts, notices and other evidence", () => {
    const { observations, subject } = input();
    const source = composeContext(subject, observations).find((section) => section.id === "source")!;
    const directory = { ...source, id: "directory", title: "Directory observation",
      rows: [{ label: "Captured entries", value: "23" }], notice: "Directory read failed; showing retained entries.",
      evidence: { ...source.evidence!, provider: "Repository reader", revisionKind: "directory" as const, freshness: "retained" as const } };
    const view = render(<ContextPane subject={{ ...subject, kind: "directory", path: "src" }} sections={[directory, source]} onOpen={() => {}} />);
    expect(screen.queryByText("Evidence · Repository reader")).toBeNull();
    expect(screen.getByText("Directory observation")).toBeTruthy();
    expect(screen.getByText("Captured entries")).toBeTruthy(); expect(screen.getByText("23")).toBeTruthy();
    expect(screen.getByText(directory.notice)).toBeTruthy();
    expect(view.container.querySelector('[data-context-section="directory"] [data-context-freshness="retained"]')).toBeTruthy();
    expect(screen.getByText("Evidence · Source broker")).toBeTruthy();
    expect(directory.evidence.provider).toBe("Repository reader"); expect(directory.evidence.origin).toBe(source.evidence!.origin);
    view.rerender(<ContextPane subject={subject} sections={[{ ...directory, evidence: { ...directory.evidence, provider: "Another reader" } }]} onOpen={() => {}} />);
    expect(screen.getByText("Evidence · Another reader")).toBeTruthy();
  });
  it.each(["unknown", "conflict"])("keeps actionable %s source diagnostics alongside dirty-buffer warning", (status) => {
    const { observations, subject } = input();
    observations.files[0]!.content += "unsaved";
    observations.files[0]!.status = status;
    observations.files[0]!.message = "Check disk before retrying; no write will be replayed.";
    const source = composeContext(subject, observations).find((s) => s.id === "source")!;
    expect(source.notice).toContain("Check disk before retrying; no write will be replayed.");
    expect(source.notice).toContain("Unsaved buffer");
    expect(source.evidence?.freshness).toBe("retained");
  });
  it("separates direct references from reverse transitive inclusion through cycles, diamonds and generated outputs", () => {
    const index = indexCapture(graph());
    const result = index.forFile("src/entry.ts");
    expect(result.direct).toEqual(["//:direct", "//:generator"]);
    expect(result.indirect).toEqual(["//:generatedConsumer", "//:top", "//:upper"]);
    expect(index.forFile("src/entry.ts")).toBe(result); // Cursor/edit rerenders do not traverse again.
    expect(index.forFile("src/absent.ts")).toEqual({ direct: [], indirect: [] });
    expect(result.indirect).not.toContain("//:unrelated"); expect(result.indirect).not.toContain("@external//:unresolved");
  });
  it("fences foreign repository/world and preserves retained/partial coverage without claiming no ownership", () => {
    const { subject, observations } = input();
    const capture = graph(); capture.observation = { status: "stale", complete: false, coverage: "Only first 2000 targets returned" };
    observations.capture = indexCapture(capture, subject.worldId);
    const sections = composeContext(subject, observations);
    expect(sections.find((s) => s.id === "capture")?.evidence).toMatchObject({ freshness: "retained", coverage: "Only first 2000 targets returned" });
    expect(sections.find((s) => s.id === "capture")?.notice).toMatch(/Partial/);
    observations.capture = indexCapture(capture, "another-world");
    expect(composeContext(subject, observations).find((s) => s.id === "capture")?.rows).toEqual([]);
    observations.capture = indexCapture({ ...capture, repositoryId: "another-repository" }, subject.worldId);
    expect(composeContext(subject, observations).find((s) => s.id === "indirect-targets")?.rows).toEqual([]);
  });
  it("retains total counts while clipping both target instruments and rejects over-budget graphs", () => {
    const { subject, observations } = input(), capture = graph();
    for (let i = 0; i < 40; i++) { capture.targets!.push({ label: `//:more${i}`, kind: "rule", path: "" }); capture.graphEdges!.push({ from: `//:more${i}`, to: "//:top" }); }
    observations.capture = indexCapture(capture);
    const indirect = composeContext(subject, observations).find((s) => s.id === "indirect-targets")!;
    expect(indirect.total).toBe(43); expect(indirect.rows).toHaveLength(32);
    expect(indexCapture({ ...capture, graphEdges: Array.from({ length: 8001 }, () => capture.graphEdges![0]!) }).capture).toBeUndefined();
  });
  it("mounts useful tables and compact empty contrasts without source checksum/buffer/provider clutter", () => {
    const { observations, subject } = input();
    const view = render(<><GlobalContext snapshot={observations.snapshot} ready /><ContextPane subject={subject} sections={composeContext(subject, observations)} onOpen={() => {}} /></>);
    expect(screen.getByRole("region", { name: "Context Global" })).toBeTruthy();
    const table = screen.getByRole("table", { name: "Illustrative latency in milliseconds" });
    expect(within(table).getByText("31.6")).toBeTruthy(); expect(screen.getByText("Illustrative")).toBeTruthy();
    expect(screen.getByText(/12,000 example requests/)).toBeTruthy();
    expect(document.querySelector("[data-context-section='capture']")?.textContent).toContain("//:direct");
    expect(document.querySelector("[data-context-section='indirect-targets']")?.textContent).toContain("//:generatedConsumer");
    for (const absent of ["Providers not available", "Local editor buffer", "SHA-256", "c".repeat(64)]) expect(document.body.textContent).not.toContain(absent);
    const other: ContextSubject = { ...subject, kind: "file", path: "README.md" };
    view.rerender(<><GlobalContext snapshot={observations.snapshot} ready /><ContextPane subject={other} sections={composeContext(other, observations)} onOpen={() => {}} /></>);
    expect(screen.queryByRole("table")).toBeNull(); expect(screen.getAllByText("No targets")).toHaveLength(2);
    expect(document.querySelector("[data-context-section='deployments']")?.textContent).toContain("No services");
    expect(screen.getByRole("region", { name: "Context Global" })).toBeTruthy();
    view.rerender(<GlobalContext snapshot={observations.snapshot} ready />);
    expect(screen.getByText("Context · Global")).toBeTruthy(); // Independent of file, service or task selection.
  });
  it("does not promote unsaved tags, service declarations, or a global deployment into file telemetry/deployment facts", () => {
    const { observations, subject } = input();
    observations.files[0]!.savedContent = "no tag";
    observations.snapshot.revisions.deployed = { id: "release-2", buildId: observations.snapshot.revisions.built.id, environment: "production" };
    const sections = composeContext(subject, observations);
    expect(sections.find((s) => s.id === "latency")?.latency).toBeUndefined();
    expect(sections.find((s) => s.id === "deployments")?.rows).toEqual([]);
    expect(sections.find((s) => s.id === "source")?.notice).toMatch(/Unsaved/);
    render(<GlobalContext snapshot={observations.snapshot} ready={false} />);
    expect(screen.getByText("Retained source")).toBeTruthy(); expect(screen.getByText("Retained build")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy(); expect(screen.getByText(/Recorded deployment/)).toBeTruthy();
  });
});
