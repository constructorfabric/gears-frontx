import { render, screen } from "@testing-library/react";
import { Profiler, isValidElement, useCallback } from "react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import { CreateEventPopover } from "../create-event-popover";
import type { CreateEventPopoverProps } from "../create-event-popover";

const DATE = calendarDate("2026-08-24");

const INERT_RERENDERS = 6;

const t = ((key: string) => key) as CreateEventPopoverProps["t"];

const noSubmit = (): undefined => undefined;

const popoverProps = (
  overrides: Partial<CreateEventPopoverProps> = {}
): CreateEventPopoverProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [],
  defaultDraft: {
    allDay: false,
    calendarId: "calendar-1",
    endDate: DATE,
    endTime: parseLocalTime("10:00"),
    startDate: DATE,
    startTime: parseLocalTime("09:00"),
    timeZone: UTC,
    title: "Planning session",
  },
  defaultOpen: true,
  direction: "ltr",
  locale: "en-US",
  locations: [],
  onCancel: () => {},
  onSubmit: noSubmit,
  people: [],
  t,
  timeZone: UTC,
  ...overrides,
});

interface PortalCommitMeter {
  readonly commits: () => number;
  readonly contentRenders: () => number;
  readonly rerender: (tick: number) => void;
}

const renderPortalMeter = (
  overrides: Partial<CreateEventPopoverProps> = {}
): PortalCommitMeter => {
  let commits = 0;
  let contentRenders = 0;

  const Harness = ({ tick }: { readonly tick: number }): ReactElement => {
    const shell = useCallback((content: ReactNode): ReactElement => {
      contentRenders += 1;

      if (!isValidElement(content)) {
        throw new Error("Expected the compact shell content to be an element");
      }
      return content;
    }, []);

    return (
      <div data-tick={tick}>
        <Profiler
          id="create-event-popover"
          onRender={() => {
            commits += 1;
          }}
        >
          <CreateEventPopover
            {...popoverProps(overrides)}
            renderCompactShell={shell}
          />
        </Profiler>
      </div>
    );
  };

  const { rerender } = render(<Harness tick={0} />);

  return {
    commits: () => commits,
    contentRenders: () => contentRenders,
    rerender: (tick) => {
      rerender(<Harness tick={tick} />);
    },
  };
};

interface InertRerenderGrowth {
  readonly commits: number;
  readonly contentRenders: number;
}

const measureInertRerenders = (
  meter: PortalCommitMeter
): InertRerenderGrowth => {
  const before = {
    commits: meter.commits(),
    contentRenders: meter.contentRenders(),
  };

  for (let tick = 1; tick <= INERT_RERENDERS; tick += 1) {
    meter.rerender(tick);
  }

  return {
    commits: meter.commits() - before.commits,
    contentRenders: meter.contentRenders() - before.contentRenders,
  };
};

describe("CreateEventPopover portal anchor ref", () => {
  it("does not commit the open popover beyond the re-render it was asked for", () => {
    const growth = measureInertRerenders(renderPortalMeter());

    expect(growth.commits).toBe(INERT_RERENDERS);
    expect(growth.contentRenders).toBe(INERT_RERENDERS);
  });

  it("does not commit the closed popover beyond the re-render it was asked for", () => {
    const growth = measureInertRerenders(
      renderPortalMeter({ defaultOpen: false })
    );

    expect(growth.commits).toBe(INERT_RERENDERS);
    expect(growth.contentRenders).toBe(INERT_RERENDERS);
  });

  it("renders the create dialog into the anchor parent element and keeps it there", () => {
    const Host = ({ tick }: { readonly tick: number }): ReactElement => (
      <div role="group" aria-label="portal host">
        <CreateEventPopover {...popoverProps()} />
        <span data-tick={tick} />
      </div>
    );

    const { rerender } = render(<Host tick={0} />);

    const host = screen.getByRole("group", { name: "portal host" });
    const dialog = screen.getByRole("dialog", { name: /create/iu });

    expect(host).toContainElement(dialog);

    rerender(<Host tick={1} />);

    expect(screen.getByRole("dialog", { name: /create/iu })).toBe(dialog);
    expect(host).toContainElement(dialog);
  });
});
