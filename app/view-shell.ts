// Six intentional stops keep the control predictable: readable low-density
// options, a single useful jump from 100 to 125, and a guarded high end.
export const INTERFACE_ZOOM_LEVELS = [80, 90, 100, 125, 150, 160] as const;
export const DEFAULT_INTERFACE_ZOOM = 100;
export const VIEW_SHELL_ZOOM_CHANNEL = "swarm:view:set-zoom";
export const VIEW_SHELL_NAVIGATE_CHANNEL = "swarm:view:navigate";

export type InterfaceZoomPercent = (typeof INTERFACE_ZOOM_LEVELS)[number];

export type ViewShellResult =
  | { ok: true; percent: InterfaceZoomPercent }
  | { ok: false; message: string; zoomState: "unchanged" | "unknown" };

export interface ViewShellBridge {
  setZoomPercent(percent: number): Promise<ViewShellResult>;
  onNavigate?(listener: (direction: "back" | "forward") => void): () => void;
}

export function isInterfaceZoomPercent(value: unknown): value is InterfaceZoomPercent {
  return typeof value === "number" && INTERFACE_ZOOM_LEVELS.some((level) => level === value);
}

export function applyInterfaceZoom(
  percent: number,
  setZoomFactor: (factor: number) => void,
  getZoomFactor: () => number,
): ViewShellResult {
  if (!isInterfaceZoomPercent(percent)) {
    return { ok: false, message: "The requested interface zoom level is not allowed.", zoomState: "unchanged" };
  }
  let previousFactor: number | null = null;
  try {
    previousFactor = getZoomFactor();
    if (!Number.isFinite(previousFactor)) {
      return { ok: false, message: "Electron could not report the current interface zoom level.", zoomState: "unknown" };
    }
    const requestedFactor = percent / 100;
    setZoomFactor(requestedFactor);
    const appliedFactor = getZoomFactor();
    if (!Number.isFinite(appliedFactor) || Math.abs(appliedFactor - requestedFactor) > 0.005) {
      return rollbackZoom(previousFactor, setZoomFactor, getZoomFactor);
    }
    return { ok: true, percent };
  } catch {
    return previousFactor === null
      ? { ok: false, message: "Electron could not report the current interface zoom level.", zoomState: "unknown" }
      : rollbackZoom(previousFactor, setZoomFactor, getZoomFactor);
  }
}

function rollbackZoom(
  previousFactor: number,
  setZoomFactor: (factor: number) => void,
  getZoomFactor: () => number,
): ViewShellResult {
  try {
    setZoomFactor(previousFactor);
    const restoredFactor = getZoomFactor();
    if (Number.isFinite(restoredFactor) && Math.abs(restoredFactor - previousFactor) <= 0.005) {
      return { ok: false, message: "Electron rejected the requested interface zoom level; the previous level was restored.", zoomState: "unchanged" };
    }
  } catch {
    // The caller must stop publishing its previous value when rollback cannot
    // be proven; the failure contract makes that state explicit.
  }
  return { ok: false, message: "Electron could not verify or restore the interface zoom level.", zoomState: "unknown" };
}

export function parseViewShellResult(input: unknown): ViewShellResult {
  if (typeof input !== "object" || input === null || !("ok" in input)) {
    throw new Error("The interface zoom bridge returned an invalid response.");
  }
  if (input.ok === true && "percent" in input && isInterfaceZoomPercent(input.percent)) {
    return { ok: true, percent: input.percent };
  }
  if (
    input.ok === false &&
    "message" in input &&
    typeof input.message === "string" &&
    "zoomState" in input &&
    (input.zoomState === "unchanged" || input.zoomState === "unknown")
  ) {
    return { ok: false, message: input.message, zoomState: input.zoomState };
  }
  throw new Error("The interface zoom bridge returned an invalid response.");
}
