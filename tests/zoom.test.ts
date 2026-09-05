import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INTERFACE_ZOOM,
  applyInterfaceZoom,
  parseViewShellResult,
} from "../app/view-shell";
import {
  discardStoredZoom,
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
    expect(stepZoom(123, "in")).toBe(125);
    expect(stepZoom(123, "out")).toBe(100);
  });

  it("loads, persists, and removes malformed preferences", () => {
    const valid = memoryStorage("125");
    expect(readStoredZoom(valid)).toEqual({ percent: 125, notice: null, discardStoredValue: false });
    expect(persistZoom(valid, 150)).toBeNull();
    expect(valid.value).toBe("150");

    const malformed = memoryStorage("125%");
    expect(readStoredZoom(malformed)).toEqual({
      percent: DEFAULT_INTERFACE_ZOOM,
      notice: "Saved zoom was invalid and was reset to 100%.",
      discardStoredValue: true,
    });
    expect(malformed.value).toBe("125%");
    expect(discardStoredZoom(malformed)).toBeNull();
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
      discardStoredValue: false,
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
      shiftKey: false,
      ...overrides,
    });
    expect(zoomShortcut(event({ code: "Equal", key: "=" }))).toBe("in");
    expect(zoomShortcut(event({ code: "Minus", key: "-" }))).toBe("out");
    expect(zoomShortcut(event({ code: "Digit0", key: "0" }))).toBe("reset");
    expect(zoomShortcut(event({ code: "Equal", key: "+", shiftKey: true }))).toBe("in");
    expect(zoomShortcut(event({ code: "Minus", key: "_", shiftKey: true }))).toBe("out");
    expect(zoomShortcut(event({ code: "NumpadAdd", key: "+" }))).toBe("in");
    expect(zoomShortcut(event({ code: "Numpad0", key: "Insert" }))).toBeNull();
    expect(zoomShortcut(event({ code: "Digit0", key: ")", shiftKey: true }))).toBeNull();
    expect(zoomShortcut(event({ ctrlKey: false, code: "Equal", key: "=" }))).toBeNull();
    expect(zoomShortcut(event({ altKey: true, code: "Equal", key: "=" }))).toBeNull();
    expect(zoomShortcut(event({ metaKey: true, code: "Equal", key: "=" }))).toBeNull();
  });
});

describe("view-shell zoom boundary", () => {
  it("converts an allowed percentage to an Electron zoom factor", () => {
    const setZoomFactor = vi.fn();
    expect(applyInterfaceZoom(125, setZoomFactor, () => 1.25)).toEqual({ ok: true, percent: 125 });
    expect(setZoomFactor).toHaveBeenCalledWith(1.25);
  });

  it("rejects arbitrary levels and reports Electron failures without throwing", () => {
    const setZoomFactor = vi.fn();
    expect(applyInterfaceZoom(123, setZoomFactor, () => 1.23)).toEqual({
      ok: false,
      message: "The requested interface zoom level is not allowed.",
    });
    expect(setZoomFactor).not.toHaveBeenCalled();

    expect(applyInterfaceZoom(125, () => { throw new Error("renderer gone"); }, () => 1)).toEqual({
      ok: false,
      message: "Electron could not apply the interface zoom level.",
    });
    expect(applyInterfaceZoom(125, vi.fn(), () => 1.1)).toEqual({
      ok: false,
      message: "Electron did not confirm the requested interface zoom level.",
    });
  });

  it("runtime-validates responses crossing the preload bridge", () => {
    expect(parseViewShellResult({ ok: true, percent: 125 })).toEqual({ ok: true, percent: 125 });
    expect(parseViewShellResult({ ok: false, message: "no window" })).toEqual({ ok: false, message: "no window" });
    expect(() => parseViewShellResult({ ok: true, percent: 123 })).toThrow(/invalid response/);
    expect(() => parseViewShellResult({ ok: false, message: 9 })).toThrow(/invalid response/);
  });
});
