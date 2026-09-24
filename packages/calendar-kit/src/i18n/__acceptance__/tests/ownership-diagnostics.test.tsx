import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { timedDraft, timedEvent } from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  CalendarList,
  CalendarLocalizationProvider,
  CalendarToolbar,
  CreateEventPopover,
  EventDetailPanel,
  MonthGrid,
  WorldClocks,
  parseIanaTimeZone,
  useCalendarLocalization,
  utcInstant,
} from "../../../index";
import type { CalendarTranslate } from "../../../index";

const DATE = calendarDate("2026-08-24");
const NOW = utcInstant("2026-08-24T08:00:00.000Z");
const BERLIN = parseIanaTimeZone("Europe/Berlin");
const LONDON = parseIanaTimeZone("Europe/London");
const SINGAPORE = parseIanaTimeZone("Asia/Singapore");
const NEW_YORK = parseIanaTimeZone("America/New_York");

const MissingProbe = ({ id }: { readonly id: string }) => {
  const { t } = useCalendarLocalization();

  return <output data-testid="missing">{t(id)}</output>;
};

const createEventProps = (
  overrides: Partial<ComponentProps<typeof CreateEventPopover>> = {}
): ComponentProps<typeof CreateEventPopover> => ({
  calendars: [{ colorFamily: "turquoise", id: "calendar-1", name: "Work" }],
  conferencingProviders: [],
  defaultDraft: timedDraft(),
  locations: [],
  onCancel: () => {},
  onSubmit: () => [][0],
  people: [{ id: "person-1", label: "Application resource" }],
  ...overrides,
});

interface MockCallList {
  readonly mock: { readonly calls: readonly unknown[][] };
}

const assertA17RenderedContent = (eventTimeZone: string): void => {
  for (const value of [
    "Application title",
    "Application organizer",
    "Application location",
    "Application description",
    "Application conflict label",
    "Application conflict message",
    "Application metadata",
    "Application render-slot content",
    "Application resource",
  ]) {
    expect(screen.getByText(value, { exact: false })).toBeInTheDocument();
  }

  expect(
    screen.getAllByText(eventTimeZone, { exact: false }).length
  ).toBeGreaterThan(0);
};

const assertA17TranslatedCalls = (
  eventTimeZone: string,
  serializedCalls: string
): void => {
  expect(serializedCalls).not.toContain("Application organizer");
  expect(serializedCalls).not.toContain("Application location");
  expect(serializedCalls).not.toContain("Application description");
  expect(serializedCalls).not.toContain("Application resource");
  expect(serializedCalls).not.toContain(eventTimeZone);
};

const assertA18DevelopmentDiagnostics = (
  onMissingTranslation: MockCallList
): void => {
  expect(onMissingTranslation.mock.calls).toStrictEqual([
    ["calendar.acceptance.missing"],
  ]);
  expect(screen.getAllByTestId("missing")).toHaveLength(2);

  for (const missing of screen.getAllByTestId("missing")) {
    expect(missing).not.toHaveTextContent("calendar.acceptance.missing");
  }

  expect(screen.queryByText(/missing translation/iu)).toBeNull();
};

const assertA18NoDiagnostics = (...spies: MockCallList[]): void => {
  for (const spy of spies) {
    expect(spy.mock.calls).toStrictEqual([]);
  }
};

const assertA19InitialControls = (calls: readonly string[]): void => {
  expect(
    screen.getByRole("button", { name: "A19:calendar.panel.createCalendar" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "A19:calendar.toolbar.previous.day" })
  ).toBeInTheDocument();
  expect(calls).toContain("calendar.month.weekPrefix");
};

const assertA19WorldClockControls = (): void => {
  expect(
    screen.getByRole("combobox", {
      name: "A19:calendar.panel.worldClocksAdd",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "A19:calendar.panel.worldClocksRemove Berlin",
    })
  ).toBeInTheDocument();
};

const assertA19PeopleControls = (): void => {
  expect(
    screen.getByRole("button", {
      name: "A19:calendar.combobox.clearSelectedPeople",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "A19:calendar.combobox.toggleOptions",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "A19:calendar.tag.remove Application resource",
    })
  ).toBeInTheDocument();
};

const assertA19RepeatControls = (): void => {
  expect(
    screen.getByRole("button", {
      name: "A19:calendar.create_event.weekday.monday",
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "A19:calendar.create_event.back" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("A19:calendar.create_event.repeat.ends")
  ).toBeInTheDocument();
};

const assertA19SubmitError = (): void => {
  expect(
    screen.getByText("A19:calendar.create_event.submitError")
  ).toBeInTheDocument();
};

describe("i18n acceptance: ownership and diagnostics", () => {
  it("A17: application content is untouched", () => {
    const calls: [
      string,
      Readonly<Record<string, string | number>> | undefined,
    ][] = [];

    const t: CalendarTranslate = (key, values) => {
      calls.push([key, values]);

      return `HOST:${key}`;
    };

    const event = timedEvent({
      conflicts: [
        {
          dimension: "classroom",
          id: "conflict-1",
          label: "Application conflict label",
          message: "Application conflict message",
        },
      ],
      description: "Application description",
      location: "Application location",
      metadata: { slot: "Application metadata" },
      organizer: "Application organizer",
      title: "Application title",
    });

    render(
      <>
        <EventDetailPanel
          defaultOpen
          event={event}
          onClose={() => {}}
          renderFooter={() => <span>Application render-slot content</span>}
          renderMetadata={() => (
            <span>{`${event.timeZone}:Application metadata`}</span>
          )}
          t={t}
        />
        <WorldClocks
          availableTimeZoneIds={[BERLIN]}
          defaultTimeZoneIds={[BERLIN]}
          now={NOW}
          onChange={() => {}}
          t={t}
        />
        <CreateEventPopover
          {...createEventProps({
            defaultDraft: {
              ...timedDraft(),
              attendeeIds: ["person-1"],
            },
          })}
          t={t}
        />
      </>
    );

    const serializedCalls = JSON.stringify(calls);
    assertA17RenderedContent(event.timeZone);
    assertA17TranslatedCalls(event.timeZone, serializedCalls);
    expect(serializedCalls).not.toContain("Application title");
  });

  it("A18: diagnostics are reported once and never rendered", () => {
    const onMissingTranslation = vi.fn<(key: string) => void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <CalendarLocalizationProvider onMissingTranslation={onMissingTranslation}>
        <MissingProbe id="calendar.acceptance.missing" />
        <MissingProbe id="calendar.acceptance.missing" />
      </CalendarLocalizationProvider>
    );
    assertA18DevelopmentDiagnostics(onMissingTranslation);

    rerender(
      <CalendarLocalizationProvider>
        <MissingProbe id="calendar.acceptance.missing-without-callback" />
      </CalendarLocalizationProvider>
    );
    assertA18NoDiagnostics(error);
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    rerender(
      <CalendarLocalizationProvider>
        <MissingProbe id="calendar.acceptance.production-missing" />
      </CalendarLocalizationProvider>
    );
    assertA18NoDiagnostics(error);
    expect(warn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("A19: direct hardcoded controls are covered", async () => {
    const calls: string[] = [];

    const t: CalendarTranslate = (key, values) => {
      calls.push(key);

      return `A19:${key}${values?.week === undefined ? "" : `:${values.week}`}`;
    };

    const expectedDirectKeys = [
      "calendar.combobox.clearSelectedPeople",
      "calendar.combobox.toggleOptions",
      // Covered by primitive-default-labels.test.tsx.
      "calendar.tag.remove",
      "calendar.dialog.close",
      "calendar.month.weekPrefix",
      "calendar.create_event.submitError",
      "calendar.create_event.repeat.ends",
      "calendar.create_event.repeat.never",
      "calendar.create_event.repeat.on_date",
      "calendar.create_event.weekday.monday",
      "calendar.timeZone.cityGroup.londonLisbonParis",
      "calendar.timeZone.cityGroup.berlinBratislavaBelgrade",
      "calendar.timeZone.cityGroup.singaporeKualaLumpurManila",
      "calendar.timeZone.cityGroup.newYorkTorontoHavana",
    ];

    const user = userEvent.setup({ delay: null });

    render(
      <>
        <CalendarToolbar
          currentDate={DATE}
          onNext={() => {}}
          onPrevious={() => {}}
          onToday={() => {}}
          onViewChange={() => {}}
          t={t}
        />
        <CalendarList
          calendars={[]}
          hiddenCalendarIds={[]}
          onCreateCalendar={() => {}}
          onHiddenCalendarIdsChange={() => {}}
          t={t}
        />
        <MonthGrid date={DATE} events={[]} t={t} />
        <WorldClocks
          availableTimeZoneIds={[BERLIN, LONDON, SINGAPORE, NEW_YORK]}
          defaultTimeZoneIds={[BERLIN]}
          now={NOW}
          onChange={() => {}}
          t={t}
        />
      </>
    );

    assertA19InitialControls(calls);

    await user.click(
      screen.getByRole("button", {
        name: "A19:calendar.panel.worldClocksEdit",
      })
    );
    assertA19WorldClockControls();
    const { unmount } = render(
      <CreateEventPopover
        {...createEventProps({
          defaultDraft: { ...timedDraft(), attendeeIds: ["person-1"] },
        })}
        defaultExpanded
        t={t}
      />
    );
    assertA19PeopleControls();
    const repeat = screen.getByRole("combobox", {
      name: "A19:calendar.create_event.field.repeat",
    });
    act(() => {
      fireEvent.click(repeat);
    });
    act(() => {
      const option = screen.getByRole("option", {
        name: "A19:calendar.create_event.repeat.custom",
      });
      fireEvent.pointerDown(option);
      fireEvent.click(option);
    });
    assertA19RepeatControls();
    unmount();

    const submit = vi.fn<() => Promise<never>>(
      async () => await Promise.reject.bind(Promise)("transport failure")
    );
    render(
      <CreateEventPopover {...createEventProps({ onSubmit: submit })} t={t} />
    );
    await user.click(
      screen.getByRole("button", { name: "A19:calendar.create_event.save" })
    );
    await waitFor(() => {
      assertA19SubmitError();
    });
    expect(calls).toStrictEqual(expect.arrayContaining(expectedDirectKeys));
  });
});
