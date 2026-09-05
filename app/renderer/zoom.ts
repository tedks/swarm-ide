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
}

export type ZoomShortcut = "in" | "out" | "reset";

export type ZoomStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readStoredZoom(storage: ZoomStorage | null): StoredZoomPreference {
  if (!storage) {
    return {
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Zoom preference storage is unavailable; this setting will not persist.",
    };
  }
  try {
    const stored = storage.getItem(INTERFACE_ZOOM_STORAGE_KEY);
    if (stored === null) return { percent: DEFAULT_INTERFACE_ZOOM, notice: null };

    if (/^\d+$/.test(stored)) {
      const value = Number(stored);
      if (isInterfaceZoomPercent(value)) return { percent: value, notice: null };
    }

    storage.removeItem(INTERFACE_ZOOM_STORAGE_KEY);
    return {
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Saved zoom was invalid and was reset to 100%.",
    };
  } catch {
    return {
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Zoom preference storage is unavailable; this setting will not persist.",
    };
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
  current: InterfaceZoomPercent,
  direction: "in" | "out",
): InterfaceZoomPercent {
  const currentIndex = INTERFACE_ZOOM_LEVELS.indexOf(current);
  const offset = direction === "in" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(INTERFACE_ZOOM_LEVELS.length - 1, currentIndex + offset));
  return INTERFACE_ZOOM_LEVELS[nextIndex];
}

export function zoomShortcut(event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "key" | "metaKey">): ZoomShortcut | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;

  if (event.code === "Digit0" || event.code === "Numpad0" || event.key === "0") return "reset";
  if (event.code === "Equal" || event.code === "NumpadAdd" || event.key === "=" || event.key === "+") return "in";
  if (event.code === "Minus" || event.code === "NumpadSubtract" || event.key === "-" || event.key === "_") return "out";
  return null;
}
