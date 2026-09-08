import { useState } from "react";
import { PlanGenerationSettingsSchema, type PlanGenerationSettings } from "../../../protocol/plan-generation";
import { readPlanGenerationSettings, savePlanGenerationSettings } from "./generation-settings";

export interface PlanGenerationAction {
  pending: boolean; notice: string;
  start(settings: PlanGenerationSettings): void;
  retry?(settings: PlanGenerationSettings): void;
  open?(): void;
}

/** Settings are a local-profile preference; edits and reads never start work. */
export function PlanGeneration({ action, disabled }: { action: PlanGenerationAction; disabled: boolean }) {
  const [settings, setSettings] = useState(readPlanGenerationSettings);
  const [notice, setNotice] = useState("");
  const valid = PlanGenerationSettingsSchema.safeParse(settings).success;
  return <section className="plan-generation" aria-label="Generate component plan">
    <p>Map this project with a design agent.</p>
    <button disabled={disabled || action.pending || !valid} onClick={() => {
      try { savePlanGenerationSettings(settings); setNotice(""); action.start(settings); }
      catch { setNotice("Could not save generation settings. Check local storage and try again."); }
    }}>{action.pending ? "Generating component plan…" : "Generate component plan"}</button>
    {action.retry ? <button disabled={disabled} onClick={() => action.retry?.(settings)}>Check or retry launch</button> : null}
    {action.open ? <button onClick={action.open}>View generation agent</button> : null}
    <details><summary>Generation settings</summary>
      <label>Harness<select value={settings.harness} disabled={action.pending} onChange={() => {}}><option value="codex">Codex</option></select></label>
      <label>Model<input value={settings.model} disabled={action.pending} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label>
      <label>Reasoning<select value={settings.effort} disabled={action.pending} onChange={(event) => setSettings({ ...settings, effort: event.target.value as PlanGenerationSettings["effort"] })}>{["low", "medium", "high", "xhigh"].map((effort) => <option key={effort}>{effort}</option>)}</select></label>
      <label>Prompt<textarea rows={7} value={settings.prompt} disabled={action.pending} onChange={(event) => setSettings({ ...settings, prompt: event.target.value })} /></label>
      <button disabled={action.pending || !valid} onClick={() => {
        try { savePlanGenerationSettings(settings); setNotice("Generation settings saved."); }
        catch { setNotice("Could not save generation settings."); }
      }}>Save settings</button>
    </details>
    {notice || action.notice ? <p role="status">{notice || action.notice}</p> : null}
  </section>;
}
