import { updateRegistry, type RegisterInput, type RetireInput } from "./registry";

const usage = `Usage:
  register --registry /private/registry.json --label NAME
    (--rollout /known/session.jsonl | --socket /tmux/socket --pane %ID)
    [--socket /tmux/socket --pane %ID] [--process-pid PID --process-start TICKS]
    [--session-id ID] [--role ROLE] [--task TASK] [--context-root /repo]
    [--context-path repo/relative/path ...] [--evidence local|synthetic]
  retire --registry /private/registry.json --session-id ID

Registry parent must already exist, be owned mode 0700, outside the repository.
Registry/lock are mode 0600. No launch, message, account scan or implicit target.
Rollout-only or unverified pane registration is historical-only (no steering).
Retirement keeps metadata/history and removes the live tmux target.
`;

export function parseArgs(args: string[]): RegisterInput | RetireInput {
  const [action, ...rest] = args;
  if (action !== "register" && action !== "retire") throw new Error("Expected register or retire; use --help");
  const values = new Map<string, string>(), paths: string[] = [];
  const allowed = new Set(["registry", "session-id", ...(action === "register" ?
    ["label", "rollout", "socket", "pane", "process-pid", "process-start", "role", "task", "context-root", "context-path", "evidence"] : [])]);
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2), value = rest[i + 1];
    if (!rest[i].startsWith("--") || !allowed.has(key) || value === undefined || value.startsWith("--") || value.includes("\0"))
      throw new Error("Unknown option or missing value; use --help");
    if (key === "context-path") { paths.push(value); continue; }
    if (values.has(key)) throw new Error(`Repeated --${key} option`);
    values.set(key, value);
  }
  const required = (key: string) => { const v = values.get(key); if (!v) throw new Error(`Required --${key}`); return v; };
  const registry = required("registry");
  if (action === "retire") return { action, registry, sessionId: required("session-id") };
  const socket = values.get("socket"), pane = values.get("pane"), pid = values.get("process-pid"), start = values.get("process-start");
  if (Boolean(socket) !== Boolean(pane) || (pid !== undefined || start !== undefined) && !socket || start !== undefined && pid === undefined)
    throw new Error("Use socket and pane together; process-start requires process-pid");
  if (pid !== undefined && (!/^[1-9]\d{0,9}$/.test(pid) || Number(pid) > 2147483647) || start !== undefined && !/^\d{1,24}$/.test(start))
    throw new Error("Invalid exact process identity");
  const evidence = values.get("evidence");
  if (evidence !== undefined && evidence !== "local" && evidence !== "synthetic") throw new Error("Evidence must be local or synthetic");
  return { action, registry, label: required("label"), rollout: values.get("rollout"), sessionId: values.get("session-id"),
    ...(socket && pane ? { pane: { socket, pane, ...(pid ? { processPid: Number(pid) } : {}), ...(start ? { processStart: start } : {}) } } : {}),
    role: values.get("role"), task: values.get("task"), contextRoot: values.get("context-root"),
    ...(paths.length ? { contextPaths: paths } : {}), ...(evidence ? { evidence } : {}),
  };
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === "--help") { process.stdout.write(usage); return; }
  try { process.stdout.write(JSON.stringify(await updateRegistry(parseArgs(process.argv.slice(2)))) + "\n"); }
  catch (error) {
    process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : "Registration failed" }) + "\n");
    process.exitCode = 1;
  }
}
if (require.main === module) void main();
