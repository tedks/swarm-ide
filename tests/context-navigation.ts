import { fireEvent, screen } from "@testing-library/react";

/** Ordinary explicit UI gesture, never a legacy subjectless widget or injected bridge call. */
export async function openContextPath(path: string) {
  await screen.findByRole("button", { name: /Search, navigate, direct/ });
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const input = screen.getByRole("textbox", { name: "Workspace command" });
  fireEvent.change(input, { target: { value: "Open repository path" } });
  fireEvent.keyDown(input, { key: "Enter" });
  const exact = await screen.findByRole("textbox", { name: "Exact repository path" });
  fireEvent.change(exact, { target: { value: path } });
  fireEvent.keyDown(exact, { key: "Enter" });
}
