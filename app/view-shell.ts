export const INTERFACE_ZOOM_LEVELS = [80, 90, 100, 125, 150, 160] as const;
export const DEFAULT_INTERFACE_ZOOM = 100;

export type InterfaceZoomPercent = (typeof INTERFACE_ZOOM_LEVELS)[number];

export type ViewShellResult =
  | { ok: true; percent: InterfaceZoomPercent }
  | { ok: false; message: string };

export interface ViewShellBridge {
  setZoomPercent(percent: number): ViewShellResult;
}

export function isInterfaceZoomPercent(value: unknown): value is InterfaceZoomPercent {
  return typeof value === "number" && INTERFACE_ZOOM_LEVELS.some((level) => level === value);
}

export function applyInterfaceZoom(
  percent: number,
  setZoomFactor: (factor: number) => void,
): ViewShellResult {
  if (!isInterfaceZoomPercent(percent)) {
    return { ok: false, message: "The requested interface zoom level is not allowed." };
  }
  try {
    setZoomFactor(percent / 100);
    return { ok: true, percent };
  } catch {
    return { ok: false, message: "Electron could not apply the interface zoom level." };
  }
}
