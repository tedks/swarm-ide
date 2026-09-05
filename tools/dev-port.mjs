import { realpathSync } from "node:fs";

export const DEFAULT_DEV_PORT = 5173;
export const DEV_HOST = "127.0.0.1";

export function parseDevPort(rawPort) {
  if (rawPort === undefined) return DEFAULT_DEV_PORT;
  if (typeof rawPort !== "string" || !/^[0-9]+$/.test(rawPort)) {
    throw new Error(
      "SWARM_DEV_PORT must be a decimal integer between 1 and 65535; " +
        `received ${JSON.stringify(rawPort)}`,
    );
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      "SWARM_DEV_PORT must be a decimal integer between 1 and 65535; " +
        `received ${JSON.stringify(rawPort)}`,
    );
  }
  return port;
}

export function resolveDevEndpoint(environment = process.env) {
  const port = parseDevPort(environment.SWARM_DEV_PORT);
  const rendererUrl = `http://${DEV_HOST}:${port}/`;
  return {
    host: DEV_HOST,
    port,
    rendererUrl,
    rendererProcessArgument: `--swarm-window-marker=${rendererUrl}`,
    webSocketOrigin: `ws://${DEV_HOST}:${port}`,
  };
}

function runCli() {
  if (process.argv.length !== 3 || process.argv[2] !== "renderer-process-argument") {
    throw new Error("usage: dev-port.mjs renderer-process-argument");
  }
  process.stdout.write(`${resolveDevEndpoint().rendererProcessArgument}\n`);
}

if (
  process.argv[1] &&
  realpathSync(new URL(import.meta.url)) === realpathSync(process.argv[1])
) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
