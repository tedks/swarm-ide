// Fixed harmless process-owner protocol fixture. NOT Codex, model, or policy
// evidence. Witness records describe synthetic activity, NEVER cleanup proof.
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const [role, scenario, witnessPath, ...extra] = process.argv.slice(2);
const roles = ["provider", "descendant", "canary"];
const scenarios = ["stop-terminal", "unexpected-exit", "core-death"];
const fail = () => process.exit(64);
if (extra.length || !roles.includes(role) || !scenarios.includes(scenario) ||
    typeof witnessPath !== "string" || witnessPath.length > 4096 ||
    !isAbsolute(witnessPath) || normalize(witnessPath) !== witnessPath ||
    !witnessPath.endsWith(".jsonl") || /[\p{Cc}\p{Cf}]/u.test(witnessPath)) fail();

// Every role has its own hard safety deadline, even after stdin/IPC closes.
setTimeout(() => process.exit(70), 30_000);
setInterval(() => {}, 1000);
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
process.stdout.on("error", fail);
process.stdin.on("error", fail);

const directory = lstatSync(dirname(witnessPath));
if (!directory.isDirectory() || directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700) fail();
const witnessFd = openSync(witnessPath,
  constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
const witnessStat = fstatSync(witnessFd);
if (!witnessStat.isFile() || witnessStat.uid !== process.getuid() ||
    (witnessStat.mode & 0o777) !== 0o600 || witnessStat.nlink !== 1 || witnessStat.size > 65_536) fail();
const namespace = readlinkSync("/proc/self/ns/pid");
if (!/^pid:\[\d+\]$/.test(namespace)) fail();
let records = 0;
function witness(phase, method) {
  if (++records > 96 || fstatSync(witnessFd).size > 65_536 - 512) fail();
  appendFileSync(witnessFd, JSON.stringify({ role, phase, namespace, pid: process.pid,
    ...(method === undefined ? {} : { method }) }) + "\n");
  fsyncSync(witnessFd);
}
process.on("exit", () => closeSync(witnessFd));
let sawTerm = false;
process.on("SIGTERM", () => {
  // Deliberately survive polite teardown. Namespace ownership must do the work.
  if (!sawTerm) { sawTerm = true; witness("sigterm"); }
});

if (role !== "provider") {
  if (!process.send) fail();
  witness("ready");
  process.send({ type: "ready", role }, (error) => {
    if (error) fail();
    if (process.connected) process.disconnect();
  });
} else {
  const descendant = spawn(process.execPath,
    [fileURLToPath(import.meta.url), "descendant", scenario, witnessPath], {
      cwd: process.cwd(), detached: true, shell: false,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
  const descendantReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture readiness timeout")), 5000);
    descendant.once("error", reject);
    descendant.once("exit", () => reject(new Error("Fixture exited before readiness")));
    descendant.once("message", (message) => {
      if (message?.type !== "ready" || message.role !== "descendant") {
        reject(new Error("Invalid fixture readiness")); return;
      }
      clearTimeout(timer);
      witness("ready");
      resolve();
    });
  });
  // Attach a rejection handler immediately, even before turn/start arrives.
  void descendantReady.catch(fail);

  const threadId = "fixture-thread";
  const turnId = "fixture-turn";
  const methods = new Set(["initialize", "initialized", "thread/start", "turn/start", "turn/steer", "turn/interrupt"]);
  let state = "new";
  let outputBytes = 0;
  function send(message) {
    const line = JSON.stringify(message) + "\n";
    outputBytes += Buffer.byteLength(line);
    if (outputBytes > 65_536 || process.stdout.writableLength > 65_536) fail();
    process.stdout.write(line);
  }
  const reject = (id) => send({ id, error: { code: -32601, message: "Unsupported fixture request" } });
  async function request(message) {
    if (!message || typeof message !== "object" || Array.isArray(message) ||
        typeof message.method !== "string" || message.method.length > 128) fail();
    const { id, method, params } = message;
    if (id === undefined && method === "initialized" && state === "initializing") {
      witness("request", method); state = "initialized"; return;
    }
    if (!Number.isSafeInteger(id) || id < 1) fail();
    if (!methods.has(method)) { reject(id); return; }
    witness("request", method);
    if (method === "initialize" && state === "new") {
      state = "initializing";
      send({ id, result: { userAgent: "fixture" } });
    } else if (method === "thread/start" && state === "initialized" &&
        params?.cwd === process.cwd() && params.approvalPolicy === "never" && params.sandbox === "read-only") {
      state = "thread";
      send({ id, result: { thread: { id: threadId }, model: "fixture-model",
        modelProvider: "fixture-protocol", cwd: process.cwd(), approvalPolicy: "never",
        sandbox: { type: "readOnly", networkAccess: false }, instructionSources: [] } });
    } else if (method === "turn/start" && state === "thread" && params?.threadId === threadId) {
      await descendantReady;
      state = "turn";
      send({ id, result: { turn: { id: turnId, status: "inProgress" } } });
      send({ method: "item/agentMessage/delta", params: { threadId, turnId,
        itemId: "fixture-message", delta: "<b>literal fixture HTML</b> — café 🌱" } });
    } else if (method === "turn/steer" && state === "turn" &&
        params?.threadId === threadId && params.expectedTurnId === turnId) {
      if (scenario === "unexpected-exit") process.exit(17);
      if (scenario === "core-death") return; // Deliberately leave the request unacknowledged.
      send({ id, result: { turnId } });
    } else if (method === "turn/interrupt" && scenario === "stop-terminal" && state === "turn" &&
        params?.threadId === threadId && params.turnId === turnId) {
      state = "interrupting";
      send({ id, result: {} });
      witness("interrupt-ack");
      setImmediate(() => {
        state = "terminal";
        witness("terminal");
        send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
        // Both processes remain alive until the owner actually tears them down.
      });
    } else reject(id);
  }

  let input = Buffer.alloc(0);
  let receivedBytes = 0;
  let messages = 0;
  let queue = Promise.resolve();
  process.stdin.on("data", (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > 262_144) fail();
    input = Buffer.concat([input, chunk]);
    let newline;
    while ((newline = input.indexOf(10)) !== -1) {
      if (newline > 65_536 || ++messages > 64) fail();
      const line = input.subarray(0, newline);
      input = input.subarray(newline + 1);
      // Fatal UTF-8 decoding prevents replacement characters hiding malformed input.
      const message = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
      queue = queue.then(() => request(message)).catch(fail);
    }
    if (input.length > 65_536) fail();
  });
  process.stdin.on("end", () => { if (input.length) fail(); });
}
