// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { BuildResources } from "../app/renderer/build-resources/BuildResources";
import type { Job } from "../protocol/schema";

afterEach(cleanup);
const job: Job = { id: "build:1", label: "bazel build //lib:core", kind: "build", status: "running", progress: 0.43,
  resources: { cpuPercent: 0, memoryMiB: 0 }, message: "Compiling source" };

describe("Builds & resources instrument", () => {
  it("is compact when idle and makes the example discoverable without pretending it is live", () => {
    render(<BuildResources jobs={[]} />);
    expect(screen.getByText("No derived work running")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Example profile/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Illustrative Bazel profile" })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("opens and closes by keyboard, retains external source and makes statistical basis available", async () => {
    const user = userEvent.setup();
    render(<><textarea aria-label="Existing source" defaultValue="unsaved source" /><BuildResources jobs={[]} /></>);
    const source = screen.getByRole("textbox") as HTMLTextAreaElement;
    source.setSelectionRange(2, 5);
    const toggle = screen.getByRole("button", { name: /Example profile/ });
    toggle.focus();
    await user.keyboard("{Enter}");
    const example = screen.getByRole("region", { name: "Illustrative Bazel profile" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(example.id);
    expect(within(example).getByText("12 synthetic samples · 60 s window · every 5 s")).toBeTruthy();
    expect(within(example).getByText("//demo:build")).toBeTruthy();
    const cpu = within(example).getByRole("region", { name: "Illustrative CPU distribution" });
    const memory = within(example).getByRole("region", { name: "Illustrative Memory distribution" });
    expect(within(cpu).getByText("% · 100% = 1 core")).toBeTruthy();
    expect(within(memory).getByText("MiB · resident memory")).toBeTruthy();
    expect(within(cpu).getByRole("img").getAttribute("aria-label")).toContain("12 illustrative samples");
    expect(within(cpu).getAllByText("720")).toHaveLength(2);
    expect(within(memory).getByText("1,040")).toBeTruthy();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Profile basis");
    await user.keyboard("{Enter}");
    // jsdom does not emulate native details key toggling; actual owned X11 proof does.
    expect(example.textContent).toContain("not the current job or repository");
    expect(example.textContent).toContain("p95 equals peak");
    expect(example.textContent).toContain("1,048,576 bytes");
    toggle.focus();
    await user.keyboard(" ");
    expect(screen.queryByRole("region", { name: "Illustrative Bazel profile" })).toBeNull();
    expect(screen.getByRole("textbox")).toBe(source);
    expect(source.value).toBe("unsaved source");
    expect(source.selectionStart).toBe(2); expect(source.selectionEnd).toBe(5);
  });

  it("preserves identity, status, progress and full failure information", () => {
    const h = render(<BuildResources jobs={[job]} />);
    expect(h.container.querySelector("[data-job-id='build:1']")).not.toBeNull();
    expect(screen.getByText(job.label)).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByText("43%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0.43");
    expect(screen.getByText("Compiling source")).toBeTruthy();
    expect(screen.getByText("No resource samples")).toBeTruthy();
    expect(screen.queryByText("CPU 0%")).toBeNull();
    const message = "Failed: missing dependency\n//lib:core must include //lib:types";
    h.rerender(<BuildResources jobs={[{ ...job, status: "failed", message }]} />);
    expect(screen.getByText("failed")).toBeTruthy();
    expect(h.container.querySelector(".resource-job-message")?.textContent).toBe(message);
    h.rerender(<BuildResources jobs={[{ ...job, status: "succeeded", progress: 1 }]} />);
    expect(screen.getByText("succeeded")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("1");
  });

  it("does not manufacture percentiles or live attribution from a single provider value", () => {
    const h = render(<BuildResources jobs={[{ ...job, resources: { cpuPercent: 0, memoryMiB: 612 } }]} />);
    expect(screen.getByText("Unverified resource snapshot")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText("612 MiB")).toBeTruthy();
    expect(screen.getByText(/Single provider values, not a distribution/)).toBeTruthy();
    expect(screen.getByText(/these may be fixture values/)).toBeTruthy();
    expect(screen.queryByText("p95")).toBeNull();
    h.rerender(<BuildResources jobs={[{ ...job, resources: { cpuPercent: 24, memoryMiB: 0 } }]} />);
    expect(screen.getByText("24%")).toBeTruthy();
    expect(screen.getByText("0 MiB")).toBeTruthy();
  });

  it("keeps the illustrative scenario unchanged when jobs advance, disappear or switch", async () => {
    const user = userEvent.setup();
    const h = render(<BuildResources jobs={[job]} />);
    await user.click(screen.getByRole("button", { name: /Example profile/ }));
    const example = screen.getByRole("region", { name: "Illustrative Bazel profile" });
    const before = example.textContent;
    h.rerender(<BuildResources jobs={[{ ...job, id: "another-job", resources: { cpuPercent: 420, memoryMiB: 2048 }, progress: 0.9 }]} />);
    expect(screen.getByRole("region", { name: "Illustrative Bazel profile" })).toBe(example);
    expect(example.textContent).toBe(before);
    h.rerender(<BuildResources jobs={[]} />);
    expect(example.textContent).toBe(before);
    expect(screen.getByText("No derived work running")).toBeTruthy();
  });
});
