/** Fixed test-core scenario; no arbitrary command server and no production entry. */
import { isAbsolute } from "node:path";
import { openProcessFixture, value } from "./composition";

const [directory, source] = process.argv.slice(2);
if (!directory || !source || !isAbsolute(directory) || !isAbsolute(source) || !process.send) process.exit(78);
const deadline = setTimeout(() => process.exit(79), 20000);
async function main() {
  const fixture = await openProcessFixture(directory, "core-death", source);
  // Only an owned parent disappearance invokes orderly fallback. The actual
  // proof sends SIGKILL, which cannot run this or any JavaScript exit handler.
  process.on("disconnect", () => { void fixture.close().finally(() => process.exit(1)); });
  const receipt = await fixture.launch();
  const until = Date.now() + 8000;
  while ((await fixture.read()).run.state !== "running") {
    if (Date.now() >= until) throw new Error("Fixture start deadline");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  void fixture.service.request(fixture.steerRequest).then(value).catch(() => {});
  while (!(await fixture.read()).run.instructions.some((item) => item.status === "pending")) {
    if (Date.now() >= until) throw new Error("Fixture receipt deadline");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  process.send!({ type: "pending", receipt, calls: fixture.calls });
}
void main().catch(() => { process.send?.({ type: "failed" }); clearTimeout(deadline); process.exit(1); });
