import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import {
  allDayEvent,
  instant,
  timedEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { MonthNavigator } from "../month-navigator";
import type { MonthNavigatorProps } from "../month-navigator";

import styles from "../month-navigator.module.css";

const DATE = calendarDate("2026-08-24");

const baseProps = (
  overrides: Partial<MonthNavigatorProps> = {}
): MonthNavigatorProps => ({
  direction: "ltr",
  events: [],
  locale: "en-US",
  onSelectDate: () => {},
  selectedDate: DATE,
  t,
  timeZone: UTC,
  ...overrides,
});

const cell = (name: string | RegExp): HTMLElement =>
  screen.getByRole("gridcell", { name });

describe(MonthNavigator, () => {
  it("renders a labelled month grid with weekday headers and one selected day", () => {
    render(<MonthNavigator {...baseProps()} />);

    assert(
      screen.getByRole("region", { name: "Month navigator" })
    ).toBeVisible();
    assert(screen.getByRole("heading", { name: "August 2026" })).toBeVisible();
    assert(screen.getAllByRole("columnheader")).toHaveLength(7);

    assert(cell("Monday, August 24, 2026")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    assert(cell("Monday, August 24, 2026")).toHaveAttribute("tabindex", "0");
  });

  it("uses the injected now for the default selected date and today marker", () => {
    render(
      <MonthNavigator
        {...baseProps({
          defaultSelectedDate: undefined,
          now: instant("2026-08-24", "12:00"),
          selectedDate: undefined,
        })}
      />
    );

    const today = cell("Monday, August 24, 2026");
    assert(today).toHaveAttribute("aria-selected", "true");
    assert(today).toHaveClass(styles.dayToday);
  });

  it("keeps outside-month days in the grid and lets the caller select one", async () => {
    const onSelectDate = vi.fn<(date: string) => void>();

    render(
      <MonthNavigator
        {...baseProps({
          onSelectDate,
        })}
      />
    );

    const outside = cell("Monday, July 27, 2026");

    assert(outside).toHaveAttribute("tabindex", "-1");

    const user = userEvent.setup();
    await user.click(outside);

    assert(onSelectDate).toHaveBeenCalledWith("2026-07-27");
  });

  it("marks every viewer day touched by all-day and midnight-spanning events", () => {
    render(
      <MonthNavigator
        {...baseProps({
          events: [
            allDayEvent("exam", "2026-08-10", "2026-08-13"),
            timedEvent(
              "overnight",
              "2026-08-20",
              "23:00",
              "2026-08-21",
              "01:00"
            ),
          ],
        })}
      />
    );

    assert(cell(/Monday, August 10, 2026, has events/u)).toBeVisible();
    assert(cell(/Tuesday, August 11, 2026, has events/u)).toBeVisible();
    assert(cell(/Wednesday, August 12, 2026, has events/u)).toBeVisible();
    assert(cell(/Thursday, August 13, 2026$/u)).toBeVisible();
    assert(cell(/Thursday, August 20, 2026, has events/u)).toBeVisible();
    assert(cell(/Friday, August 21, 2026, has events/u)).toBeVisible();
  });

  it("uses the renderDay slot with the date and event-dot state", () => {
    const renderDay = vi.fn<(date: string, hasEvents: boolean) => ReactNode>(
      (date: string, hasEvents: boolean) => (
        <span>{`${date}:${hasEvents ? "event" : "empty"}`}</span>
      )
    );

    render(
      <MonthNavigator
        {...baseProps({
          events: [
            timedEvent(
              "chemistry",
              "2026-08-26",
              "09:00",
              "2026-08-26",
              "10:00"
            ),
          ],
          renderDay,
        })}
      />
    );

    assert(screen.getByText("2026-08-26:event")).toBeVisible();
    assert(renderDay).toHaveBeenCalledWith("2026-08-26", true);
  });

  it("reports Enter and Space activation without changing the visible month", async () => {
    const onSelectDate = vi.fn<(date: string) => void>();

    render(
      <MonthNavigator
        {...baseProps({
          onSelectDate,
        })}
      />
    );

    const selected = cell("Monday, August 24, 2026");
    selected.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    assert(onSelectDate).toHaveBeenNthCalledWith(1, "2026-08-24");
    assert(onSelectDate).toHaveBeenNthCalledWith(2, "2026-08-24");
    assert(screen.getByRole("heading", { name: "August 2026" })).toBeVisible();
  });

  it("walks days, moves focus across month boundaries, and defers focus until the new month exists", async () => {
    render(<MonthNavigator {...baseProps()} />);

    const selected = cell("Monday, August 24, 2026");
    selected.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowDown}");

    assert(cell("Monday, August 31, 2026")).toHaveAttribute("tabindex", "0");
    assert(cell("Monday, August 31, 2026")).toHaveFocus();

    await user.keyboard("{ArrowDown}");

    assert(
      screen.getByRole("heading", { name: "September 2026" })
    ).toBeVisible();
    assert(cell("Monday, September 7, 2026")).toHaveAttribute("tabindex", "0");
    assert(cell("Monday, September 7, 2026")).toHaveFocus();
  });

  it("uses PageUp and PageDown for whole months and Home and End for week edges", async () => {
    render(<MonthNavigator {...baseProps()} />);

    const selected = cell("Monday, August 24, 2026");
    selected.focus();
    const user = userEvent.setup();
    await user.keyboard("{PageDown}");

    assert(
      screen.getByRole("heading", { name: "September 2026" })
    ).toBeVisible();
    assert(cell("Thursday, September 24, 2026")).toHaveFocus();

    await user.keyboard("{Home}");

    assert(cell("Monday, September 21, 2026")).toHaveFocus();

    await user.keyboard("{End}");

    assert(cell("Sunday, September 27, 2026")).toHaveFocus();

    await user.keyboard("{PageUp}");

    assert(screen.getByRole("heading", { name: "August 2026" })).toBeVisible();
    assert(cell("Monday, August 24, 2026")).toHaveFocus();
  });

  it("follows a controlled date jump from the main calendar", () => {
    const { rerender } = render(<MonthNavigator {...baseProps()} />);

    rerender(
      <MonthNavigator
        {...baseProps({ selectedDate: calendarDate("2026-11-03") })}
      />
    );

    assert(
      screen.getByRole("heading", { name: "November 2026" })
    ).toBeVisible();
    assert(cell("Tuesday, November 3, 2026")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    assert(cell("Tuesday, November 3, 2026")).toHaveAttribute("tabindex", "0");
  });
});
