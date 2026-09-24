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
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-09-14");

describe("WeekGrid event-card geometry seam", () => {
  it("does not imperatively mutate event-card inline styles", () => {
    render(
      <WeekGrid
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

  it("uses computed week height for density while the frame remains the sole positioner", async () => {
    const user = userEvent.setup();

    const contexts: CalendarEventRenderContext[] = [];

    render(
      <WeekGrid
        date={DATE}
        events={[
          timedEvent(
            "short",
            "Short week event",
            "2026-09-14T09:00:00.000Z",
            "2026-09-14T10:00:00.000Z"
          ),
          timedEvent(
            "tall",
            "Tall week event",
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

    const shortCard = screen.getByRole("button", {
      name: /^Short week event/u,
    });
    const tallCard = screen.getByRole("button", { name: /^Tall week event/u });

    assert(shortCard).toHaveAttribute("data-event-card-compact", "true");
    assert(shortCard).not.toHaveTextContent(/Room B12|Prof\. Curie|Lecture/iu);
    assert(tallCard).toHaveAttribute("data-event-card-compact", "false");
    assert(tallCard).toHaveTextContent("Room B12");
    assert(tallCard).toHaveTextContent("Prof. Curie");
    assert(tallCard).toHaveTextContent("Lecture");

    const shortFrame = document.querySelector<HTMLElement>(
      '[data-event-id="short"][draggable="true"]'
    );
    const tallFrame = document.querySelector<HTMLElement>(
      '[data-event-id="tall"][draggable="true"]'
    );

    assert(shortFrame).toHaveStyle({ blockSize: "43px" });
    assert(tallFrame).toHaveStyle({ blockSize: "129px" });
    assert(shortCard).not.toHaveAttribute("style");
    assert(tallCard).not.toHaveAttribute("style");

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
