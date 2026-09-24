import type { CalendarView } from "../../core/model";

interface ViewOption {
  readonly value: CalendarView;
  readonly labelKey: string;
  readonly viewNameKey: string;
  readonly changeKey: string;
  readonly previousKey: string;
  readonly nextKey: string;
}

export const VIEW_OPTIONS: readonly ViewOption[] = [
  {
    changeKey: "calendar.toolbar.change.day",
    labelKey: "calendar.toolbar.view.day",
    nextKey: "calendar.toolbar.next.day",
    previousKey: "calendar.toolbar.previous.day",
    value: "day",
    viewNameKey: "calendar.toolbar.viewName.day",
  },
  {
    changeKey: "calendar.toolbar.change.week",
    labelKey: "calendar.toolbar.view.week",
    nextKey: "calendar.toolbar.next.week",
    previousKey: "calendar.toolbar.previous.week",
    value: "week",
    viewNameKey: "calendar.toolbar.viewName.week",
  },
  {
    changeKey: "calendar.toolbar.change.month",
    labelKey: "calendar.toolbar.view.month",
    nextKey: "calendar.toolbar.next.month",
    previousKey: "calendar.toolbar.previous.month",
    value: "month",
    viewNameKey: "calendar.toolbar.viewName.month",
  },
  {
    changeKey: "calendar.toolbar.change.agenda",
    labelKey: "calendar.toolbar.view.agenda",
    nextKey: "calendar.toolbar.next.agenda",
    previousKey: "calendar.toolbar.previous.agenda",
    value: "agenda",
    viewNameKey: "calendar.toolbar.viewName.agenda",
  },
];

const VIEW_OPTIONS_BY_VALUE = new Map(
  VIEW_OPTIONS.map((option) => [option.value, option])
);

export const visibleViewOptions = (
  available: readonly CalendarView[]
): readonly ViewOption[] =>
  available.flatMap((value) => {
    const option = VIEW_OPTIONS_BY_VALUE.get(value);

    return option === undefined ? [] : [option];
  });
