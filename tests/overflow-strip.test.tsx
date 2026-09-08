// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OverflowStrip } from "../app/renderer/OverflowStrip";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows only needed arrows, preserves native scrolling and reveals newly selected tabs without activation", () => {
  let resized = () => {};
  let changed = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect = disconnect; });
  vi.stubGlobal("MutationObserver", class { constructor(callback: () => void) { changed = callback; } observe() {} disconnect() {} });
  const selected = vi.fn();
  const renderTabs = (active: number, order = [0, 1, 2, 3, 4]) => <OverflowStrip activeKey={String(active)} label="test tabs"><nav aria-label="Test tabs">
    {order.map((index) => <button key={index} aria-selected={active === index} onClick={() => selected(index)}>Tab {index}</button>)}
  </nav></OverflowStrip>;
  const view = render(renderTabs(0));
  const strip = screen.getByRole("navigation", { name: "Test tabs" });
  let width = 200, content = 500;
  Object.defineProperties(strip, { clientWidth: { get: () => width }, scrollWidth: { get: () => content } });
  strip.getBoundingClientRect = () => ({ left: 0, right: width }) as DOMRect;
  screen.getAllByRole("button", { name: /^Tab/ }).forEach((button) => {
    button.getBoundingClientRect = () => {
      const index = [...strip.querySelectorAll<HTMLButtonElement>("button")].indexOf(button as HTMLButtonElement);
      return { left: index * 100 - strip.scrollLeft, right: (index + 1) * 100 - strip.scrollLeft } as DOMRect;
    };
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
  strip.scrollLeft = 0;
  view.rerender(renderTabs(4, [4, 0, 1, 2, 3]));
  view.rerender(renderTabs(4, [0, 1, 2, 3, 4]));
  act(() => changed());
  expect(strip.scrollLeft).toBe(300); // activeKey stayed "4"; only child order changed.
  content = 180; width = 200; strip.scrollLeft = 0;
  act(() => resized());
  expect(screen.queryByRole("button", { name: /Scroll test tabs/ })).toBeNull();
  expect(screen.getAllByRole("button", { name: /^Tab/ })).toHaveLength(5);
  view.unmount(); expect(disconnect).toHaveBeenCalledOnce();
});
