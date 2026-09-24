import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it } from "vitest";

import {
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarEventRenderContext } from "../../../core/model";
import { DayGrid } from "../day-grid";

const DATE = calendarDate("2026-09-14");

describe("DayGrid event-card geometry seam", () => {
  it("does not imperatively mutate event-card inline styles", () => {
    render(
      <DayGrid
        date={DATE}
        events={[
          timedEvent(
            "event",
            "Event",
            "2026-09-14T09:00:00.000Z",
            "2026-09-14T10:00:00.000Z"
          ),
        ]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );

    const card = screen.getByRole("button", { name: /^Event/u });
    assert(card.getAttribute("style") ?? "").not.toMatch(
      /(?:^|;)(?:top|right|bottom|left|width|height):/u
    );
  });

  it("uses computed day height for density while positioning the card once", async () => {
    const user = userEvent.setup();

    const contexts: CalendarEventRenderContext[] = [];

    render(
      <DayGrid
        date={DATE}
        events={[
          timedEvent(
            "short",
            "Short event",
            "2026-09-14T09:00:00.000Z",
            "2026-09-14T10:00:00.000Z"
          ),
          timedEvent(
            "tall",
            "Tall event",
            "2026-09-14T11:00:00.000Z",
            "2026-09-14T14:00:00.000Z"
          ),
        ]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
        onEventSelect={(_event, context) => {
          contexts.push(context);
        }}
      />
    );

    const shortCard = screen.getByRole("button", { name: /^Short event/u });
    const tallCard = screen.getByRole("button", { name: /^Tall event/u });

    assert(shortCard).toHaveAttribute("data-event-card-compact", "true");
    assert(shortCard).not.toHaveTextContent(/B-107|Dr\. Smith|Course/iu);
    assert(tallCard).toHaveAttribute("data-event-card-compact", "false");
    assert(tallCard).toHaveTextContent("B-107");
    assert(tallCard).toHaveTextContent("Dr. Smith");
    assert(tallCard).toHaveTextContent("Course");

    const shortFrame = shortCard.closest<HTMLElement>('[class*="timedEvent"]');

    assert(shortFrame).toHaveAttribute(
      "style",
      assert.stringContaining("inset-block-start")
    );
    assert(shortFrame).toHaveAttribute(
      "style",
      assert.stringContaining("block-size")
    );
    assert(shortCard).not.toHaveAttribute("style");
    assert(shortCard).not.toHaveAttribute(
      "style",
      assert.stringContaining("top:")
    );
    assert(shortCard).not.toHaveAttribute(
      "style",
      assert.stringContaining("height:")
    );

    await user.click(shortCard);
    await user.click(tallCard);

    assert(
      contexts.map((context) => [context.event.id, context.geometry?.height])
    ).toStrictEqual([
      ["short", 43],
      ["tall", 129],
    ]);
  });
});
