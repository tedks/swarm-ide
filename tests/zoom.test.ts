import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INTERFACE_ZOOM,
  applyInterfaceZoom,
} from "../app/view-shell";
import {
  persistZoom,
  readStoredZoom,
  stepZoom,
  zoomShortcut,
  type ZoomStorage,
} from "../app/renderer/zoom";

function memoryStorage(initial: string | null = null): ZoomStorage & { value: string | null } {
  return {
    value: initial,
    getItem() { return this.value; },
    removeItem() { this.value = null; },
    setItem(_key, value) { this.value = value; },
  };
}

describe("interface zoom model", () => {
  it("uses deliberate steps, including 100 to 125, and clamps both bounds", () => {
    expect(stepZoom(100, "in")).toBe(125);
    expect(stepZoom(125, "out")).toBe(100);
    expect(stepZoom(80, "out")).toBe(80);
    expect(stepZoom(160, "in")).toBe(160);
  });

  it("loads, persists, and removes malformed preferences", () => {
    const valid = memoryStorage("125");
    expect(readStoredZoom(valid)).toEqual({ percent: 125, notice: null });
    expect(persistZoom(valid, 150)).toBeNull();
    expect(valid.value).toBe("150");

    const malformed = memoryStorage("125%");
    expect(readStoredZoom(malformed)).toEqual({
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Saved zoom was invalid and was reset to 100%.",
    });
    expect(malformed.value).toBeNull();
  });

  it("falls back clearly when storage cannot be read or written", () => {
    const unavailable: ZoomStorage = {
      getItem: () => { throw new Error("denied"); },
      removeItem: vi.fn(),
      setItem: () => { throw new Error("denied"); },
    };
    expect(readStoredZoom(unavailable)).toEqual({
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Zoom preference storage is unavailable; this setting will not persist.",
    });
    expect(persistZoom(unavailable, 125)).toMatch(/will not persist/);
    expect(readStoredZoom(null).percent).toBe(100);
  });

  it("recognizes only unmodified Ctrl zoom shortcuts", () => {
    const event = (overrides: Partial<KeyboardEvent>) => ({
      altKey: false,
      code: "",
      ctrlKey: true,
      key: "",
      metaKey: false,
      ...overrides,
    });
    expect(zoomShortcut(event({ code: "Equal", key: "=" }))).toBe("in");
    expect(zoomShortcut(event({ code: "Minus", key: "-" }))).toBe("out");
    expect(zoomShortcut(event({ code: "Digit0", key: "0" }))).toBe("reset");
    expect(zoomShortcut(event({ ctrlKey: false, code: "Equal", key: "=" }))).toBeNull();
    expect(zoomShortcut(event({ altKey: true, code: "Equal", key: "=" }))).toBeNull();
    expect(zoomShortcut(event({ metaKey: true, code: "Equal", key: "=" }))).toBeNull();
  });
});

describe("view-shell zoom boundary", () => {
  it("converts an allowed percentage to an Electron zoom factor", () => {
    const setZoomFactor = vi.fn();
    expect(applyInterfaceZoom(125, setZoomFactor)).toEqual({ ok: true, percent: 125 });
    expect(setZoomFactor).toHaveBeenCalledWith(1.25);
  });

  it("rejects arbitrary levels and reports Electron failures without throwing", () => {
    const setZoomFactor = vi.fn();
    expect(applyInterfaceZoom(123, setZoomFactor)).toEqual({
      ok: false,
      message: "The requested interface zoom level is not allowed.",
    });
    expect(setZoomFactor).not.toHaveBeenCalled();

    expect(applyInterfaceZoom(125, () => { throw new Error("renderer gone"); })).toEqual({
      ok: false,
      message: "Electron could not apply the interface zoom level.",
    });
  });
});
