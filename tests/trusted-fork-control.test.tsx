// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedForkControl, type TrustedForkControlProps } from "../app/components/TrustedForkControl";
import type { TrustedSnapshot } from "../protocol/trusted-local";

const parentToken = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const secondToken = "33333333-3333-4333-8333-333333333333";
function parent(patch: Partial<TrustedSnapshot> = {}): TrustedSnapshot {
  return { instanceId, profile: "trusted-local", workspace: "/fixed/repository", preparation: null,
    runToken: parentToken, status: "ready", output: "", threadId: "parent-thread", turnId: null,
    forkPoint: { threadId: "parent-thread", turnId: "completed-turn" }, approvals: [], message: "Ready", ...patch };
}
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const instructions = () => screen.getByRole("textbox", { name: "Child instructions" }) as HTMLTextAreaElement;
const submit = () => screen.getByRole("button", { name: "Fork child conversation" }) as HTMLButtonElement;
const form = () => screen.getByRole("form", { name: "Fork child conversation" });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("explicit trusted child forks", () => {
  it("discloses the shared directory and never sends before valid explicit submission", async () => {
    const fork = vi.fn<TrustedForkControlProps["onFork"]>(async () => {});
    render(<TrustedForkControl parent={parent()} onFork={fork} />);
    expect(screen.getByText("Shared working directory: /fixed/repository")).toBeTruthy();
    expect(screen.getByText("Shares this directory; not an isolated worktree.")).toBeTruthy();
    expect(screen.getByText(/normal configured model/)).toBeTruthy();
    expect(submit().disabled).toBe(true);
    expect(fork).not.toHaveBeenCalled();
    fireEvent.change(instructions(), { target: { value: "  Check the parser independently.\n" } });
    fireEvent.click(submit());
    await screen.findByText(/Fork request acknowledged/);
    expect(fork).toHaveBeenCalledExactlyOnceWith({ token: parentToken, childToken: expect.any(String),
      expectedInstanceId: instanceId, expectedThreadId: "parent-thread", expectedTurnId: "completed-turn",
      text: "Check the parser independently.", model: null });
    expect(fork.mock.calls[0][0].childToken).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(instructions().value).toBe("");
  });

  it("guards rapid clicks and direct submits while an acknowledgement is held", async () => {
    const ack = deferred(), fork = vi.fn<TrustedForkControlProps["onFork"]>(() => ack.promise);
    render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "Review edge cases" } });
    const button = submit(), node = form();
    act(() => { fireEvent.click(button); fireEvent.click(button); fireEvent.submit(node); });
    expect(fork).toHaveBeenCalledTimes(1);
    expect(instructions().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Requesting fork…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(instructions(), { target: { value: "Cannot replace a pending intent" } });
    expect(instructions().value).toBe("Review edge cases");
    await act(async () => ack.resolve());
    fireEvent.submit(node);
    expect(fork).toHaveBeenCalledTimes(1);
  });

  it("does not replay an uncertain result until edited explicit intent uses a fresh child token", async () => {
    const ack = deferred(), fork = vi.fn<TrustedForkControlProps["onFork"]>()
      .mockImplementationOnce(() => ack.promise).mockResolvedValue(undefined);
    const view = render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "Review the source" } });
    fireEvent.click(submit());
    await act(async () => ack.reject(new Error("Acknowledgement lost")));
    expect(screen.getByRole("status").textContent).toMatch(/outcome unknown.*Inspect runs.*will not be replayed/);
    expect(instructions().value).toBe("Review the source");
    expect(submit().disabled).toBe(true);
    fireEvent.submit(form());
    view.rerender(<TrustedForkControl parent={parent({ message: "Read-only observation changed" })} onFork={fork} />);
    fireEvent.submit(form());
    expect(fork).toHaveBeenCalledTimes(1);
    fireEvent.change(instructions(), { target: { value: "Review different source" } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await screen.findByText(/Fork request acknowledged/);
    expect(fork).toHaveBeenCalledTimes(2);
    expect(fork.mock.calls[1][0].childToken).not.toBe(fork.mock.calls[0][0].childToken);
  });

  it.each([
    { runToken: null }, { status: "running" }, { status: "closed" }, { archived: true },
    { forkPoint: undefined }, { forkPoint: null },
    { forkPoint: { threadId: "other-thread", turnId: "completed-turn" } },
    { forkPoint: { threadId: "parent-thread", turnId: " " } },
    { forkPoint: { threadId: "parent-thread", turnId: "bad\0turn" } },
    { forkPoint: { threadId: "parent-thread", turnId: "é".repeat(129) } },
  ] satisfies Partial<TrustedSnapshot>[])("does not offer an actionable form for an ineligible parent %j", (patch) => {
    const fork = vi.fn<TrustedForkControlProps["onFork"]>(async () => {});
    render(<TrustedForkControl parent={parent(patch)} onFork={fork} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Fork child conversation" })).toBeNull();
    expect(fork).not.toHaveBeenCalled();
  });

  it("revalidates disabled and parent readiness at submission rather than trusting the button", () => {
    const fork = vi.fn<TrustedForkControlProps["onFork"]>(async () => {});
    const view = render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "A deliberate draft" } });
    view.rerender(<TrustedForkControl parent={parent()} onFork={fork} disabled />);
    fireEvent.submit(form());
    expect(fork).not.toHaveBeenCalled();
    expect(submit().disabled).toBe(true);
    const previousForm = form();
    view.rerender(<TrustedForkControl parent={parent({ status: "running" })} onFork={fork} />);
    fireEvent.submit(previousForm);
    expect(fork).not.toHaveBeenCalled();
  });

  it.each(["   \n\t", "contains\0nul", "é".repeat(8193), "a".repeat(16385)])("rejects blank, NUL or over-limit input (%#)", (value) => {
    const fork = vi.fn<TrustedForkControlProps["onFork"]>(async () => {});
    render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value } });
    expect(submit().disabled).toBe(true);
    expect(instructions().getAttribute("aria-invalid")).toBe("true");
    fireEvent.submit(form());
    expect(fork).not.toHaveBeenCalled();
  });

  it("accepts exactly the UTF-8 limit, not a UTF-16 approximation", async () => {
    const fork = vi.fn<TrustedForkControlProps["onFork"]>(async () => {}), text = "é".repeat(8192);
    render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: text } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await screen.findByText(/Fork request acknowledged/);
    expect(fork.mock.calls[0][0].text).toBe(text);
  });

  it.each([
    { runToken: secondToken },
    { instanceId: "44444444-4444-4444-8444-444444444444" },
    { workspace: "/different/repository" },
    { forkPoint: { threadId: "parent-thread", turnId: "new-completed-turn" } },
  ] satisfies Partial<TrustedSnapshot>[])("resets the intent boundary and ignores stale successful completion %j", async (patch) => {
    const ack = deferred(), fork = vi.fn<TrustedForkControlProps["onFork"]>(() => ack.promise);
    const view = render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "Old parent intent" } });
    fireEvent.click(submit());
    view.rerender(<TrustedForkControl parent={parent(patch)} onFork={fork} />);
    expect(instructions().value).toBe("");
    fireEvent.change(instructions(), { target: { value: "New parent intent" } });
    await act(async () => ack.resolve());
    expect(instructions().value).toBe("New parent intent");
    expect(screen.queryByRole("status")).toBeNull();
    expect(fork).toHaveBeenCalledTimes(1);
    expect(submit().disabled).toBe(false);
  });

  it("does not let the previous parent's acknowledgement unlock a new pending fork", async () => {
    const oldAck = deferred(), newAck = deferred(), fork = vi.fn<TrustedForkControlProps["onFork"]>()
      .mockImplementationOnce(() => oldAck.promise).mockImplementationOnce(() => newAck.promise);
    const view = render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "Old parent intent" } });
    fireEvent.click(submit());
    view.rerender(<TrustedForkControl parent={parent({ runToken: secondToken })} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "New parent intent" } });
    fireEvent.click(submit());
    expect(fork.mock.calls[1][0]).toMatchObject({ token: secondToken, text: "New parent intent" });
    await act(async () => oldAck.resolve());
    expect(instructions().value).toBe("New parent intent");
    expect(instructions().disabled).toBe(true);
    fireEvent.submit(form());
    expect(fork).toHaveBeenCalledTimes(2);
    await act(async () => newAck.resolve());
    expect(instructions().value).toBe("");
    expect(instructions().disabled).toBe(false);
  });

  it("ignores stale rejection even after selecting the original parent again", async () => {
    const ack = deferred(), fork = vi.fn<TrustedForkControlProps["onFork"]>(() => ack.promise);
    const view = render(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "Old intent" } });
    fireEvent.click(submit());
    view.rerender(<TrustedForkControl parent={parent({ runToken: secondToken })} onFork={fork} />);
    view.rerender(<TrustedForkControl parent={parent()} onFork={fork} />);
    fireEvent.change(instructions(), { target: { value: "New intent for original parent" } });
    await act(async () => ack.reject(new Error("Old outcome unknown")));
    expect(instructions().value).toBe("New intent for original parent");
    expect(screen.queryByRole("status")).toBeNull();
    expect(submit().disabled).toBe(false);
    expect(fork).toHaveBeenCalledTimes(1);
  });
});
