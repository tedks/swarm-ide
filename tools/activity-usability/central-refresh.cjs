// Controlled JSONL append -> unchanged packaged observer -> real central UI.
// The records below describe operations; the harness does not execute them.
const fs = require("node:fs/promises"), assert = require("node:assert/strict");
module.exports = async ({ repository, run, click, tabTo, until, retained, shot, requests, stage }) => {
  const registration = JSON.parse(repository.registryText).sessions[0];
  const append = async (id, command, at) => fs.appendFile(registration.rollout, JSON.stringify({ timestamp: at, type: "response_item",
    payload: { type: "function_call", name: "exec_command", call_id: id, arguments: JSON.stringify({ cmd: command, workdir: repository.root }) } }) + "\n");
  const central = ".journal-panel:not([hidden])";
  const hasText = (text) => run((selector, text) => document.querySelector(selector)?.textContent.includes(text), `${central} .fleet-activity-view`, text);
  stage("central-overview");
  await click(".dock-activity .activity-open-heading");
  await until(() => hasText("Ran git status --short"), "central current fleet");
  // The earlier keyboard settings journey can scroll the draft above the dock.
  // Native Tab both reveals and focuses it; do not click a clipped coordinate.
  await tabTo(".agent-draft textarea");
  const autoCommand = "echo controlled automatic Activity milestone";
  await append("central-auto", autoCommand, "2026-09-08T12:35:00.000Z");
  const autoStarted = Date.now();
  await until(() => hasText(`Ran ${autoCommand}`), "automatic central transcript update", 5500);
  const automaticMilliseconds = Date.now() - autoStarted;
  assert(await run(() => document.activeElement?.matches(".agent-draft textarea")), "automatic rows do not steal draft focus");
  await retained(); await shot("03-central-automatic-update.png");

  stage("central-manual");
  const before = requests.length;
  const manualCommand = "echo controlled manual Activity milestone";
  await append("central-manual", manualCommand, "2026-09-08T12:36:00.000Z");
  await click(`${central} button[aria-label="Refresh activity"]`);
  await until(() => hasText(`Ran ${manualCommand}`), "explicit central refresh update");
  const refreshed = requests.slice(before);
  assert(refreshed.some(({ type }) => type === "externalAgents.snapshot"), "refresh uses existing fleet reader");
  assert(!refreshed.some(({ type }) => type === "changelog.read" || type === "githubPrs.refresh"), "refresh does not read unrelated tabs");
  await retained();

  stage("central-event");
  await click(`${central} .fleet-activity-view li button[aria-label="Proof fixture 1: Ran ${manualCommand}"]`);
  await until(() => run((s) => Boolean(document.querySelector(`${s} .fleet-event-detail`)), central), "explicit event stays selected");
  assert(await hasText(manualCommand));
  await click(".dock-activity .activity-open-heading");
  assert(await run((s) => !document.querySelector(`${s} .fleet-event-detail`) && Boolean(document.querySelector(`${s} .fleet-activity-view ol`)), central), "overview action clears event only");
  await click(`${central} .fleet-activity-view li button[aria-label="Proof fixture 1: Ran ${manualCommand}"]`);
  await click(`${central} button[aria-label="Close logical changes"]`);
  await click(".dock-activity .activity-open-heading");
  assert(await run((s) => !document.querySelector(`${s} .fleet-event-detail`) && Boolean(document.querySelector(`${s} .fleet-activity-view ol`)), central), "close/reopen restores live list");
  await retained(); await shot("04-central-refreshed-overview.png");
  return { automaticMilliseconds, currentFleet: true, manualFleetRead: true, separateOverview: true, retained: true, controlledJsonlOnly: true };
};
