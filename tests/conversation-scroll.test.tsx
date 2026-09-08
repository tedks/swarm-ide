// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useConversationScroll } from "../app/renderer/external-agents/conversation-scroll";

function Reader({ id, ready = true, tail = "1" }: { id: string; ready?: boolean; tail?: string }) {
  const viewport = useConversationScroll(id, ready, tail);
  return <ol {...viewport} aria-label="Reading position"><li>{id}</li></ol>;
}
afterEach(cleanup);

it("restores each conversation through empty loading tails and preserves manual reading across updates", () => {
  const view = render(<Reader id="A" />), list = screen.getByRole("list");
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
  list.scrollTop = 135; fireEvent.scroll(list);
  view.rerender(<Reader id="B" ready={false} />);
  list.scrollTop = 0; fireEvent.scroll(list); // A's old position must not be replaced.
  view.rerender(<Reader id="B" />); expect(list.scrollTop).toBe(1000);
  list.scrollTop = 220; fireEvent.scroll(list);
  view.rerender(<Reader id="A" ready={false} />);
  list.scrollTop = 0; fireEvent.scroll(list);
  view.rerender(<Reader id="A" />); expect(list.scrollTop).toBe(135);
  view.rerender(<Reader id="A" tail="2" />); expect(list.scrollTop).toBe(135);
  view.rerender(<Reader id="B" />); expect(list.scrollTop).toBe(220);
});

it("follows only conversations left at the bottom and ignores hidden viewport scroll events", () => {
  const view = render(<Reader id="A" />), list = screen.getByRole("list");
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
  list.scrollTop = 800; fireEvent.scroll(list);
  view.rerender(<Reader id="B" />);
  list.scrollTop = 100; fireEvent.scroll(list);
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 0 });
  list.scrollTop = 0; fireEvent.scroll(list);
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
  view.rerender(<Reader id="A" />); expect(list.scrollTop).toBe(1000);
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1300 });
  view.rerender(<Reader id="A" tail="2" />); expect(list.scrollTop).toBe(1300);
  view.rerender(<Reader id="B" />); expect(list.scrollTop).toBe(100);
});
