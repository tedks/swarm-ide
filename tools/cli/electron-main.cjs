// Fixed installed entrypoint; not a renderer- or repository-selected module.
const { app } = require("electron");
const { mkdirSync } = require("node:fs");
const { isAbsolute } = require("node:path");

const profile = process.env.SWARM_CLI_USER_DATA_DIR;
if (profile !== undefined) {
  if (!isAbsolute(profile)) throw new Error("Swarm profile must be an absolute path.");
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath("userData", profile);
}
console.log(`swarm: profile ${JSON.stringify(app.getPath("userData"))}`);
require("../app/electron/main.js");
