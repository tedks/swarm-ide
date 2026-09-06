/** Only the test build aliases main's fixed launcher to this observer. */
import { randomUUID } from "node:crypto";
import type { UtilityProcess } from "electron";
import { launchLocalCore as actualLaunch } from "../../app/electron/core-launch";

let current: UtilityProcess | undefined;
let generation = 0;
export function launchLocalCore(root: string, storeRoot: string) {
  current = actualLaunch(root, storeRoot);
  generation++;
  return current;
}
export const fixtureGeneration = () => generation;
export function crashCore() {
  // UtilityProcess.kill is the exact owned handle, never a persisted PID/name.
  if (!current?.kill()) throw new Error("Could not kill the owned fixture core");
}
export function control(input: unknown): Promise<unknown> {
  const child = current;
  if (!child) return Promise.reject(new Error("No fixture core"));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Fixture control timed out")), 15_000);
    function finish(error?: Error, value?: unknown) {
      clearTimeout(timeout); child!.removeListener("message", receive); child!.removeListener("exit", exited);
      if (error) reject(error); else resolve(value);
    }
    function receive(message: unknown) {
      if (typeof message !== "object" || !message || !("type" in message) || message.type !== "fixture.reply" || !("id" in message) || message.id !== id) return;
      if (!("ok" in message) || message.ok !== true || !("value" in message)) finish(new Error("Fixture control rejected"));
      else finish(undefined, message.value);
    }
    function exited() { finish(new Error("Fixture core exited during control")); }
    child.on("message", receive); child.on("exit", exited);
    try { child.postMessage({ type: "fixture.control", id, input }); } catch { finish(new Error("Fixture control not sent")); }
  });
}
