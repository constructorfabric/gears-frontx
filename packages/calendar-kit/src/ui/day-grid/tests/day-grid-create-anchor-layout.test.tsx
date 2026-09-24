import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import type { CalendarQuickCreatePayload } from "../../../react/slots";
import { DayGrid } from "../day-grid";

const DATE = calendarDate("2026-08-24");

const renderDay = (
  onQuickCreate: (payload: CalendarQuickCreatePayload) => void
) =>
  render(
    <DayGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      interactionMode="quick-create"
      onQuickCreate={onQuickCreate}
    />
  );

const requiredPayload = (
  value: CalendarQuickCreatePayload | undefined
): CalendarQuickCreatePayload => {
  if (value === undefined) {
    throw new Error("Expected quick-create payload");
  }
  return value;
};

describe("DayGrid quick-create anchor layout", () => {
  it("anchors pointer-created events at the pointer coordinates, not the cell frame", () => {
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    renderDay(onQuickCreate);

    const cell = screen.getByRole("gridcell", {
      name: /09:00.*working hour/iu,
    });
    const cellRect = new DOMRect(40, 50, 96, 42);
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(cellRect);

    fireEvent.pointerDown(cell, { clientX: 123, clientY: 234 });
    fireEvent.pointerUp(cell, { clientX: 123, clientY: 234 });
    fireEvent.click(cell, { clientX: 123, clientY: 234 });

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.anchorRect).toMatchObject({
      height: 0,
      width: 0,
      x: 123,
      y: 234,
    });
  });

  it("anchors keyboard-created events to the focused cell frame", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    renderDay(onQuickCreate);

    const cell = screen.getByRole("gridcell", {
      name: /09:00.*working hour/iu,
    });
    const cellRect = new DOMRect(40, 50, 96, 42);
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(cellRect);

    cell.focus();
    await user.keyboard("{Enter}");

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.anchorRect).toMatchObject({
      height: 42,
      width: 96,
      x: 40,
      y: 50,
    });
    assert(payload.anchorRect?.width).toBeGreaterThan(0);
  });
});
