import { describe, expect, expectTypeOf, it } from "vitest";

import { UTC } from "../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../core/model";
import type {
  CalendarCell,
  CalendarDirection,
  CalendarEvent,
  IanaTimeZone,
} from "../../core/model";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type {
  CalendarConflictRenderer,
  CalendarDetailRenderer,
  CalendarEventRenderer,
  CalendarGridCellKeyDownHandler,
  CalendarInteractionCallbacks,
  CalendarLocalizedProps,
  CalendarQuickCreatePayload,
  CalendarTemporalProps,
} from "../slots";

const date = calendarDate("2026-08-24");

const cell: CalendarCell = {
  date,
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endTime: parseLocalTime("10:00"),
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startTime: parseLocalTime("09:00"),
};

const event: CalendarEvent = {
  allDay: false,
  colorFamily: "turquoise",
  end: cell.end,
  endDate: date,
  endTime: cell.endTime,
  id: "event-1",
  start: cell.start,
  startDate: date,
  startTime: cell.startTime,
  timeZone: UTC,
  title: "Event",
};

const payload: CalendarQuickCreatePayload = {
  range: { cells: [cell], end: cell, start: cell },
};

const renderEvent: CalendarEventRenderer = (context) => context.event.title;

const renderConflict: CalendarConflictRenderer = (conflict) => conflict.label;

const renderDetail: CalendarDetailRenderer = (context) => context.event.title;

const gridKeyDown: CalendarGridCellKeyDownHandler = (keyboardEvent) => {
  keyboardEvent.preventDefault();
};

const interactions: CalendarInteractionCallbacks = {
  onEventSelect: () => {},
  onMoveRequest: () => {},
  onPaintSelect: () => {},
  onQuickCreate: () => {},
};

void event;

void payload;

void renderEvent;

void renderConflict;

void renderDetail;

void gridKeyDown;

void interactions;

describe("calendar React prop bases", () => {
  it("binds localization and temporal props to core model types", () => {
    expectTypeOf<CalendarLocalizedProps>().toEqualTypeOf<{
      readonly t: CalendarTranslate;
      readonly direction: CalendarDirection;
      readonly className?: string;
    }>();

    expectTypeOf<CalendarTemporalProps>().toEqualTypeOf<{
      readonly t: CalendarTranslate;
      readonly direction: CalendarDirection;
      readonly className?: string;
      readonly locale: string;
      readonly timeZone: IanaTimeZone;
    }>();
  });
});

describe("calendar React slot contracts", () => {
  it("keeps the quick-create anchor browser-only", () => {
    expect(payload.range).toStrictEqual({
      cells: [cell],
      end: cell,
      start: cell,
    });
    expectTypeOf(payload.anchorRect).toEqualTypeOf<
      DOMRectReadOnly | undefined
    >();
  });

  it("keeps renderer contexts typed and opaque", () => {
    expectTypeOf(renderEvent).parameter(0).toExtend<{
      readonly event: CalendarEvent;
    }>();
    expectTypeOf(renderDetail).parameter(0).toExtend<{
      readonly event: CalendarEvent;
    }>();
  });
});
