// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalActivity, JournalPanel } from "../app/renderer/changelog/JournalPanel";
import { syntheticJournal } from "./journal-fixture";
import { ActivityTime } from "../app/renderer/ActivityTime";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("activity timestamps", () => {
  it("keeps the exact instant machine-readable with one human-readable full timestamp on hover", () => {
    render(<ActivityTime at="2026-09-07T23:59:58-04:00" />);
    const time = document.querySelector("time")!;
    expect(time.dateTime).toBe("2026-09-08T03:59:58.000Z");
    expect(time.title).toBe(new Date(time.dateTime).toLocaleString([], {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
    }));
    expect(time.title).not.toContain("2026-09-08T03:59:58.000Z");
    expect(time.title).not.toContain(" · ");
    expect(time.getAttribute("aria-label")).toBe(time.title);
  });

  it("shows only time today and restores the date after local midnight on the next render", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const date = new Date(2026, 8, 7, 23, 10, 45);
    vi.setSystemTime(new Date(2026, 8, 7, 23, 59, 59));
    const view = render(<ActivityTime at={date.toISOString()} />);
    const time = document.querySelector("time")!;
    expect(time.textContent).toBe(date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    vi.setSystemTime(new Date(2026, 8, 8, 0, 0, 0));
    view.rerender(<ActivityTime at={date.toISOString()} />);
    expect(time.textContent).toBe(date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    expect(time.dateTime).toBe(date.toISOString());
  });

  it("includes the year only for another year and does not treat the same day number as today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 7, 12, 0));
    const earlier = new Date(2025, 8, 7, 9, 5);
    const view = render(<ActivityTime at={earlier.toISOString()} />);
    expect(document.querySelector("time")!.textContent).toBe(earlier.toLocaleString([], {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }));
    const previousMonth = new Date(2026, 7, 7, 9, 5);
    view.rerender(<ActivityTime at={previousMonth.toISOString()} />);
    expect(document.querySelector("time")!.textContent).toBe(previousMonth.toLocaleString([], {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }));
  });

  it("does not create invalid semantic times for absent or malformed presentation inputs", () => {
    render(<><ActivityTime /><ActivityTime at="not a timestamp" /></>);
    expect(screen.getByText("Time not recorded")).toBeTruthy();
    expect(screen.getByText("Time unavailable")).toBeTruthy();
    expect(document.querySelector("time")).toBeNull();
  });

  it("shows cited work without generation/read metadata in the feed or main log, retaining provenance in details", () => {
    const observation = syntheticJournal().result;
    observation.observedAt = "2026-09-08T06:02:00Z";
    const state = { observation, busy: false, notice: "", refresh: vi.fn() };
    const onOpen = vi.fn();
    render(<><JournalActivity state={state} onOpen={onOpen} /><JournalPanel state={state} open selectedEntry={null} onClose={vi.fn()} onOpenSource={vi.fn()} /></>);
    const feed = document.querySelector(".journal-activity")!;
    const panel = document.querySelector(".journal-panel")!;
    for (const surface of [feed, panel]) {
      expect(surface.querySelector(".journal-freshness")).toBeNull();
      expect(surface.textContent).toContain("Recorded");
      expect(surface.querySelector(`time[datetime="${new Date(observation.document.generatedAt).toISOString()}"]`)).toBeNull();
      expect(surface.querySelector(`time[datetime="${new Date(observation.observedAt).toISOString()}"]`)).toBeNull();
    }
    const provenance = panel.querySelector<HTMLDetailsElement>(".journal-provenance")!;
    expect(provenance.open).toBe(false);
    expect(provenance.textContent).toContain(`Generated ${observation.document.generatedAt}`);
    expect(provenance.textContent).toContain(`Observed ${observation.observedAt}`);
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
