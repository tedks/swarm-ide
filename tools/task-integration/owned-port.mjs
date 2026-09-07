import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

function parsePort(raw) {
  if (typeof raw !== "string" || raw.length === 0 || /[^0-9]/.test(raw)) throw new Error("Invalid owned virtual port");
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid owned virtual port");
  return port;
}

async function privateRecord(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.size > 1024)
      throw new Error("Invalid virtual ownership record");
    const bytes = Buffer.alloc(1025);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 1024) throw new Error("Oversized virtual ownership record");
    return bytes.subarray(0, bytesRead).toString("utf8").trim();
  } finally { await file.close(); }
}

// Only the supervisor-created environment selects a port. Neither a renderer
// string alone nor the private token alone is a complete launch context.
export async function resolveOwnedVirtualPort(environment = process.env) {
  const owner = environment.SWARM_X11_OWNERSHIP_DIR;
  const display = environment.DISPLAY;
  if (!owner || !isAbsolute(owner) || !/^:[1-9][0-9]*$/.test(display ?? "") ||
      display !== environment.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
  const ownerStat = await lstat(owner);
  if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink() || ownerStat.uid !== process.getuid() ||
      (ownerStat.mode & 0o077) !== 0 || await realpath(owner) !== owner) throw new Error("Invalid virtual owner");
  const token = environment.SWARM_X11_TOKEN;
  const authority = environment.XAUTHORITY;
  if (!/^[0-9a-f]{32}$/.test(token ?? "") || !authority || !isAbsolute(authority) ||
      authority !== environment.SWARM_X11_XAUTHORITY ||
      await privateRecord(join(owner, "token")) !== token ||
      await privateRecord(join(owner, "display")) !== display ||
      await privateRecord(join(owner, "xauthority")) !== authority) throw new Error("Invalid virtual ownership context");
  // Same empty/unset default as virtual-desktop-run.sh's ${VAR:-55174}.
  const allocated = parsePort(environment.SWARM_VIRTUAL_DESKTOP_PORT || "55174");
  const port = parsePort(environment.SWARM_DEV_PORT);
  if (port !== allocated || environment.SWARM_RENDERER_PROCESS_ARGUMENT !==
      `--swarm-window-marker=http://127.0.0.1:${port}/`) throw new Error("Virtual port allocation mismatch");
  return port;
}
