import { createConnection } from "node:net";
import { join } from "node:path";

const owned = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owned || !process.env.SWARM_X11_TOKEN) throw new Error("Owned virtual harness required");
const socket = createConnection(join(owned, "journey.sock"));
const timer = setTimeout(() => { console.error("Fixed journey timed out"); socket.destroy(); process.exitCode = 1; }, 150_000);
let bytes = Buffer.alloc(0), complete = false;
socket.on("connect", () => socket.write(JSON.stringify({ action: process.env.SWARM_JOURNEY_FAILURE_PROBE === "1" ? "failure-probe" : "run", token: process.env.SWARM_X11_TOKEN }) + "\n"));
socket.on("data", (chunk) => {
  if (bytes.length + chunk.length > 128 * 1024) { socket.destroy(new Error("Oversized fixture evidence")); return; }
  bytes = Buffer.concat([bytes, chunk]);
});
socket.on("end", () => {
  try {
    const result = JSON.parse(bytes.toString("utf8"));
    if (result.ok !== true || result.fixtureOnly !== true) throw new Error(result.error ?? "Fixture journey failed");
    complete = true;
    console.log(JSON.stringify({ ok: true, fixtureOnly: true, elapsedMs: result.elapsedMs,
      coreGenerations: result.coreGenerations, finalState: result.finalState,
      detail: "Full asserted evidence is in journey.json; no provider was contacted." }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
socket.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
socket.on("close", () => { clearTimeout(timer); if (!complete) process.exitCode = 1; });
