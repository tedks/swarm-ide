import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ChangelogBundleSchema, ChangelogDocumentSchema, ChangelogRequestSchema, ChangelogResultSchema, JOURNAL_MAX_BYTES } from "../protocol/changelog";
import { journalDigest, journalGit, parseJournalPair, readChangelog, readJournalFile } from "../core/changelog";
import { exportJournalBundle, materializeJournal, writeJournalArtifact } from "../core/changelog-authoring";
import { syntheticJournal } from "./journal-fixture";
import { seedJournalProof } from "../tools/demo-journal/seed";

const owned: string[] = [];
afterEach(async () => { await Promise.all(owned.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function scratch() { const root = await mkdtemp(join(tmpdir(), "journal-test-")); owned.push(root); return root; }

describe("Journal contract and evidence boundary", () => {
  it("accepts a labelled synthetic pair and rejects an unknown claim citation", () => {
    const { bytes, document } = syntheticJournal();
    expect(parseJournalPair(bytes, JSON.stringify(document)).document.entries).toHaveLength(1);
    document.entries[0].outcome = { text: "Unsupported", evidenceIds: ["missing"] };
    expect(() => parseJournalPair(bytes, JSON.stringify(document))).toThrow("Unknown Journal evidence");
  });
  it("rejects stale exact-byte digest, old generation time and oversized inputs", () => {
    const { bytes, document } = syntheticJournal();
    expect(() => parseJournalPair(`${bytes} `, JSON.stringify(document))).toThrow("stale");
    document.generatedAt = "2026-09-06T00:00:00Z";
    expect(() => parseJournalPair(bytes, JSON.stringify(document))).toThrow("predates");
    expect(() => parseJournalPair(" ".repeat(JOURNAL_MAX_BYTES + 1), "{}" )).toThrow("byte bound");
  });
  it.each(["../secret", ".git/config", "foo/../../secret", "/absolute", "x\\y", "x\u0000y"])("rejects source path %s", (path) => {
    const { bundle } = syntheticJournal(); bundle.evidence[0].paths = [path];
    expect(ChangelogBundleSchema.safeParse(bundle).success).toBe(false);
  });
  it("rejects extra command authority, duplicate IDs and uncorrelated coverage", () => {
    expect(ChangelogRequestSchema.safeParse({ protocolVersion: 7, type: "changelog.read", requestId: "a", repositoryId: "r", path: "/secret" }).success).toBe(false);
    const { bundle, document, result } = syntheticJournal();
    bundle.evidence.push(bundle.evidence[0]); expect(ChangelogBundleSchema.safeParse(bundle).success).toBe(false);
    document.entries.push(document.entries[0]); expect(ChangelogDocumentSchema.safeParse(document).success).toBe(false);
    result.state = "recorded-ancestor"; expect(ChangelogResultSchema.safeParse(result).success).toBe(false);
  });
});

describe("Journal contained reads and operational authoring", () => {
  it("exports two ACTUAL disposable Git revisions and validates only a matching candidate", async () => {
    const parent = await scratch(), fixture = await seedJournalProof(parent);
    const first = await readFile(join(parent, "proof-first-bundle.json"), "utf8");
    const second = await readFile(join(parent, "proof-second-bundle.json"), "utf8");
    expect(ChangelogBundleSchema.parse(JSON.parse(first)).evidence).toHaveLength(1);
    const bundle = ChangelogBundleSchema.parse(JSON.parse(second));
    expect(bundle.evidence).toHaveLength(2); expect(bundle.evidence[1].paths).toEqual(["src/receipt.ts"]);
    const document = syntheticJournal().document; document.inputDigest = journalDigest(first); document.generatedAt = new Date().toISOString();
    for (const claim of [document.entries[0].intent, document.entries[0].outcome, document.entries[0].decision]) claim.evidenceIds = [JSON.parse(first).evidence[0].id];
    await writeFile(join(fixture.root, ".swarm/changelog-candidate.json"), JSON.stringify(document));
    await materializeJournal(fixture.root);
    const recorded = await readChangelog(fixture.root, "repo:proof");
    expect(recorded.state).toBe("recorded-ancestor");
    await writeJournalArtifact(fixture.root, "changelog-bundle.json", second);
    await expect(materializeJournal(fixture.root)).rejects.toThrow("stale");
    expect(await readJournalFile(fixture.root, ".swarm/changelog.json")).toBe(JSON.stringify(document));
    await expect(readChangelog(fixture.root, "repo:proof")).rejects.toThrow("stale");
  });
  it("refuses symlinks, special files and redirected output directories", async () => {
    const root = await scratch(), outside = await scratch();
    await mkdir(join(root, ".swarm")); await writeFile(join(outside, "secret"), "secret");
    await symlink(join(outside, "secret"), join(root, ".swarm/changelog.json"));
    await expect(readJournalFile(root, ".swarm/changelog.json")).rejects.toThrow();
    execFileSync("mkfifo", [join(root, ".swarm/fifo")]);
    await expect(readJournalFile(root, ".swarm/fifo")).rejects.toThrow();
    const redirected = await scratch(); await symlink(outside, join(redirected, ".swarm"));
    await expect(writeJournalArtifact(redirected, "changelog.json", "{}")).rejects.toThrow();
    await expect(readFile(join(outside, "changelog.json"))).rejects.toThrow();
  });
  it("rejects forged Git report kind, nonliteral revision and unrelated history", async () => {
    const parent = await scratch(), a = await seedJournalProof(parent);
    const { bundle } = syntheticJournal();
    bundle.evidence[0].kind = "git-observation";
    await writeFile(join(a.root, ".swarm/changelog-reports.json"), JSON.stringify(bundle.evidence));
    await expect(exportJournalBundle(a.root, a.from, a.to)).rejects.toThrow();
    await expect(exportJournalBundle(a.root, "HEAD;touch injected", a.to)).rejects.toThrow();
    await expect(journalGit(a.root, ["merge-base", "--is-ancestor", "f".repeat(40), "HEAD"])).rejects.toThrow();
  });
  it("aborts a Git observation without producing a reply", async () => {
    const root = await scratch(); const controller = new AbortController(); controller.abort();
    await expect(journalGit(root, ["rev-parse", "HEAD"], controller.signal)).rejects.toThrow();
  });
});
