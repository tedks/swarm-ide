import {
  DEFAULT_INTERFACE_ZOOM,
  INTERFACE_ZOOM_LEVELS,
  isInterfaceZoomPercent,
  type InterfaceZoomPercent,
} from "../view-shell";

export const INTERFACE_ZOOM_STORAGE_KEY = "swarm-ide.interface-zoom-percent";

export interface StoredZoomPreference {
  percent: InterfaceZoomPercent;
  notice: string | null;
  discardStoredValue: boolean;
}

export type ZoomShortcut = "in" | "out" | "reset";

export type ZoomStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readStoredZoom(storage: ZoomStorage | null): StoredZoomPreference {
  if (!storage) {
    return {
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Zoom preference storage is unavailable; this setting will not persist.",
      discardStoredValue: false,
    };
  }
  try {
    const stored = storage.getItem(INTERFACE_ZOOM_STORAGE_KEY);
    if (stored === null) return { percent: DEFAULT_INTERFACE_ZOOM, notice: null, discardStoredValue: false };

    if (/^\d+$/.test(stored)) {
      const value = Number(stored);
      if (isInterfaceZoomPercent(value)) return { percent: value, notice: null, discardStoredValue: false };
    }

    return {
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Saved zoom was invalid and was reset to 100%.",
      discardStoredValue: true,
    };
  } catch {
    return {
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Zoom preference storage is unavailable; this setting will not persist.",
      discardStoredValue: false,
    };
  }
}

export function discardStoredZoom(storage: ZoomStorage | null): string | null {
  if (!storage) return "Zoom preference storage is unavailable; this setting will not persist.";
  try {
    storage.removeItem(INTERFACE_ZOOM_STORAGE_KEY);
    return null;
  } catch {
    return "Zoom preference storage is unavailable; this setting will not persist.";
  }
}

export function persistZoom(storage: ZoomStorage | null, percent: InterfaceZoomPercent): string | null {
  if (!storage) return "Zoom changed, but preference storage is unavailable; this setting will not persist.";
  try {
    storage.setItem(INTERFACE_ZOOM_STORAGE_KEY, String(percent));
    return null;
  } catch {
    return "Zoom changed, but preference storage is unavailable; this setting will not persist.";
  }
}

export function stepZoom(
  current: number,
  direction: "in" | "out",
): InterfaceZoomPercent {
  if (direction === "in") {
    return INTERFACE_ZOOM_LEVELS.find((level) => level > current) ?? INTERFACE_ZOOM_LEVELS.at(-1)!;
  }
  return [...INTERFACE_ZOOM_LEVELS].reverse().find((level) => level < current) ?? INTERFACE_ZOOM_LEVELS[0];
}

export function zoomShortcut(event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey">): ZoomShortcut | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;

  if (!event.shiftKey && (event.code === "Digit0" || (event.code === "Numpad0" && event.key === "0"))) return "reset";
  if ((event.code === "Equal" && (event.key === "=" || event.key === "+")) || (event.code === "NumpadAdd" && event.key === "+")) return "in";
  if ((event.code === "Minus" && (event.key === "-" || event.key === "_")) || (event.code === "NumpadSubtract" && event.key === "-")) return "out";
  return null;
}
