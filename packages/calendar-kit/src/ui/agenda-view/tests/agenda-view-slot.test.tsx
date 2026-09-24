import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import {
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarEvent } from "../../../core/model";
import { AgendaView } from "../agenda-view";
import type { AgendaViewProps } from "../agenda-view";

const renderAgenda = (events: readonly CalendarEvent[]) => {
  const props: AgendaViewProps = {
    date: calendarDate("2026-08-24"),
    direction: "ltr",
    events,
    locale: "en-US",
    t,
    timeZone: UTC,
  };

  return render(<AgendaView {...props} />);
};

describe("agenda event slot", () => {
  it("prints a timed row start over its end in the slot gutter, not inside the card body", () => {
    renderAgenda([
      timedEvent(
        "class",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T10:30:00.000Z"
      ),
    ]);

    const eventButton = screen.getByRole("button");
    assert(within(eventButton).getAllByText("09:00")).toHaveLength(1);
    assert(within(eventButton).getAllByText("10:30")).toHaveLength(1);
    assert(eventButton).not.toHaveTextContent("09:00–10:30");
  });

  it("renders an icon/value metadata row only when the event carries a value", () => {
    renderAgenda([
      timedEvent(
        "bare",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T10:30:00.000Z"
      ),
    ]);

    assert(screen.getByText("1 hr 30 min")).toBeVisible();
    assert(screen.queryByText("Aylin Demir")).toBeNull();
    assert(screen.queryByText("4")).toBeNull();

    const { container: withFacts } = renderAgenda([
      timedEvent(
        "full",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T10:30:00.000Z",
        {
          attendees: 4,
          organizer: "Aylin Demir",
        }
      ),
    ]);

    assert(within(withFacts).getByText("Aylin Demir")).toBeVisible();
    assert(within(withFacts).getByText("4")).toBeVisible();
  });

  it("renders the slot grid, the attendee faces and the join action", () => {
    renderAgenda([
      {
        ...timedEvent(
          "call",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:30:00.000Z",
          {
            attendees: 8,
          }
        ),
        joinUrl: "https://meet.example.com/call",
      },
    ]);

    assert(screen.getByRole("button")).toHaveTextContent("call");
    assert(within(screen.getByRole("button")).getByText("09:00")).toBeVisible();
    assert(within(screen.getByRole("button")).getByText("10:30")).toBeVisible();

    assert(screen.getByText("+2")).toBeVisible();

    const join = screen.getByRole("link", { name: "Join" });

    assert(join).toHaveAttribute("href", "https://meet.example.com/call");
    assert(join.closest("button")).toBeNull();
  });

  it("leaves out the join action when the event carries no safe link", () => {
    renderAgenda([
      {
        ...timedEvent(
          "unsafe",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:30:00.000Z"
        ),
        joinUrl: ["java", "script:alert(1)"].join(""),
      },
    ]);

    assert(screen.queryByRole("link")).toBeNull();
  });
});
