// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OverflowStrip } from "../app/renderer/OverflowStrip";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows only needed arrows, preserves native scrolling and reveals newly selected tabs without activation", () => {
  let resized = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect = disconnect; });
  const selected = vi.fn();
  const renderTabs = (active: number) => <OverflowStrip activeKey={String(active)} label="test tabs"><nav aria-label="Test tabs">
    {Array.from({ length: 5 }, (_, index) => <button key={index} aria-selected={active === index} onClick={() => selected(index)}>Tab {index}</button>)}
  </nav></OverflowStrip>;
  const view = render(renderTabs(0));
  const strip = screen.getByRole("navigation", { name: "Test tabs" });
  let width = 200, content = 500;
  Object.defineProperties(strip, { clientWidth: { get: () => width }, scrollWidth: { get: () => content } });
  strip.getBoundingClientRect = () => ({ left: 0, right: width }) as DOMRect;
  screen.getAllByRole("button", { name: /^Tab/ }).forEach((button, index) => {
    button.getBoundingClientRect = () => ({ left: index * 100 - strip.scrollLeft, right: (index + 1) * 100 - strip.scrollLeft }) as DOMRect;
  });
  act(() => resized());
  expect((screen.getByRole("button", { name: "Scroll test tabs left" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Scroll test tabs right" }));
  expect(strip.scrollLeft).toBe(140);
  expect(selected).not.toHaveBeenCalled();
  view.rerender(renderTabs(4));
  expect(strip.scrollLeft).toBe(300);
  expect((screen.getByRole("button", { name: "Scroll test tabs right" }) as HTMLButtonElement).disabled).toBe(true);
  // Trackpad/native scroll changes stay where the user placed them.
  strip.scrollLeft = 50; fireEvent.scroll(strip);
  expect(strip.scrollLeft).toBe(50);
  expect((screen.getByRole("button", { name: "Scroll test tabs right" }) as HTMLButtonElement).disabled).toBe(false);
  content = 180; width = 200; strip.scrollLeft = 0;
  act(() => resized());
  expect(screen.queryByRole("button", { name: /Scroll test tabs/ })).toBeNull();
  expect(screen.getAllByRole("button", { name: /^Tab/ })).toHaveLength(5);
  view.unmount(); expect(disconnect).toHaveBeenCalledOnce();
});
