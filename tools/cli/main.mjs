import { fileURLToPath } from "node:url";
import { launch } from "./launcher.mjs";

try {
  process.exitCode = await launch(process.argv.slice(2), {
    bundleRoot: fileURLToPath(new URL("../", import.meta.url)),
    electron: "@electron@",
  });
} catch (error) {
  console.error(`swarm: ${error.message}`);
  process.exitCode = 2;
}
