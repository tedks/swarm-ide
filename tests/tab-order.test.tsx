// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { useTabOrder } from "../app/renderer/use-tab-order";

afterEach(cleanup);

function Tabs() {
  const [active, setActive] = useState("one");
  const order = useTabOrder(["one", "two", "three"] as const);
  return <div>{order.ordered.map((key) => <button key={key} {...order.props(key)} aria-pressed={active === key} onClick={() => setActive(key)}>{key}</button>)}</div>;
}

it("reorders stable tabs without activating the dragged tab", () => {
  render(<Tabs />);
  const one = screen.getByRole("button", { name: "one" });
  const three = screen.getByRole("button", { name: "three" });
  three.getBoundingClientRect = () => ({ left: 200, width: 100 }) as DOMRect;
  const transfer = { effectAllowed: "none", dropEffect: "none" };
  fireEvent.dragStart(one, { dataTransfer: transfer });
  fireEvent.dragOver(three, { clientX: 299, dataTransfer: transfer });
  expect(three.dataset.tabDrop).toBe("after");
  fireEvent.drop(three, { clientX: 299, dataTransfer: transfer });
  fireEvent.click(one);
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["two", "three", "one"]);
  expect(one.getAttribute("aria-pressed")).toBe("true");
  expect(transfer.effectAllowed).toBe("move");
});

it("cancels a drag without changing order", () => {
  render(<Tabs />);
  const one = screen.getByRole("button", { name: "one" });
  const two = screen.getByRole("button", { name: "two" });
  two.getBoundingClientRect = () => ({ left: 100, width: 100 }) as DOMRect;
  const transfer = { effectAllowed: "none", dropEffect: "none" };
  fireEvent.dragStart(one, { dataTransfer: transfer });
  fireEvent.dragOver(two, { clientX: 101, dataTransfer: transfer });
  fireEvent.dragEnd(one, { dataTransfer: transfer });
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["one", "two", "three"]);
  expect(two.dataset.tabDrop).toBeUndefined();
});
