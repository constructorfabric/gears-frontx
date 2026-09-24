import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AGENDA_WINDOW_DAYS,
  addCalendarDays,
  calendarDate,
} from "../../../core/model";
import type { CalendarDate, CalendarView } from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import { CalendarToolbar } from "../calendar-toolbar";
import type { CalendarToolbarProps } from "../calendar-toolbar";

import toolbarStyles from "../calendar-toolbar.module.css";

const missingTranslation: CalendarTranslate = (key) => key;

const DATE = calendarDate("2026-08-24");

const toolbarProps = (
  overrides: Partial<CalendarToolbarProps> = {}
): CalendarToolbarProps => ({
  currentDate: DATE,
  direction: "ltr",
  locale: "en-US",
  onNext: () => {},
  onPrevious: () => {},
  onToday: () => {},
  onViewChange: () => {},
  t,
  ...overrides,
});

const renderToolbar = (overrides: Partial<CalendarToolbarProps> = {}) =>
  render(<CalendarToolbar {...toolbarProps(overrides)} />);

const toolbarRoot = (container: HTMLElement): HTMLElement => {
  const root = container.firstElementChild;

  if (!(root instanceof HTMLElement)) {
    throw new Error("toolbar root is missing");
  }
  return root;
};

const radio = (name: string): HTMLElement =>
  screen.getByRole("radio", { name });

const activeRadioName = (): string =>
  screen
    .getAllByRole("radio")
    .find(
      (radioElement) => radioElement.getAttribute("aria-checked") === "true"
    )?.textContent ?? "";

const VIEW_NAVIGATION = [
  {
    group: "Change day view",
    next: "Next day",
    previous: "Previous day",
    view: "day",
  },
  {
    group: "Change week view",
    next: "Next week",
    previous: "Previous week",
    view: "week",
  },
  {
    group: "Change month view",
    next: "Next month",
    previous: "Previous month",
    view: "month",
  },
  {
    group: "Change agenda view",
    next: "Next agenda range",
    previous: "Previous agenda range",
    view: "agenda",
  },
] as const;

describe("CalendarToolbar option set", () => {
  it("renders exactly the day, week, month and agenda options in a named radiogroup", () => {
    renderToolbar({ activeView: "day" });

    const group = screen.getByRole("radiogroup", { name: "View" });
    const radios = screen.getAllByRole("radio");

    expect({
      groupName: group.getAttribute("aria-label"),
      radioCount: radios.length,
      radioNames: radios.map((radioElement) => radioElement.textContent),
    }).toStrictEqual({
      groupName: "View",
      radioCount: 4,
      radioNames: ["Day", "Week", "Month", "Agenda"],
    });
  });

  it("marks the active radio checked and gives it the single tab stop", () => {
    renderToolbar({ activeView: "month" });

    const [day, week, month, agenda] = screen.getAllByRole("radio");

    expect(
      [day, week, month, agenda].map((radioElement) => [
        radioElement.getAttribute("aria-checked"),
        radioElement.getAttribute("tabindex"),
      ])
    ).toStrictEqual([
      ["false", "-1"],
      ["false", "-1"],
      ["true", "0"],
      ["false", "-1"],
    ]);
  });

  it("defaults to the day view when no active view is supplied", () => {
    renderToolbar();

    expect(radio("Day")).toHaveAttribute("aria-checked", "true");
  });
});

describe("CalendarToolbar navigation callbacks", () => {
  it("invokes Today, previous and next through their labelled buttons", async () => {
    const onToday = vi.fn<() => void>();
    const onPrevious = vi.fn<() => void>();
    const onNext = vi.fn<() => void>();

    renderToolbar({ activeView: "week", onNext, onPrevious, onToday });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(onToday).toHaveBeenCalledOnce();
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("labels the navigation group and controls for every active view", () => {
    const rendered = renderToolbar({ activeView: "day" });

    for (const item of VIEW_NAVIGATION) {
      rendered.rerender(
        <CalendarToolbar {...toolbarProps({ activeView: item.view })} />
      );

      expect(
        screen.getByRole("group", { name: item.group })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: item.previous })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: item.next })
      ).toBeInTheDocument();
    }
  });
});

describe("CalendarToolbar active view state", () => {
  it("selects a view on click, reports it through onViewChange and moves focus", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    renderToolbar({ defaultActiveView: "day", onViewChange });
    const user = userEvent.setup();

    await user.click(radio("Month"));

    expect(onViewChange).toHaveBeenCalledWith("month");
    expect(radio("Month")).toHaveAttribute("aria-checked", "true");
    expect(radio("Day")).toHaveAttribute("aria-checked", "false");
    expect(document.activeElement).toBe(radio("Month"));
  });

  it("seeds the uncontrolled view from defaultActiveView and ignores later defaults", () => {
    const { rerender } = renderToolbar({ defaultActiveView: "month" });

    expect(radio("Month")).toHaveAttribute("aria-checked", "true");

    rerender(
      <CalendarToolbar {...toolbarProps({ defaultActiveView: "day" })} />
    );

    expect(radio("Month")).toHaveAttribute("aria-checked", "true");
    expect(radio("Day")).toHaveAttribute("aria-checked", "false");
  });

  it("follows controlled activeView updates and moves focus to the selected radio", () => {
    const { rerender } = renderToolbar({ activeView: "week" });

    expect(radio("Week")).toHaveAttribute("aria-checked", "true");

    rerender(<CalendarToolbar {...toolbarProps({ activeView: "agenda" })} />);

    expect(radio("Agenda")).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(radio("Agenda"));
  });

  it("keeps the controlled value authoritative until the host updates the prop", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { rerender } = renderToolbar({ activeView: "week", onViewChange });
    const user = userEvent.setup();

    await user.click(radio("Agenda"));

    expect(onViewChange).toHaveBeenCalledWith("agenda");
    expect(radio("Week")).toHaveAttribute("aria-checked", "true");
    expect(radio("Agenda")).toHaveAttribute("aria-checked", "false");

    rerender(
      <CalendarToolbar
        {...toolbarProps({ activeView: "agenda", onViewChange })}
      />
    );

    expect(radio("Agenda")).toHaveAttribute("aria-checked", "true");
  });
});

describe("CalendarToolbar title and range", () => {
  it("renders the localized month and year title for non-agenda views", () => {
    renderToolbar({ activeView: "month" });

    const heading = screen.getByRole("heading");

    expect(heading).toHaveTextContent("August");
    expect(heading).toHaveTextContent("2026");
  });

  it("names the heading with the translated view name and selected date", () => {
    renderToolbar({ activeView: "day" });

    const heading = screen.getByRole("heading");

    expect(heading).toHaveAccessibleName(/Day view/u);
    expect(heading).toHaveAccessibleName(/Selected date 2026-08-24/u);
  });

  it("renders the agenda range through the same-year translation key", () => {
    const recordedT = vi.fn<CalendarTranslate>(t);

    renderToolbar({ activeView: "agenda", t: recordedT });

    expect(addCalendarDays(DATE, AGENDA_WINDOW_DAYS - 1)).toBe(
      calendarDate("2026-09-22")
    );
    expect(recordedT).toHaveBeenCalledWith(
      "calendar.agenda.range",
      expect.objectContaining({
        endDay: "22",
        endMonth: "Sep",
        startDay: "24",
        startMonth: "Aug",
      })
    );
    expect(recordedT).not.toHaveBeenCalledWith(
      "calendar.agenda.rangeCrossYear",
      expect.anything()
    );
    expect(screen.getByRole("heading")).toHaveTextContent("24 Aug – 22 Sep");
  });

  it("switches to the cross-year translation key when the window crosses a year boundary", () => {
    const recordedT = vi.fn<CalendarTranslate>(t);

    renderToolbar({
      activeView: "agenda",
      currentDate: calendarDate("2025-12-15"),
      t: recordedT,
    });

    expect(recordedT).toHaveBeenCalledWith(
      "calendar.agenda.rangeCrossYear",
      expect.objectContaining({ endYear: "2026", startYear: "2025" })
    );
    expect(screen.getByRole("heading")).toHaveTextContent(
      "15 Dec 2025 – 13 Jan 2026"
    );
  });

  it("keeps the title anchored to the host date across view changes", async () => {
    const { rerender } = renderToolbar({ defaultActiveView: "day" });

    expect(screen.getByRole("heading")).toHaveTextContent("August");
    const user = userEvent.setup();

    await user.click(radio("Agenda"));

    expect(screen.getByRole("heading")).toHaveTextContent("24 Aug – 22 Sep");

    rerender(
      <CalendarToolbar {...toolbarProps({ defaultActiveView: "day" })} />
    );

    expect(screen.getByRole("heading")).toHaveTextContent("24 Aug – 22 Sep");
  });
});

describe("CalendarToolbar keyboard model", () => {
  it("cycles views with arrow keys, wraps at both ends and moves focus in LTR", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    renderToolbar({ defaultActiveView: "day", onViewChange });
    const user = userEvent.setup();

    const observedViews: string[] = [];

    const observedFocus: string[] = [];

    const observe = (): void => {
      observedViews.push(activeRadioName());
      observedFocus.push(
        (["Day", "Week", "Month", "Agenda"] as const).find(
          (name) => document.activeElement === radio(name)
        ) ?? ""
      );
    };

    const day = radio("Day");
    day.focus();

    await user.keyboard("{ArrowRight}");
    observe();
    await user.keyboard("{ArrowDown}");
    observe();
    await user.keyboard("{ArrowUp}");
    observe();
    await user.keyboard("{ArrowLeft}");
    observe();
    await user.keyboard("{ArrowLeft}");
    observe();

    expect({
      callbacks: onViewChange.mock.calls.map(([view]) => view),
      observedFocus,
      observedViews,
    }).toStrictEqual({
      callbacks: ["week", "month", "week", "day", "agenda"],
      observedFocus: ["Week", "Month", "Week", "Day", "Agenda"],
      observedViews: ["Week", "Month", "Week", "Day", "Agenda"],
    });
  });

  it("selects the first and last radio on Home and End", async () => {
    renderToolbar({ defaultActiveView: "week" });
    const user = userEvent.setup();

    const week = radio("Week");
    week.focus();

    await user.keyboard("{Home}");

    expect(radio("Day")).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(radio("Day"));

    await user.keyboard("{End}");

    expect(radio("Agenda")).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(radio("Agenda"));
  });

  it("reverses horizontal arrow keys in RTL while keeping vertical movement", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    const { container } = renderToolbar({
      defaultActiveView: "day",
      direction: "rtl",
      onViewChange,
    });
    const user = userEvent.setup();

    const day = radio("Day");
    day.focus();
    const observedViews: string[] = [];

    const observe = (): void => {
      observedViews.push(activeRadioName());
    };

    await user.keyboard("{ArrowLeft}");
    observe();
    await user.keyboard("{ArrowRight}");
    observe();
    await user.keyboard("{ArrowRight}");
    observe();
    await user.keyboard("{ArrowDown}");
    observe();

    expect({
      callbacks: onViewChange.mock.calls.map(([view]) => view),
      direction: toolbarRoot(container).getAttribute("dir"),
      observedViews,
    }).toStrictEqual({
      callbacks: ["week", "day", "agenda", "day"],
      direction: "rtl",
      observedViews: ["Week", "Day", "Agenda", "Day"],
    });
  });
});

describe("CalendarToolbar available views", () => {
  it("restricts the option set and roving movement to availableViews", async () => {
    renderToolbar({
      availableViews: ["day", "agenda"],
      defaultActiveView: "day",
    });
    const user = userEvent.setup();

    const radios = screen.getAllByRole("radio");

    const observedViews: string[] = [];

    const observe = (): void => {
      observedViews.push(activeRadioName());
    };

    const day = radio("Day");
    day.focus();

    await user.keyboard("{ArrowRight}");
    observe();
    await user.keyboard("{ArrowRight}");
    observe();
    await user.keyboard("{End}");
    observe();
    await user.keyboard("{Home}");
    observe();

    expect({
      observedViews,
      radioNames: radios.map((radioElement) => radioElement.textContent),
      unavailable: [
        screen.queryByRole("radio", { name: "Week" }),
        screen.queryByRole("radio", { name: "Month" }),
      ],
    }).toStrictEqual({
      observedViews: ["Agenda", "Day", "Agenda", "Day"],
      radioNames: ["Day", "Agenda"],
      unavailable: [null, null],
    });
  });

  it("falls back to the first available view when the controlled view is unavailable", () => {
    renderToolbar({ activeView: "week", availableViews: ["day", "agenda"] });

    expect(radio("Day")).toHaveAttribute("aria-checked", "true");
    expect(radio("Agenda")).toHaveAttribute("aria-checked", "false");
  });
});

describe("CalendarToolbar host integration", () => {
  it("resolves the English defaults when the host misses translations", () => {
    const { container } = renderToolbar({ t: missingTranslation });

    const root = toolbarRoot(container);
    expect({
      ariaLabel: root.getAttribute("aria-label"),
      day: screen.getByRole("radio", { name: "Day" }).textContent,
      heading: screen.getByRole("heading").getAttribute("aria-label"),
      today: screen.getByRole("button", { name: "Today" }).textContent,
      viewLabel: screen
        .getByRole("radiogroup", { name: "View" })
        .getAttribute("aria-label"),
    }).toMatchObject({
      ariaLabel: "Calendar toolbar",
      day: "Day",
      heading: "Day view — Selected date 2026-08-24",
      today: "Today",
      viewLabel: "View",
    });
  });

  it("applies the host className and direction to the root", () => {
    const { container } = renderToolbar({
      className: "host-toolbar",
      direction: "ltr",
    });
    const root = toolbarRoot(container);

    expect(root).toHaveClass("host-toolbar");
    expect(root).toHaveAttribute("dir", "ltr");
  });

  it("replaces the title, view options and leading/trailing content through slots", () => {
    const renderTitle = vi.fn<(date: CalendarDate) => React.ReactNode>(
      (date: CalendarDate) => <span>{`custom-${date}`}</span>
    );

    const renderViewOption = vi.fn<
      (view: CalendarView, active: boolean) => React.ReactNode
    >((view: CalendarView, active: boolean) => (
      <span>{`${view}:${active ? "on" : "off"}`}</span>
    ));

    const renderLeading = vi.fn<() => React.ReactNode>(() => (
      <span>leading-slot</span>
    ));
    const renderTrailing = vi.fn<() => React.ReactNode>(() => (
      <span>trailing-slot</span>
    ));

    renderToolbar({
      activeView: "day",
      renderLeading,
      renderTitle,
      renderTrailing,
      renderViewOption,
    });

    const today = screen.getByRole("button", { name: "Today" });
    const stepper = screen.getByRole("button", { name: "Next day" });
    const trailing = screen.getByText("trailing-slot");

    expect({
      actionsContainTrailing: trailing.isConnected && today.isConnected,
      heading: screen.getByRole("heading").textContent,
      leadingCalls: renderLeading.mock.calls.length,
      leadingText: screen.getByText("leading-slot").textContent,
      renderedViewOptions: [
        screen.getByRole("radio", { name: "day:on" }).textContent,
        screen.getByRole("radio", { name: "week:off" }).textContent,
      ],
      stepperPrecedesTrailing:
        stepper.compareDocumentPosition(trailing) ===
        Node.DOCUMENT_POSITION_FOLLOWING,
      titleCall: renderTitle.mock.calls[0]?.[0],
      trailingCalls: renderTrailing.mock.calls.length,
      trailingText: screen.getByText("trailing-slot").textContent,
      viewOptionCalls: renderViewOption.mock.calls,
    }).toMatchObject({
      actionsContainTrailing: true,
      heading: "custom-2026-08-24",
      leadingCalls: 1,
      leadingText: "leading-slot",
      renderedViewOptions: ["day:on", "week:off"],
      stepperPrecedesTrailing: true,
      titleCall: DATE,
      trailingCalls: 1,
      trailingText: "trailing-slot",
      viewOptionCalls: [
        ["day", true],
        ["week", false],
        ["month", false],
        ["agenda", false],
      ],
    });
  });
});

describe("CalendarToolbar title runs and stepper labels", () => {
  it("splits the month and year into two runs so the year can carry the muted colour", () => {
    renderToolbar({ activeView: "month" });

    const heading = screen.getByRole("heading");

    expect(heading.textContent).toBe("August 2026");
    expect(
      heading.querySelector(`.${toolbarStyles.titleYear}`)
    ).toHaveTextContent("2026");
  });

  it("names the previous/next pair without rendering the phrase as visible text", () => {
    renderToolbar({ activeView: "week" });

    const previous = screen.getByRole("button", { name: "Previous week" });

    expect(previous).toHaveAttribute("aria-label", "Previous week");
    expect(previous.textContent).toBe("");
    expect(screen.queryByText("Previous week")).toBeNull();
  });
});
