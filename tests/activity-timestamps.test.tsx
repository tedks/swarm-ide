// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalActivity, JournalPanel } from "../app/renderer/changelog/JournalPanel";
import { syntheticJournal } from "./journal-fixture";
import { ActivityTime } from "../app/renderer/ActivityTime";

afterEach(cleanup);

describe("activity timestamps", () => {
  it("preserves an offset instant with an exact ISO and local timezone in accessible detail", () => {
    render(<ActivityTime at="2026-09-07T23:59:58-04:00" />);
    const time = document.querySelector("time")!;
    expect(time.dateTime).toBe("2026-09-08T03:59:58.000Z");
    expect(time.title).toContain("2026-09-08T03:59:58.000Z");
    expect(time.title).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(time.getAttribute("aria-label")).toBe(time.title);
    expect(time.textContent).toBe(new Date(time.dateTime).toLocaleString([], {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
  });

  it("does not create invalid semantic times for absent or malformed presentation inputs", () => {
    render(<><ActivityTime /><ActivityTime at="not a timestamp" /></>);
    expect(screen.getByText("Time not recorded")).toBeTruthy();
    expect(screen.getByText("Time unavailable")).toBeTruthy();
    expect(document.querySelector("time")).toBeNull();
  });

  it("labels generated and last-read instants separately from cited work in the feed and central log", () => {
    const observation = syntheticJournal().result;
    observation.observedAt = "2026-09-08T06:02:00Z";
    const state = { observation, busy: false, notice: "", refresh: vi.fn() };
    const onOpen = vi.fn();
    render(<><JournalActivity state={state} onOpen={onOpen} /><JournalPanel state={state} open selectedEntry={null} onClose={vi.fn()} onOpenSource={vi.fn()} /></>);
    const feed = document.querySelector(".journal-activity")!;
    const panel = document.querySelector(".journal-panel")!;
    for (const surface of [feed, panel]) {
      expect(surface.textContent).toContain("Generated");
      expect(surface.textContent).toContain("Last read");
      expect(surface.textContent).toContain("not live");
      expect(surface.querySelector(`time[datetime="${new Date(observation.document.generatedAt).toISOString()}"]`)).toBeTruthy();
      expect(surface.querySelector(`time[datetime="${new Date(observation.observedAt).toISOString()}"]`)).toBeTruthy();
    }
    const entry = screen.getByRole("button", { name: /Synthetic change/ });
    expect(entry.textContent).toContain("Evidence");
    expect(entry.querySelector("time")?.dateTime).toBe("2026-09-07T12:00:00.000Z");
    fireEvent.click(entry);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("change-a");
    fireEvent.click(screen.getByLabelText("Refresh logical changes"));
    expect(state.refresh).toHaveBeenCalledExactlyOnceWith();
  });

  it("shows the chronological range of cited evidence only, preserving input order and different calendar dates", () => {
    const observation = syntheticJournal().result;
    observation.bundle.evidence[0].at = "2026-09-08T12:00:00Z";
    observation.bundle.evidence.push(
      { ...observation.bundle.evidence[0], id: "earlier", at: "2026-09-06T12:00:00Z" },
      { ...observation.bundle.evidence[0], id: "not-cited", at: "2020-01-01T00:00:00Z" },
    );
    observation.document.entries[0].intent.evidenceIds = ["evidence:a", "earlier"];
    const originalIds = observation.bundle.evidence.map((item) => item.id);
    render(<JournalActivity state={{ observation, busy: false, notice: "", refresh: vi.fn() }} onOpen={vi.fn()} />);
    const row = screen.getByRole("button", { name: /Synthetic change/ });
    const times = [...row.querySelectorAll("time")];
    expect(times.map((time) => time.dateTime)).toEqual(["2026-09-06T12:00:00.000Z", "2026-09-08T12:00:00.000Z"]);
    expect(times[0].textContent).not.toBe(times[1].textContent);
    expect(observation.bundle.evidence.map((item) => item.id)).toEqual(originalIds);
  });
});
