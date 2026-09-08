import { isAbsolute } from "node:path";

export function parseRehearsalArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  if (args.length !== 3 || !["--interactive-desktop", "--owned-virtual-acceptance"].includes(args[0]) || args[1] !== "--workspace" ||
      !isAbsolute(args[2]) || /[\x00-\x1f\x7f]/.test(args[2])) {
    throw new Error("Choose explicitly: --interactive-desktop --workspace /absolute/registered/repo (opens your desktop), or use the owned virtual test target. No desktop was opened.");
  }
  return { mode: args[0] === "--interactive-desktop" ? "interactive" : "owned-acceptance", workspace: args[2] };
}

export const rehearsalHelp = `TEST-ONLY REHEARSAL — deterministic output — no model or external agent process
Usage: bazel run //tools:agent-rehearsal -- --interactive-desktop --workspace /absolute/repo
The workspace must be an existing Git checkout with a committed HEAD. No example service is required.
No arguments opens nothing. Interactive mode opens your selected desktop; automated checks use owned X11 only.
A fresh owner-private profile is printed and retained on close (20 runs / 64MiB store).
Normal explicit editor Save writes actual source. The deterministic responder cannot write source.
No model, credentials, external agent, inference, or production policy availability is provided.`;
