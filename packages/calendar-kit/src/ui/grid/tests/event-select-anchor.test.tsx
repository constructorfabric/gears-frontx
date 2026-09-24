import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent } from "../../../__test-utils__/fixtures";
import { calendarDate, parseIanaTimeZone } from "../../../core/model";
import type {
  CalendarEvent,
  CalendarEventRenderContext,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../../day-grid/day-grid";
import { MonthGrid } from "../../month-grid/month-grid";
import { WeekGrid } from "../../week-grid/week-grid";

type SelectHandler = (
  event: CalendarEvent,
  context: CalendarEventRenderContext,
  anchor?: HTMLElement
) => void;

const CONTEXT = {
  date: calendarDate("2026-08-24"),
  direction: "ltr",
  events: [timedEvent({ id: "standup", title: "Standup" })],
  locale: "en-US",
  t,
  timeZone: parseIanaTimeZone("UTC"),
} as const;

const grids: readonly (readonly [
  string,
  (onEventSelect: SelectHandler) => ReactElement,
])[] = [
  [
    "WeekGrid",
    (onEventSelect) => <WeekGrid {...CONTEXT} onEventSelect={onEventSelect} />,
  ],
  [
    "DayGrid",
    (onEventSelect) => <DayGrid {...CONTEXT} onEventSelect={onEventSelect} />,
  ],
  [
    "MonthGrid",
    (onEventSelect) => <MonthGrid {...CONTEXT} onEventSelect={onEventSelect} />,
  ],
];

describe("event selection anchor", () => {
  it.each(grids)(
    "passes the activated card to %s's onEventSelect",
    async (_name, renderGrid) => {
      const user = userEvent.setup();
      const onEventSelect = vi.fn<SelectHandler>();
      render(renderGrid(onEventSelect));

      const card = screen.getByRole("button", { name: /Standup/u });
      await user.click(card);

      assert(onEventSelect).toHaveBeenCalledOnce();
      assert(onEventSelect.mock.calls[0]?.[2]).toBe(card);
    }
  );
});
