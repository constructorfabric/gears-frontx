import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CalendarRef } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CalendarList } from "../calendar-list";
import type { CalendarListProps } from "../calendar-list";

const CALENDARS: readonly CalendarRef[] = [
  { colorFamily: "turquoise", id: "cal-courses", name: "Courses" },
  { colorFamily: "purple", id: "cal-exams", name: "Exams" },
  { colorFamily: "orange", id: "cal-events", name: "Events" },
];

const baseProps = (
  overrides: Partial<CalendarListProps> = {}
): CalendarListProps => ({
  calendars: CALENDARS,
  direction: "ltr",
  hiddenCalendarIds: [],
  onHiddenCalendarIdsChange: vi.fn<() => void>(),
  t,
  ...overrides,
});

describe(CalendarList, () => {
  it("renders every calendar as a checked-by-default colour legend row", () => {
    render(<CalendarList {...baseProps()} />);

    expect(screen.getByRole("region", { name: "Calendars" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Courses" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Exams" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Events" })).toBeChecked();
  });

  it("derives checked state from hidden ids and emits the complete hidden-id list", async () => {
    const onHiddenCalendarIdsChange =
      vi.fn<(hiddenCalendarIds: readonly string[]) => void>();

    render(
      <CalendarList
        {...baseProps({
          hiddenCalendarIds: ["cal-exams"],
          onHiddenCalendarIdsChange,
        })}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Courses" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Exams" })).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Courses" }));

    expect(onHiddenCalendarIdsChange).toHaveBeenCalledWith([
      "cal-exams",
      "cal-courses",
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Exams" }));

    expect(onHiddenCalendarIdsChange).toHaveBeenLastCalledWith([]);
  });

  it("passes each calendar and hidden state to the renderCalendar slot", () => {
    const renderCalendar = vi.fn<
      (calendar: CalendarRef, hidden: boolean) => React.ReactNode
    >((calendar: CalendarRef, hidden: boolean) => (
      <span>{`${calendar.name}:${hidden ? "hidden" : "visible"}`}</span>
    ));

    render(
      <CalendarList
        {...baseProps({ hiddenCalendarIds: ["cal-exams"], renderCalendar })}
      />
    );

    expect(screen.getByText("Courses:visible")).toBeVisible();
    expect(screen.getByText("Exams:hidden")).toBeVisible();
    expect(renderCalendar).toHaveBeenCalledWith(CALENDARS[0], false);
    expect(renderCalendar).toHaveBeenCalledWith(CALENDARS[1], true);
  });

  it("uses the creation callback without inventing a creation form", async () => {
    const onCreateCalendar = vi.fn<() => void>();

    render(<CalendarList {...baseProps({ onCreateCalendar })} />);

    const create = screen.getByRole("button", { name: "Create calendar" });
    const user = userEvent.setup();
    await user.click(create);

    expect(onCreateCalendar).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows the creation affordance to be replaced by a slot", () => {
    render(
      <CalendarList
        {...baseProps({
          renderCreateCalendar: () => (
            <button type="button">Open calendar settings</button>
          ),
        })}
      />
    );

    expect(
      screen.getByRole("button", { name: "Open calendar settings" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create calendar" })
    ).toBeNull();
  });

  it("renders the ordinary empty collection section when there are no calendars", () => {
    render(<CalendarList {...baseProps({ calendars: [] })} />);

    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
