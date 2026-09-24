import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect as assert, it } from "vitest";

import { allDayEvent, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, utcInstant } from "../../../core/model";
import { useAgendaViewController } from "../../../react/controllers/use-agenda-view-controller";
import { buildAgendaModel, isRowAvailable } from "../agenda-rows";

describe("agenda rows", () => {
  it("clips events into thirty ordered viewer-day rows", () => {
    const model = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        timedEvent(
          "later",
          "2026-08-24T10:00:00.000Z",
          "2026-08-24T11:00:00.000Z"
        ),
        allDayEvent("all-day", "2026-08-24", "2026-08-26"),
      ],
      now: utcInstant("2026-08-24T09:00:00.000Z"),
      timeZone: UTC,
    });

    assert(model.dayGroups).toHaveLength(30);
    assert(model.eventRows.map((row) => row.event.id)).toStrictEqual([
      "all-day",
      "later",
      "all-day",
    ]);
    assert(model.dayGroups[1]?.allDayEvents[0]?.segment).toBe("end");
  });

  it("rejects malformed intervals and unavailable rows", () => {
    assert(() =>
      buildAgendaModel({
        date: calendarDate("2026-08-24"),
        events: [
          timedEvent(
            "invalid",
            "2026-08-24T10:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
        ],
        now: utcInstant("2026-08-24T09:00:00.000Z"),
        timeZone: UTC,
      })
    ).toThrow("must end after it starts");

    const [row] = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        timedEvent(
          "unavailable",
          "2026-08-24T10:00:00.000Z",
          "2026-08-24T11:00:00.000Z",
          false
        ),
      ],
      now: utcInstant("2026-08-24T09:00:00.000Z"),
      timeZone: UTC,
    }).eventRows;

    assert(row).toBeDefined();
    assert(isRowAvailable(row)).toBeFalsy();

    const [busyRow] = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        {
          ...timedEvent(
            "busy",
            "2026-08-24T10:00:00.000Z",
            "2026-08-24T11:00:00.000Z"
          ),
          access: "busy",
        },
      ],
      now: utcInstant("2026-08-24T09:00:00.000Z"),
      timeZone: UTC,
    }).eventRows;

    assert(busyRow).toBeDefined();
    assert(isRowAvailable(busyRow)).toBeFalsy();

    assert(() =>
      buildAgendaModel({
        date: calendarDate("2026-08-24"),
        events: [allDayEvent("invalid-day", "2026-08-24", "2026-08-24")],
        now: utcInstant("2026-08-24T09:00:00.000Z"),
        timeZone: UTC,
      })
    ).toThrow("must end after it starts");
  });

  it("reports invalid layout data and handles an empty focus sequence", async () => {
    const invalidEvent = timedEvent(
      "invalid",
      "2026-08-24T10:00:00.000Z",
      "2026-08-24T10:00:00.000Z"
    );

    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [invalidEvent],
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.focusRow(0);
    });
    assert(result.current.focusedRowIndex).toBe(-1);

    let escapeDefaultPrevented = true;
    render(
      createElement(
        "button",
        {
          onKeyDown: (event) => {
            result.current.handleRowKeyDown(event, 0, "missing");
            escapeDefaultPrevented = event.defaultPrevented;
          },
          type: "button",
        },
        "Escape target"
      )
    );
    const button = screen.getByRole("button");
    button.focus();
    const user = userEvent.setup();
    await user.keyboard("{Escape}");

    assert(escapeDefaultPrevented).toBeFalsy();
  });
});
