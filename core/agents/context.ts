import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { agentTaskBytes, formatAgentContextV2, formatRepositoryTask, sameAgentTaskReference,
  TASK_CONTEXT_BYTES, taskUtf8Bytes, type AgentTaskReference, type RepositoryTaskMaterialization } from "../../protocol/agent-task";
import {
  AGENT_LIMITS, AgentCapabilitiesSchema, AgentLinksSchema, AgentPrepareInputSchema,
  PreparedAgentContextSchema, type AgentCapabilities, type AgentError,
  type AgentPrepareInput, type LaunchContext, type PreparedAgentContext,
} from "../../protocol/agents";
import { readCanonicalWorkspaceBytes, WorkspaceFileError } from "../files";
import { computeWorkingWorldFingerprint } from "../fingerprint";
import { TaskReaderError } from "../tasks/git-reader";
import type { AgentOperation } from "./adapter";
import type { AgentContextProvider } from "./context-provider";
import { READ_ONLY_ACCESS, unavailablePolicyCapabilities } from "./policy";

const git = promisify(execFile);
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const PROVENANCE_MARKERS = new Set(["provider://instruction-expansion-unobserved", "provider://effective-configuration-unobserved"]);
export const CONTEXT_OBSERVATION_TIMEOUT_MS = 30_000;
export const CAPABILITY_OBSERVATION_TIMEOUT_MS = 5_000;
type Sources = { instructions: readonly string[]; configuration: readonly string[] };
type Source = LaunchContext["instructionSources"][number];

/** A core-resolved file OR reference-only directory/service. Never renderer cwd.
 * Source links are normalized identifiers, not permission to read their targets.
 */
export interface AgentContextTarget { attachmentPath: string | null; sourcePaths: readonly string[] }
/** Core-only registered metadata authority. Its owner supplies cancellation. */
export interface AgentTaskResolver {
  resolveTask(reference: AgentTaskReference, signal: AbortSignal, deadline: number):
    Promise<{ reference: AgentTaskReference; title: string; description: string }>;
  checkRevision(reference: AgentTaskReference, signal: AbortSignal, deadline: number): Promise<void>;
}
export interface RegisteredAgentContextOptions {
  root: string;
  repositoryId: string;
  worldId: string;
  /** Null means the workspace observer currently cannot establish its identity. */
  workingRevision(): string | null;
  /** Must resolve the focus against the core's registered graph/source mapping.
   * Zero or multiple candidates fail, rather than guessing a working target. */
  resolveFocus(focus: AgentPrepareInput["focus"]): Promise<readonly AgentContextTarget[]>;
  /** Explicitly selected local provenance only. Missing provider expansion is
   * represented as unobserved; absolute/private paths are never read here. */
  provenance(): Promise<Sources>;
  knownParent?(runId: string): Promise<boolean>;
  capabilities?(): Promise<AgentCapabilities>;
  now?(): number;
  taskResolver?: AgentTaskResolver;
}

class ContextFailure extends Error {
  constructor(readonly code: AgentError["code"], message: string) { super(message); }
}
const stale = (message: string): never => { throw new ContextFailure("STALE_CONTEXT", message); };
function normalized(path: string): boolean {
  return AgentLinksSchema.safeParse({ parentRunId: null, task: path, spec: null }).success;
}
function failure(error: unknown, operation: "prepare" | "revalidate"): AgentOperation<never> {
  if (error instanceof ContextFailure) return { ok: false, error: { code: error.code, message: error.message } };
  if (error instanceof WorkspaceFileError && error.code === "FILE_TOO_LARGE") {
    return { ok: false, error: { code: "OUTPUT_LIMIT", message: "The selected disk file exceeds the bounded attachment limit." } };
  }
  if (!(error instanceof WorkspaceFileError)) console.warn(`Agent context ${operation} failed unexpectedly; raw diagnostics withheld`);
  // Do not forward filesystem/Git error text: it can contain private paths/data.
  return { ok: false, error: { code: "STALE_CONTEXT", message: "Launch context could not be safely observed. Refresh after checking the selected file, repository and configuration." } };
}
function rejectGitRedirection(): void {
  if (["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"].some((key) => process.env[key] !== undefined)) {
    stale("Ambient Git redirection is unsupported for a registered agent world.");
  }
}
async function bounded<T>(operation: () => Promise<T>, milliseconds: number, code: AgentError["code"], onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new ContextFailure(code, "Context or policy observation exceeded its bounded deadline."));
      }, milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
function stableSources(sources: Source[]) {
  return sources.map(({ path, digest, observation }) => ({ path, digest, observation }));
}

/** No worker wiring or process execution in E1. One core-owned draft at a time.
 * Readers reuse the existing contained-file broker and working fingerprint.
 * Before/after observations detect changes, not every possible ABA race and
 * not edits after revalidation; a live provider filesystem is never frozen.
 */
export class RegisteredAgentContextProvider implements AgentContextProvider {
  private draft: { serialized: string; input: AgentPrepareInput; evidence: string } | null = null;
  private preparing = false;
  private closed = false;
  private disposal: Promise<void> | undefined;
  private readonly observations = new Set<AbortController>();
  private readonly metadata = new Set<Promise<unknown>>();
  private readonly now: () => number;
  private constructor(private readonly root: string, private readonly options: RegisteredAgentContextOptions) {
    this.now = options.now ?? Date.now;
  }

  static async create(options: RegisteredAgentContextOptions): Promise<RegisteredAgentContextProvider> {
    rejectGitRedirection();
    const root = await realpath(options.root);
    const top = await git("git", ["rev-parse", "--show-toplevel"], { cwd: root, timeout: 5000, maxBuffer: 8192 });
    if (await realpath(top.stdout.trim()) !== root) throw new Error("Agent root must be a registered Git working-tree root");
    return new RegisteredAgentContextProvider(root, { ...options });
  }

  async prepare(untrusted: AgentPrepareInput): Promise<AgentOperation<PreparedAgentContext>> {
    if (this.closed) return failure(new ContextFailure("STALE_CONTEXT", "Context provider is closed."), "prepare");
    if (this.preparing) return { ok: false, error: { code: "BUSY", message: "Another launch context is being prepared." } };
    this.preparing = true;
    try {
      const parsed = AgentPrepareInputSchema.safeParse(untrusted);
      if (!parsed.success) stale("Unsupported or invalid working focus, task or links.");
      this.draft = null;
      const input = parsed.data!;
      if (input.taskReference !== undefined && !this.options.taskResolver) throw new ContextFailure("UNSUPPORTED_CONTROL", "Repository-task context is unavailable.");
      const preparedAt = this.now();
      if (!Number.isFinite(preparedAt)) stale("Context clock could not be observed.");
      const capabilities = await this.capabilities();
      if (this.closed) stale("Context provider is closed.");
      const observation = await this.observe(input);
      const fields = {
        contextVersion: 2 as const, sourceLinks: observation.target.sourcePaths,
        worldId: input.worldId, repositoryId: this.options.repositoryId, root: this.root,
        head: observation.head, workingFingerprint: observation.fingerprint, focus: input.focus,
        taskText: input.taskText, links: input.links, requested: { model: input.model, effort: input.effort },
        attachments: observation.attachments, instructionSources: observation.instructions,
        configurationSources: observation.configuration, diskOnly: true as const, access: READ_ONLY_ACCESS,
        ...(observation.repositoryTask ? { repositoryTask: observation.repositoryTask } : {}),
      };
      const submittedPrompt = formatAgentContextV2(fields);
      const contextHash = digest(submittedPrompt);
      const candidate = PreparedAgentContextSchema.safeParse({
        runId: randomUUID(), contextHash, preparedAt: new Date(preparedAt).toISOString(),
        expiresAt: new Date(preparedAt + AGENT_LIMITS.draftMs).toISOString(),
        launchContext: { ...fields, submittedPrompt, contextHash }, capabilities,
      });
      if (!candidate.success) throw new ContextFailure("OUTPUT_LIMIT", "The launch context exceeds its supported field or total UTF-8 byte bounds.");
      const finishedAt = this.now();
      if (this.closed || !Number.isFinite(finishedAt) || finishedAt < preparedAt || finishedAt >= preparedAt + AGENT_LIMITS.draftMs) stale("Context preparation expired or closed; prepare a fresh draft.");
      this.draft = { serialized: JSON.stringify(candidate.data), input, evidence: observation.evidence };
      return { ok: true, value: candidate.data };
    } catch (error) { return failure(error, "prepare"); }
    finally { this.preparing = false; }
  }

  async revalidate(untrusted: PreparedAgentContext): Promise<AgentOperation<PreparedAgentContext>> {
    try {
      if (this.closed) stale("Context provider is closed.");
      const parsed = PreparedAgentContextSchema.safeParse(untrusted);
      const draft = this.draft;
      if (!parsed.success || !draft || JSON.stringify(parsed.data) !== draft.serialized || this.preparing) {
        stale("Draft is unknown, changed or replaced; prepare it again.");
      }
      const context = parsed.data!;
      const checkTime = () => {
        const now = this.now();
        if (!Number.isFinite(now) || now < Date.parse(context.preparedAt) || now >= Date.parse(context.expiresAt)) stale("Launch draft expired or its clock moved backwards; prepare it again.");
      };
      checkTime();
      const capabilities = await this.capabilities();
      if (this.closed) stale("Context provider is closed.");
      const current = await this.observe(draft!.input);
      if (this.closed || current.evidence !== draft!.evidence || this.draft !== draft) stale("Source, mapping, instructions or configuration changed; refresh the draft.");
      if ([...current.instructions, ...current.configuration].some((source) =>
        !PROVENANCE_MARKERS.has(source.path) && source.observation !== "observed")) stale("Selected local provenance is unreadable or unobserved; resolve it before launch.");
      checkTime();
      if (capabilities.availability !== "available" || capabilities.policy !== "verified-read-only" || !capabilities.controls.launch) {
        return { ok: false, error: capabilities.reason ?? { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Launch policy has not been verified." } };
      }
      if (JSON.stringify(capabilities) !== JSON.stringify(context.capabilities)) stale("Provider capabilities changed; refresh the draft.");
      return { ok: true, value: JSON.parse(draft!.serialized) as PreparedAgentContext };
    } catch (error) { return failure(error, "revalidate"); }
  }

  dispose(): Promise<void> {
    this.closed = true;
    this.draft = null;
    if (this.disposal) return this.disposal;
    // Each promise is registered BEFORE starting the resolver. Expected bounded
    // read/cancellation errors still attest settlement; unexpected cleanup
    // failures must not become successful shutdown evidence.
    this.disposal = Promise.allSettled([...this.metadata]).then((results) => {
      if (results.some((result) => result.status === "rejected" &&
          !(result.reason instanceof TaskReaderError) && !(result.reason instanceof ContextFailure))) {
        throw new Error("Owned task-context metadata work failed during disposal.");
      }
    });
    for (const observation of this.observations) observation.abort();
    return this.disposal;
  }

  private async capabilities(): Promise<AgentCapabilities> {
    try {
      const observed = this.options.capabilities ? await bounded(() => this.options.capabilities!(), CAPABILITY_OBSERVATION_TIMEOUT_MS, "ADAPTER_POLICY_UNAVAILABLE") : unavailablePolicyCapabilities();
      const parsed = AgentCapabilitiesSchema.safeParse(observed);
      if (parsed.success) return parsed.data;
    } catch { /* Probe errors may contain private provider/configuration data. */ }
    throw new ContextFailure("ADAPTER_POLICY_UNAVAILABLE", "Provider policy evidence could not be validated.");
  }

  private async source(path: string): Promise<Source> {
    const before = new Date(this.now()).toISOString();
    if (!normalized(path)) return { path, digest: null, observation: "unobserved", before, after: null };
    try {
      const bytes = await readCanonicalWorkspaceBytes(this.root, path, AGENT_LIMITS.attachmentBytes);
      return { path, digest: digest(bytes), observation: "observed", before, after: new Date(this.now()).toISOString() };
    } catch (error) {
      return { path, digest: null, observation: error instanceof WorkspaceFileError && error.code === "FILE_CHANGED" ? "changing" : "unobserved", before, after: new Date(this.now()).toISOString() };
    }
  }

  private async attachment(path: string, input: AgentPrepareInput): Promise<{ attachments: LaunchContext["attachments"]; fileDigest: string | null }> {
    if (!normalized(path) || (input.focus.path !== undefined && input.focus.path !== path)) stale("Focus does not uniquely identify its canonical source file.");
    const bytes = await readCanonicalWorkspaceBytes(this.root, path, AGENT_LIMITS.attachmentBytes);
    if (bytes.some((byte) => byte < 32 && ![9, 10, 13].includes(byte))) stale("Binary source cannot be attached.");
    // Preserve BOM as actual submitted bytes, unlike TextDecoder's default.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    const lines = text.split("\n").map((line, index, all) => line + (index < all.length - 1 ? "\n" : ""));
    const startLine = input.focus.range?.startLine ?? 1;
    const endLine = input.focus.range?.endLine ?? lines.length;
    if (endLine > lines.length) stale("Selected line range no longer exists on disk.");
    const content = lines.slice(startLine - 1, endLine).join("");
    return { attachments: [{ path, content, digest: digest(content), startLine, endLine }], fileDigest: digest(bytes) };
  }

  private async observe(input: AgentPrepareInput) {
    // This operation only produces local observations: after timeout its late
    // completion cannot publish/replace a draft. It does not cancel arbitrary
    // trusted callbacks or kernel I/O; the contained broker must be nonblocking.
    const controller = new AbortController();
    const deadline = Date.now() + CONTEXT_OBSERVATION_TIMEOUT_MS;
    this.observations.add(controller);
    try {
      return await bounded(() => this.observeDisk(input, controller.signal, deadline),
        CONTEXT_OBSERVATION_TIMEOUT_MS, "STALE_CONTEXT", () => controller.abort());
    } finally { controller.abort(); this.observations.delete(controller); }
  }

  private active(signal: AbortSignal, deadline: number): void {
    if (this.closed || signal.aborted || Date.now() >= deadline) stale("Context observation expired or closed; prepare a fresh draft.");
  }

  private ownMetadata<T>(operation: () => Promise<T>, signal: AbortSignal, deadline: number): Promise<T> {
    this.active(signal, deadline);
    // Deferral makes ownership precede even a reentrant/late resolver start.
    const pending = Promise.resolve().then(() => { this.active(signal, deadline); return operation(); });
    this.metadata.add(pending);
    void pending.then(() => this.metadata.delete(pending), () => this.metadata.delete(pending));
    return pending.then((value) => { this.active(signal, deadline); return value; });
  }

  private async task(input: AgentPrepareInput, signal: AbortSignal, deadline: number): Promise<RepositoryTaskMaterialization | undefined> {
    const reference = input.taskReference;
    if (!reference) return undefined;
    if (!this.options.taskResolver) throw new ContextFailure("UNSUPPORTED_CONTROL", "Repository-task context is unavailable.");
    if (reference.worldId !== this.options.worldId || reference.repositoryId !== this.options.repositoryId) stale("Task does not belong to the registered working repository.");
    let content: string;
    try {
      const resolved = await this.ownMetadata(() => this.options.taskResolver!.resolveTask(structuredClone(reference), signal, deadline), signal, deadline);
      if (!sameAgentTaskReference(reference, resolved.reference)) stale("Task identity changed; refresh and attach it again.");
      content = formatRepositoryTask(reference, resolved.title, resolved.description);
    } catch { return stale("Repository-task context changed or is unavailable. Refresh and attach it again."); }
    const repositoryTask: RepositoryTaskMaterialization = { reference, encoding: "swarm-repository-task-json-v1",
      content, bytes: taskUtf8Bytes(content), digest: digest(content) };
    if (agentTaskBytes(input.taskText, repositoryTask) > TASK_CONTEXT_BYTES) {
      throw new ContextFailure("OUTPUT_LIMIT", "Instructions and attached task exceed the 16 KiB task-context limit.");
    }
    return repositoryTask;
  }

  private async observeDisk(input: AgentPrepareInput, signal: AbortSignal, deadline: number) {
    this.active(signal, deadline);
    rejectGitRedirection();
    if (input.worldId !== this.options.worldId || input.focus.revisionId !== this.options.workingRevision()) stale("Focus is not in the current registered working world.");
    const repositoryTask = await this.task(input, signal, deadline);
    this.active(signal, deadline);
    if (input.links.parentRunId && !(await this.options.knownParent?.(input.links.parentRunId))) stale("Parent run is not known in this local world.");
    if (await realpath(this.options.root) !== this.root) stale("Registered root changed identity.");
    const fingerprint = await computeWorkingWorldFingerprint(this.root);
    if (fingerprint !== input.focus.revisionId) stale("Working world advanced; select a fresh focus.");
    const head = (await git("git", ["rev-parse", "--verify", "HEAD"], { cwd: this.root, timeout: 5000, maxBuffer: 8192 })).stdout.trim();
    const resolve = async () => {
      const targets = await this.options.resolveFocus(input.focus);
      if (targets.length !== 1) stale("Focus has no unique supported working-source mapping.");
      const target = targets[0]!;
      if (target.sourcePaths.length > 32 || target.sourcePaths.some((path) => !normalized(path))) stale("Source links are unsupported or not repository-relative.");
      if (target.attachmentPath === null && input.focus.range) stale("A source range requires one explicit disk file.");
      if (input.taskReference && target.attachmentPath === null) stale("Attached task requires one explicit supported disk file.");
      return { attachmentPath: target.attachmentPath, sourcePaths: [...target.sourcePaths] };
    };
    const target = await resolve();
    const attachment = () => target.attachmentPath === null ? Promise.resolve({ attachments: [], fileDigest: null }) : this.attachment(target.attachmentPath, input);
    const sources = async () => {
      const paths = await this.options.provenance();
      if (paths.instructions.length > 31 || paths.configuration.length > 31) throw new ContextFailure("OUTPUT_LIMIT", "Too many provenance sources for this bounded draft.");
      // The selected repo paths are not a reconstructed provider expansion.
      return {
        instructions: await Promise.all([...paths.instructions, "provider://instruction-expansion-unobserved"].map((path) => this.source(path))),
        configuration: await Promise.all([...paths.configuration, "provider://effective-configuration-unobserved"].map((path) => this.source(path))),
      };
    };
    const attached = await attachment();
    const first = await sources();
    const secondAttachments = await attachment();
    const second = await sources();
    if (JSON.stringify(attached) !== JSON.stringify(secondAttachments) ||
        JSON.stringify(stableSources(first.instructions)) !== JSON.stringify(stableSources(second.instructions)) ||
        JSON.stringify(stableSources(first.configuration)) !== JSON.stringify(stableSources(second.configuration)) ||
        JSON.stringify(target) !== JSON.stringify(await resolve()) ||
        fingerprint !== await computeWorkingWorldFingerprint(this.root) ||
        input.focus.revisionId !== this.options.workingRevision()) stale("Context changed while being prepared; refresh the draft.");
    this.active(signal, deadline);
    if (input.taskReference) {
      try {
        await this.ownMetadata(() => this.options.taskResolver!.checkRevision(structuredClone(input.taskReference!), signal, deadline), signal, deadline);
      } catch { stale("Repository-task revision changed during context observation. Refresh and attach it again."); }
    }
    const evidence = JSON.stringify({ fingerprint, head, target, ...attached,
      ...(repositoryTask ? { repositoryTask } : {}),
      instructions: stableSources(first.instructions), configuration: stableSources(first.configuration) });
    return { fingerprint, head, target, attachments: attached.attachments, ...first, evidence, repositoryTask };
  }
}
