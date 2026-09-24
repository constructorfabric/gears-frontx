import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  allDayEvent,
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import type { CalendarEvent, CalendarEventGeometry } from "../../../core/model";
import { calendarDate } from "../../../core/model";
import { EventCard } from "../event-card";
import type { EventCardProps } from "../event-card";

import cardStyles from "../event-card.module.css";

const DATE = calendarDate("2026-08-24");

const TIMED_EVENT = { id: "timed-1", title: "Chemistry lab" };

const ALL_DAY_EVENT = {
  colorFamily: "purple" as const,
  endDate: calendarDate("2026-08-25"),
  id: "allday-1",
  startDate: DATE,
  title: "Faculty meeting",
};

const renderCard = (overrides: Partial<EventCardProps> = {}) =>
  render(
    <EventCard
      event={timedEvent(TIMED_EVENT)}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );

const eventGeometry = (height: number): CalendarEventGeometry => ({
  height,
  inlineSize: 120,
  insetInlineStart: 0,
  top: 0,
  zIndex: 1,
});

describe("EventCard default timed time row", () => {
  it("pairs the clock icon with the range on the default timed row (G-09)", () => {
    renderCard();
    const card = screen.getByRole("button", { name: /Chemistry lab/u });
    const timeRow = card.querySelector<HTMLElement>(
      '[data-event-card-time="true"]'
    );

    expect(timeRow?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(card.textContent).toMatch(/9:00/u);
    expect(card.textContent).toMatch(/10:00/u);
  });

  it("applies the module timeIcon class to the rendered clock icon", () => {
    const { container } = renderCard();
    const card = screen.getByRole("button", { name: /Chemistry lab/u });
    const icon = card.querySelector("svg.lucide-clock");

    expect(icon?.getAttribute("class")).toContain("timeIcon");
    expect(container.querySelector(`[class*="timeIcon"]`)).toBe(icon);
  });

  it("renders no clock icon for an all-day event", () => {
    const { container } = renderCard({ event: allDayEvent(ALL_DAY_EVENT) });
    const card = screen.getByRole("button", { name: /Faculty meeting/u });

    expect(card).toHaveClass(cardStyles.allDay);
    expect(card.textContent).toContain("All day");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector('[data-event-card-bar="true"]')).toBeNull();
  });

  it("uses the muted state for a past event", () => {
    renderCard({ past: true });

    expect(screen.getByRole("button", { name: /Chemistry lab/u })).toHaveClass(
      cardStyles.past
    );
  });

  it("renders no clock icon when the consumer supplies renderTime", () => {
    const renderTime = vi.fn<() => ReactNode>(() => (
      <span>09:00–10:00 CET</span>
    ));
    const { container } = renderCard({ renderTime });

    expect(screen.getByText("09:00–10:00 CET")).toBeVisible();
    expect(container.querySelector("svg.lucide-clock")).toBeNull();
    expect(renderTime).toHaveBeenCalledOnce();
  });
});

const metadataEvent = (): CalendarEvent => ({
  ...timedEvent(TIMED_EVENT),
  eventType: "Course",
  location: "B-107 (classroom)",
  organizer: "Dr. Smith",
});

describe("EventCard default metadata rows", () => {
  it("renders the populated location, organizer, and type rows", () => {
    renderCard({ event: metadataEvent() });

    const card = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(card).toHaveTextContent("B-107 (classroom)");
    expect(card).toHaveTextContent("Dr. Smith");
    expect(card).toHaveTextContent("Course");
  });

  it("marks each populated metadata row with its field icon", () => {
    renderCard({ event: metadataEvent() });

    const card = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(card.querySelector("svg.lucide-map-pin")).not.toBeNull();
    expect(card.querySelector("svg.lucide-user")).not.toBeNull();
    expect(card.querySelector("svg.lucide-tag")).not.toBeNull();
  });

  it("omits metadata rows when their values are absent or blank", () => {
    const event = {
      ...timedEvent(TIMED_EVENT),
      eventType: undefined,
      location: " ",
      organizer: null,
    };

    renderCard({ event });
    const card = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(card).not.toHaveTextContent(/B-107|Dr\. Smith|Course/iu);
  });

  it("derives metadata visibility from geometry height", () => {
    const event = metadataEvent();
    const { unmount } = renderCard({ event, geometry: eventGeometry(40) });
    const shortCard = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(shortCard).toHaveAttribute("data-event-card-compact", "true");
    expect(shortCard).not.toHaveTextContent(/B-107|Dr\. Smith|Course/iu);

    unmount();
    renderCard({ event, geometry: eventGeometry(88) });
    const tallCard = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(tallCard).toHaveAttribute("data-event-card-compact", "true");
    expect(tallCard).toHaveTextContent(
      /B-107 \(classroom\)[\s\S]*Dr\. Smith[\s\S]*Course/iu
    );
  });

  it("uses geometry for density without positioning when the host owns the frame", () => {
    const event = metadataEvent();
    renderCard({ event, geometry: eventGeometry(129), positioned: false });

    const card = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(card).toHaveAttribute("data-event-card-compact", "false");
    expect(card).toHaveTextContent("B-107 (classroom)");
    expect(card).toHaveTextContent("Dr. Smith");
    expect(card).toHaveTextContent("Course");
    expect(card).not.toHaveAttribute("style");
  });

  it("does not install a ResizeObserver during render", () => {
    const observerConstructor = vi.spyOn(globalThis, "ResizeObserver");

    try {
      renderCard({ geometry: eventGeometry(40) });
      expect(observerConstructor).not.toHaveBeenCalled();
    } finally {
      observerConstructor.mockRestore();
    }
  });
});

describe("EventCard recurrence indicator", () => {
  it("shows the recurrence icon only for a non-empty recurrence rule", () => {
    const event = { ...timedEvent(TIMED_EVENT), recurrenceRule: "FREQ=WEEKLY" };

    renderCard({ event });

    const card = screen.getByRole("button", { name: /Chemistry lab/u });
    const icon = card.querySelector("svg.lucide-refresh-cw");

    expect(card).toHaveClass(cardStyles.recurring);
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("does not show the recurrence icon for a blank recurrence rule", () => {
    const event = { ...timedEvent(TIMED_EVENT), recurrenceRule: " " };

    renderCard({ event });

    expect(
      screen.getByRole("button", { name: /Chemistry lab/u })
    ).not.toHaveClass(cardStyles.recurring);
    expect(document.querySelector("svg.lucide-refresh-cw")).toBeNull();
  });
});

describe("EventCard visual identity", () => {
  it("resolves the family modifier and renders a dedicated leading colour bar", () => {
    renderCard();

    const card = screen.getByRole("button", { name: /Chemistry lab/u });
    const bar = card.querySelector('[data-event-card-bar="true"]');

    expect(card).toHaveClass(cardStyles.colorTurquoise);
    expect(bar).toHaveClass(cardStyles.colorBar);
    expect(bar).toHaveAttribute("aria-hidden", "true");
  });

  it("marks past cards", () => {
    renderCard({ past: true });

    const card = screen.getByRole("button", { name: /Chemistry lab/u });

    expect(card).toHaveClass(cardStyles.past);
  });
});
