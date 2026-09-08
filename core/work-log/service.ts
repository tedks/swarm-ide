import { constants } from "node:fs";
import { mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkLogEntrySchema, WorkLogSettingsSchema, WorkLogSnapshotSchema, type WorkLogRequest, type WorkLogSnapshot } from "../../protocol/work-log";
import { readWorkCompletions, readWorkInputs, type WorkCompletion, type WorkInput } from "./transcripts";
import { recordWorkOutcome, runWorkCommand, summarizeWork, withWorkLock, type WorkSummary } from "./commands";

const DocumentSchema = z.object({ version: z.literal(1), entries: z.array(WorkLogEntrySchema).max(200) }).strict();
const StateSchema = z.object({ version: z.literal(1), settings: WorkLogSettingsSchema, seen: z.record(z.string(), z.string()).default({}) }).strict();
type State = z.infer<typeof StateSchema>;
export type WorkLogDependencies = { inputs(root: string, registry?: string, seen?: Record<string, string>): Promise<WorkInput[]>;
  completions?(root: string, registry?: string): Promise<WorkCompletion[]>;
  summarize(input: WorkInput[], settings: WorkLogSnapshot["settings"], signal: AbortSignal): Promise<WorkSummary[]> };

async function atomic(path: string, bytes: string, mode = 0o600) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", mode);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  try { await rename(temporary, path); } finally { await unlink(temporary).catch(() => {}); }
}

export class WorkLogService {
  private snapshot: WorkLogSnapshot = { running: false, summarizing: false, settings: WorkLogSettingsSchema.parse({}), entries: [], notice: "" };
  private state: State = { version: 1, settings: this.snapshot.settings, seen: {} };
  private initialized?: Promise<void>;
  private privateDir = "";
  private commonDir = "";
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private controller = new AbortController();
  private disposed = false;
  private lifetime = new AbortController();
  private mutations: Promise<unknown> = Promise.resolve();
  private repairPending = true;
  constructor(private root: string, private registry?: string, private deps: WorkLogDependencies = { inputs: readWorkInputs, completions: readWorkCompletions, summarize: summarizeWork }) {}
  private async init() {
    this.root = await realpath(this.root);
    this.privateDir = resolve(this.root, (await runWorkCommand("git", ["rev-parse", "--git-path", "swarm-work-log"], this.root, this.controller.signal, "", 10000)).trim());
    this.commonDir = resolve(this.root, (await runWorkCommand("git", ["rev-parse", "--git-common-dir"], this.root, this.controller.signal, "", 10000)).trim());
    await mkdir(this.privateDir, { recursive: true, mode: 0o700 });
    try { this.state = StateSchema.parse(JSON.parse(await readFile(join(this.privateDir, "state.json"), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Work Log state needs attention; it was not replaced"); }
    this.snapshot.settings = this.state.settings;
    await this.loadDocument();
    await this.repairLegacyEntries();
  }
  private async repairLegacyEntries() {
    if (!this.repairPending) return;
    if (!this.snapshot.entries.some((entry) => entry.state === "working")) { this.repairPending = false; return; }
    try {
      await withWorkLock(join(this.privateDir, "producer.lock"), async () => {
        // Reload inside the same lane as publication and recording, so another
        // window's new entries or recording flags cannot be overwritten.
        let savedSeen: Record<string, string> = {};
        try { savedSeen = StateSchema.parse(JSON.parse(await readFile(join(this.privateDir, "state.json"), "utf8"))).seen; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        await this.loadDocument();
        const legacy = this.snapshot.entries.filter((entry) => entry.state === "working");
        let observed: WorkCompletion[] = [];
        if (legacy.length) {
          try { observed = await (this.deps.completions ? this.deps.completions(this.root, this.registry) : this.deps.inputs(this.root, this.registry, {})); }
          catch { /* Missing evidence leaves unmatched outcomes unchanged. */ }
        }
        let changed = false;
        for (const entry of legacy) {
          const completion = observed.find((item) => entry.id === `${item.sessionId}:${item.boundary}` && entry.sessionId === item.sessionId && entry.at === item.at);
          const seen = savedSeen[entry.sessionId];
          if (completion || (seen && entry.id === `${entry.sessionId}:${seen}` && seen.endsWith(`:${entry.at}`))) {
            // Attempt provenance alone does not distinguish success from a
            // task_complete carrying an error. Keep that uncertainty visible.
            entry.state = completion ? completion.state ?? "completed" : "unknown"; changed = true;
          }
        }
        if (changed) await this.saveDocument();
        this.repairPending = false;
      });
    } catch (error) {
      // A stopped reader must remain usable while another window summarizes.
      // Its next read retries the bounded migration after the producer exits.
      if (!(error instanceof Error && error.message === "Work Log is busy in another window")) throw error;
    }
  }
  private async loadDocument() {
    try {
      const file = await open(join(this.root, ".swarm", "work-log.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try { if (!(await file.stat()).isFile() || (await file.stat()).size > 2 * 1024 * 1024) throw new Error("Work Log too large");
        this.snapshot.entries = DocumentSchema.parse(JSON.parse(await file.readFile("utf8"))).entries;
      } finally { await file.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Work Log document needs attention; it was not replaced"); }
  }
  private saveState() { return atomic(join(this.privateDir, "state.json"), JSON.stringify(this.state)); }
  private async saveDocument() {
    const directory = join(this.root, ".swarm");
    await mkdir(directory, { recursive: true });
    const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const descriptor = `/proc/self/fd/${handle.fd}`;
      if (await realpath(descriptor) !== directory) throw new Error("Work Log directory changed");
      await atomic(join(descriptor, "work-log.json"), `${JSON.stringify({ version: 1, entries: this.snapshot.entries }, null, 2)}\n`, 0o644);
    } finally { await handle.close(); }
  }
  async request(request: WorkLogRequest): Promise<WorkLogSnapshot> {
    if (this.disposed) throw new Error("Work Log is stopped");
    await (this.initialized ??= this.init());
    if (this.disposed) throw new Error("Work Log is stopped");
    if (request.type === "workLog.read" && !this.repairPending) return WorkLogSnapshotSchema.parse(this.snapshot);
    const operation = this.mutations.then(async () => {
      if (this.disposed) throw new Error("Work Log is stopped");
      if (request.type === "workLog.read") await this.repairLegacyEntries();
      if (request.type === "workLog.stop" || request.type === "workLog.start") await this.stop();
      if (request.type === "workLog.start") {
        this.snapshot.settings = WorkLogSettingsSchema.parse(request.settings);
        await withWorkLock(join(this.privateDir, "producer.lock"), async () => {
          try { this.state = StateSchema.parse(JSON.parse(await readFile(join(this.privateDir, "state.json"), "utf8"))); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          this.state.settings = this.snapshot.settings; await this.saveState();
        });
        this.controller = new AbortController(); this.snapshot.running = true; this.snapshot.notice = "";
        this.schedule(1);
      }
      if (request.type === "workLog.record") {
        await withWorkLock(join(this.privateDir, "producer.lock"), async () => {
          await this.loadDocument();
          const entry = this.snapshot.entries.find((item) => item.id === request.entryId);
          if (!entry) throw new Error("Choose an existing Work Log outcome");
          await recordWorkOutcome(this.root, this.commonDir, entry, request.taskId, this.lifetime.signal);
          entry.recorded = true; entry.taskId = request.taskId;
          await this.saveDocument();
        });
      }
      return WorkLogSnapshotSchema.parse(this.snapshot);
    });
    this.mutations = operation.catch(() => {});
    return operation;
  }
  private schedule(delay = this.snapshot.settings.debounceSeconds * 1000) {
    clearTimeout(this.timer);
    if (this.snapshot.running && !this.disposed) this.timer = setTimeout(() => {
      this.active = this.tick().finally(() => { this.active = undefined; this.schedule(); });
    }, delay);
  }
  private async tick() {
    try {
      await withWorkLock(join(this.privateDir, "producer.lock"), async () => {
        if (!this.snapshot.running || this.disposed) return;
        // Cross-window attempts are read under the same kernel lock.
        this.state = StateSchema.parse(JSON.parse(await readFile(join(this.privateDir, "state.json"), "utf8")));
        await this.loadDocument();
        const observed = await this.deps.inputs(this.root, this.registry, this.state.seen);
        if (!this.snapshot.running || this.disposed) return;
        const fresh = observed.filter((item) => this.state.seen[item.sessionId] !== item.boundary)
          .sort((a, b) => b.at.localeCompare(a.at));
        // Bootstrap with recent work, not the entire inherited organization history.
        const eligible = fresh.filter((item) => Date.parse(item.at) >= Date.now() - 30 * 60 * 1000).slice(0, 4);
        for (const item of fresh.filter((item) => !eligible.length || eligible.includes(item) || Date.parse(item.at) < Date.now() - 30 * 60 * 1000)) this.state.seen[item.sessionId] = item.boundary;
        await this.saveState(); // Record attempts before model admission: restart never replays.
        if (!eligible.length) return;
        this.snapshot.summarizing = true;
        const summaries = await this.deps.summarize(eligible, this.snapshot.settings, this.controller.signal);
        if (!this.snapshot.running || this.disposed || this.controller.signal.aborted) return;
        const entries = eligible.map((input, index) => WorkLogEntrySchema.parse({ id: `${input.sessionId}:${input.boundary}`,
          sessionId: input.sessionId, agent: input.agent, taskId: input.taskId, at: input.at, ...summaries[index], state: input.state ?? "completed", recorded: false }));
        this.snapshot.entries = [...entries, ...this.snapshot.entries].slice(0, 200);
        await this.saveDocument(); this.snapshot.notice = "";
      });
    } catch (error) {
      if (this.snapshot.running && !this.disposed) this.snapshot.notice = error instanceof Error && error.message.length < 512 ? error.message : "Work Log paused; check the summarizer configuration";
    } finally { this.snapshot.summarizing = false; }
  }
  private async stop() {
    this.snapshot.running = false; clearTimeout(this.timer); this.controller.abort();
    await this.active;
  }
  async dispose() { this.disposed = true; this.lifetime.abort(); await this.stop(); await this.mutations.catch(() => {}); }
}
