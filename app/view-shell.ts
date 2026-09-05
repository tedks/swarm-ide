// Six intentional stops keep the control predictable: readable low-density
// options, a single useful jump from 100 to 125, and a guarded high end.
export const INTERFACE_ZOOM_LEVELS = [80, 90, 100, 125, 150, 160] as const;
export const DEFAULT_INTERFACE_ZOOM = 100;
export const VIEW_SHELL_ZOOM_CHANNEL = "swarm:view:set-zoom";

export type InterfaceZoomPercent = (typeof INTERFACE_ZOOM_LEVELS)[number];

export type ViewShellResult =
  | { ok: true; percent: InterfaceZoomPercent }
  | { ok: false; message: string };

export interface ViewShellBridge {
  setZoomPercent(percent: number): Promise<ViewShellResult>;
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
    return { ok: false, message: "The requested interface zoom level is not allowed." };
  }
  try {
    const requestedFactor = percent / 100;
    setZoomFactor(requestedFactor);
    const appliedFactor = getZoomFactor();
    if (!Number.isFinite(appliedFactor) || Math.abs(appliedFactor - requestedFactor) > 0.005) {
      return { ok: false, message: "Electron did not confirm the requested interface zoom level." };
    }
    return { ok: true, percent };
  } catch {
    return { ok: false, message: "Electron could not apply the interface zoom level." };
  }
}

export function parseViewShellResult(input: unknown): ViewShellResult {
  if (typeof input !== "object" || input === null || !("ok" in input)) {
    throw new Error("The interface zoom bridge returned an invalid response.");
  }
  if (input.ok === true && "percent" in input && isInterfaceZoomPercent(input.percent)) {
    return { ok: true, percent: input.percent };
  }
  if (input.ok === false && "message" in input && typeof input.message === "string") {
    return { ok: false, message: input.message };
  }
  throw new Error("The interface zoom bridge returned an invalid response.");
}
