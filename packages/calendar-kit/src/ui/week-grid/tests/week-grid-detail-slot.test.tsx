import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarEvent,
  CalendarDetailRenderContext,
} from "../../../core/model";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

interface Payload {
  readonly courseCode: string;
}

const event: CalendarEvent<Payload> = {
  allDay: false,
  colorFamily: "orange",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: calendarDate("2026-08-24"),
  endTime: parseLocalTime("10:00"),
  id: "detail-event",
  metadata: { courseCode: "MATH-201" },
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: calendarDate("2026-08-24"),
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Schedule detail",
};

const props: Omit<WeekGridProps<Payload>, "renderDetail"> = {
  date: calendarDate("2026-08-24"),
  direction: "ltr",
  events: [event],
  locale: "en-US",
  t: (key) => key,
  timeZone: UTC,
};

describe("WeekGrid detail-panel slot", () => {
  it("renders the consumer detail slot with the full event and a close handshake", async () => {
    const user = userEvent.setup();
    const renderDetail = vi.fn<
      (context: CalendarDetailRenderContext<Payload>) => ReactNode
    >((context: CalendarDetailRenderContext<Payload>) => (
      <aside aria-label="Consumer detail slot">
        <h2>{context.event.title}</h2>
        <p>{String(context.event.metadata?.courseCode)}</p>
        <button
          type="button"
          onClick={() => {
            context.close();
          }}
        >
          Close detail
        </button>
      </aside>
    ));

    render(
      <WeekGrid
        {...props}
        selectedEventId={event.id}
        renderDetail={renderDetail}
      />
    );

    assert(
      screen.getByRole("complementary", { name: "Consumer detail slot" })
        .textContent
    ).toContain("Schedule detailMATH-201");
    assert(renderDetail).toHaveBeenCalledOnce();

    const [detailContext] = renderDetail.mock.calls[0] ?? [];

    if (detailContext === undefined) {
      throw new Error("Missing detail context");
    }

    assert(detailContext.event).toBe(event);

    const closeHandler: CalendarDetailRenderContext<Payload>["close"] =
      detailContext.close;

    assert(closeHandler).toBeInstanceOf(Function);

    await user.click(screen.getByRole("button", { name: "Close detail" }));

    assert(
      screen.queryByRole("complementary", { name: "Consumer detail slot" })
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: new RegExp(event.title, "u") })
    );

    assert(
      screen.getByRole("complementary", { name: "Consumer detail slot" })
    ).toBeVisible();
  });

  it("does not require a custom detail slot when no event is selected", () => {
    const renderDetail = vi.fn<() => ReactNode>(() => <div>detail</div>);
    render(<WeekGrid {...props} renderDetail={renderDetail} />);

    assert(screen.queryByText("detail")).toBeNull();
    assert(renderDetail).not.toHaveBeenCalled();
  });
});
