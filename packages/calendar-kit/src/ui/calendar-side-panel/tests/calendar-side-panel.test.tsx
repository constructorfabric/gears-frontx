import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarRef } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CalendarSidePanel } from "../calendar-side-panel";
import type { CalendarSidePanelProps } from "../calendar-side-panel";

const PANEL_ID = "calendar-side-panel";

const CALENDARS: readonly CalendarRef[] = [
  { colorFamily: "turquoise", id: "cal-courses", name: "Courses" },
  { colorFamily: "purple", id: "cal-exams", name: "Exams" },
];

const baseProps = (
  overrides: Partial<CalendarSidePanelProps> = {}
): CalendarSidePanelProps => ({
  calendars: CALENDARS,
  direction: "ltr",
  events: [],
  hiddenCalendarIds: [],
  id: PANEL_ID,
  locale: "en-US",
  onClose: vi.fn<() => void>(),
  onHiddenCalendarIdsChange: vi.fn<() => void>(),
  onRevealEvent: vi.fn<() => void>(),
  onSelectedTimeZoneIdChange: vi.fn<() => void>(),
  onWorldClockTimeZoneIdsChange: vi.fn<() => void>(),
  open: true,
  selectedDate: calendarDate("2026-08-24"),
  selectedTimeZoneId: null,
  t,
  timeZone: UTC,
  worldClockTimeZoneIds: [],
  ...overrides,
});

describe(CalendarSidePanel, () => {
  it("renders an accessible complementary region with stable id and close control", () => {
    render(<CalendarSidePanel {...baseProps()} />);

    const panel = screen.getByRole("complementary", {
      name: "Calendar side panel",
    });
    const close = screen.getByRole("button", { name: "Collapse panel" });

    expect(panel).toHaveAttribute("id", PANEL_ID);
    expect(close).toHaveAttribute("aria-expanded", "true");
    expect(close).toHaveAttribute("aria-controls", PANEL_ID);
  });

  it("keeps one toggle visible and supports controlled closed-to-open state", async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();

    const { rerender } = render(
      <CalendarSidePanel {...baseProps({ onOpenChange, open: false })} />
    );

    const open = screen.getByRole("button", { name: "Expand panel" });

    expect({
      controls: open.getAttribute("aria-controls"),
      expanded: open.getAttribute("aria-expanded"),
      panelBeforeOpen: screen.queryByRole("complementary", {
        name: "Calendar side panel",
      }),
    }).toStrictEqual({
      controls: PANEL_ID,
      expanded: "false",
      panelBeforeOpen: null,
    });

    const user = userEvent.setup();
    await user.click(open);

    rerender(
      <CalendarSidePanel {...baseProps({ onOpenChange, open: true })} />
    );

    expect({
      openChange: onOpenChange.mock.calls,
      panelVisible:
        screen.getByRole("complementary", {
          name: "Calendar side panel",
        }).textContent !== null,
      toggleAfterOpen: screen.queryByRole("button", {
        name: "Expand panel",
      }),
    }).toMatchObject({
      openChange: [[true]],
      panelVisible: true,
      toggleAfterOpen: null,
    });
  });

  it("closes from the panel toggle and reports the close intent", async () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<(open: boolean) => void>();

    render(<CalendarSidePanel {...baseProps({ onClose, onOpenChange })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Collapse panel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves focus to the collapse control when opened with a disconnected focus origin", () => {
    render(<CalendarSidePanel {...baseProps()} />);

    expect(
      screen.getByRole("button", { name: "Collapse panel" })
    ).toHaveFocus();
  });

  it("renders replaceable shell slots in place of the default sections", () => {
    render(
      <CalendarSidePanel
        {...baseProps({
          slots: {
            body: () => <div>Custom panel body</div>,
            header: () => <div>Custom panel header</div>,
            search: () => <div>Custom search</div>,
          },
        })}
      />
    );

    expect(screen.getByText("Custom panel header")).toBeVisible();
    expect(screen.getByText("Custom search")).toBeVisible();
    expect(screen.getByText("Custom panel body")).toBeVisible();
  });

  it("allows widget sections to be rearranged through named slots", () => {
    render(
      <CalendarSidePanel
        {...baseProps({
          slots: {
            calendarList: () => (
              <section aria-label="Calendars">Custom calendars</section>
            ),
            monthNavigator: () => (
              <section aria-label="Month navigator">Custom month</section>
            ),
            searchResults: () => (
              <section aria-label="Search results">Custom results</section>
            ),
            timeZones: () => (
              <section aria-label="Time zones">Custom zones</section>
            ),
            worldClocks: () => (
              <section aria-label="World clocks">Custom clocks</section>
            ),
          },
        })}
      />
    );

    expect(screen.getByRole("region", { name: "Calendars" })).toHaveTextContent(
      "Custom calendars"
    );
    expect(
      screen.getByRole("region", { name: "Month navigator" })
    ).toHaveTextContent("Custom month");
    expect(
      screen.getByRole("region", { name: "Time zones" })
    ).toHaveTextContent("Custom zones");
    expect(
      screen.getByRole("region", { name: "World clocks" })
    ).toHaveTextContent("Custom clocks");
    expect(screen.queryByRole("region", { name: "Search results" })).toBeNull();
  });

  it("swaps the widget stack for the search-results slot while a query is active", () => {
    render(
      <CalendarSidePanel
        {...baseProps({
          query: "stand",
          slots: {
            monthNavigator: () => (
              <section aria-label="Month navigator">Custom month</section>
            ),
            searchResults: () => (
              <section aria-label="Search results">Custom results</section>
            ),
          },
        })}
      />
    );

    expect(
      screen.getByRole("region", { name: "Search results" })
    ).toHaveTextContent("Custom results");
    expect(
      screen.queryByRole("region", { name: "Month navigator" })
    ).toBeNull();
  });

  it("passes the one controlled hidden-id contract to a supplied calendar-list slot", async () => {
    const onHiddenCalendarIdsChange =
      vi.fn<(hiddenCalendarIds: readonly string[]) => void>();

    render(
      <CalendarSidePanel
        {...baseProps({
          hiddenCalendarIds: ["cal-exams"],
          onHiddenCalendarIdsChange,
          slots: {
            calendarList: () => (
              <button
                type="button"
                onClick={() => {
                  onHiddenCalendarIdsChange([]);
                }}
              >
                Show all calendars
              </button>
            ),
          },
        })}
      />
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Show all calendars" })
    );

    expect(onHiddenCalendarIdsChange).toHaveBeenCalledWith([]);
  });

  it("does not invent a calendar-creation form when no creation slot is supplied", () => {
    render(<CalendarSidePanel {...baseProps()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create calendar" })
    ).toBeNull();
  });
});
