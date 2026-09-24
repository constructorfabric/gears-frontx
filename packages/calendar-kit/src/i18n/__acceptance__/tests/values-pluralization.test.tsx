import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { timedEvent } from "../../../__test-utils__/fixtures";
import {
  AgendaView,
  CalendarLocalizationProvider,
  EventDetailPanel,
  MonthGrid,
  SearchResults,
  calendarDate,
  useCalendarLocalization,
  utcInstant,
} from "../../../index";
import type { CalendarTranslate } from "../../../index";

const DATE = calendarDate("2026-08-24");
const NOW = utcInstant("2026-08-24T08:00:00.000Z");
const FIRST_EVENT = timedEvent({ id: "first", title: "Planning" });
const SECOND_EVENT = timedEvent({
  end: utcInstant("2026-08-24T11:00:00.000Z"),
  id: "second",
  start: utcInstant("2026-08-24T10:00:00.000Z"),
  title: "Planning review",
});

const TranslationProbe = ({
  values,
}: {
  readonly values: Readonly<Record<string, string | number>>;
}) => {
  const { t } = useCalendarLocalization();

  const ids = [
    "calendar.agenda.range",
    "calendar.agenda.rangeCrossYear",
    "calendar.agenda.startsIn",
    "calendar.create_event.repeat.on",
    "calendar.detail.recurrence",
  ];

  return (
    <output data-testid="interpolated">
      {ids.map((id) => t(id, values)).join("|")}
    </output>
  );
};

interface NumericMatcher {
  readonly asymmetricMatch: (value: unknown) => boolean;
  readonly toString: () => string;
}
const numericMatcher: NumericMatcher = {
  asymmetricMatch: (value) => typeof value === "number",
  toString: () => "Any<Number>",
};
type TranslationCall = [
  string,
  Readonly<Record<string, string | number>> | undefined,
];

const assertA9Calls = (
  calls: readonly TranslationCall[],
  values: Readonly<Record<string, string | number>>
): void => {
  expect(calls).toStrictEqual(
    expect.arrayContaining([
      ["calendar.agenda.range", expect.objectContaining(values)],
      ["calendar.agenda.rangeCrossYear", expect.objectContaining(values)],
      [
        "calendar.agenda.startsIn",
        expect.objectContaining({ duration: "in 15 minutes" }),
      ],
      [
        "calendar.create_event.repeat.on",
        expect.objectContaining({ weekday: "Monday" }),
      ],
      [
        "calendar.detail.recurrence",
        expect.objectContaining({ rule: "every weekday" }),
      ],
    ])
  );
};

// The host receives the base id and the count, so it picks the form itself.
const assertA11Calls = (calls: readonly TranslationCall[]): void => {
  for (const status of ["awaiting", "invited", "maybe", "no", "yes"]) {
    expect(calls).toContainEqual([
      `calendar.detail.rsvp.${status}`,
      { count: 2 },
    ]);
  }

  for (const call of calls) {
    expect(call[0]).not.toMatch(/\.(?<category>zero|one|two|few|many|other)$/u);
  }
};

const hostMessage =
  (
    calls: [string, Readonly<Record<string, string | number>> | undefined][]
  ): CalendarTranslate =>
  (key, values) => {
    calls.push([key, values]);

    return `${key}:${Object.entries(values ?? {})
      .map(([name, value]) => `${name}=${value}`)
      .join(",")}`;
  };

const searchProps = (
  overrides: Partial<ComponentProps<typeof SearchResults>> = {}
): ComponentProps<typeof SearchResults> => ({
  events: [FIRST_EVENT, SECOND_EVENT],
  now: NOW,
  onDismiss: () => {},
  onReveal: () => {},
  ...overrides,
});

describe("i18n acceptance: values and pluralization", () => {
  it("A9: named values are substituted", () => {
    const calls: [
      string,
      Readonly<Record<string, string | number>> | undefined,
    ][] = [];

    const values = {
      count: 2,
      duration: "in 15 minutes",
      endDay: "22",
      endMonth: "Sep",
      endYear: "2026",
      rule: "every weekday",
      startDay: "24",
      startMonth: "Aug",
      startYear: "2026",
      weekday: "Monday",
    };

    render(
      <CalendarLocalizationProvider t={hostMessage(calls)}>
        <TranslationProbe values={values} />
      </CalendarLocalizationProvider>
    );

    const output = screen.getByTestId("interpolated");
    expect(output).toHaveTextContent("startDay=24");
    expect(output).toHaveTextContent("duration=in 15 minutes");
    expect(output).toHaveTextContent("weekday=Monday");
    expect(output).toHaveTextContent("rule=every weekday");
    expect(output.textContent).not.toMatch(
      /\{(?:count|duration|weekday|rule)/u
    );
    assertA9Calls(calls, values);
  });

  it("A10: plural counts are semantic numbers", async () => {
    const calls: [
      string,
      Readonly<Record<string, string | number>> | undefined,
    ][] = [];

    render(
      <SearchResults
        {...searchProps()}
        locale="ar-EG"
        query="Planning"
        t={hostMessage(calls)}
      />
    );

    await waitFor(() => {
      expect(calls).toContainEqual([
        "calendar.panel.searchCount",
        { count: 2 },
      ]);
    });
    expect(calls).not.toContainEqual([
      "calendar.panel.searchCount",
      { count: "2" },
    ]);
  });

  it("A11: all plural families use the same path", async () => {
    const calls: [
      string,
      Readonly<Record<string, string | number>> | undefined,
    ][] = [];

    const translate = hostMessage(calls);
    const rsvpEvent = timedEvent({
      attendees: [],
      id: "rsvp",
      rsvp: { awaiting: 2, invited: 2, maybe: 2, no: 2, yes: 2 },
      title: "RSVP event",
    });

    render(
      <>
        <AgendaView
          date={DATE}
          events={[FIRST_EVENT, SECOND_EVENT]}
          t={translate}
        />
        <MonthGrid
          date={DATE}
          events={[FIRST_EVENT, SECOND_EVENT]}
          monthData={{ densityCap: 0, overflowByDate: { [DATE]: 3 } }}
          t={translate}
        />
        <SearchResults {...searchProps()} t={translate} query="Planning" />
        <EventDetailPanel
          defaultOpen
          event={rsvpEvent}
          onClose={() => {}}
          t={translate}
        />
      </>
    );

    await waitFor(() => {
      expect(calls).toContainEqual([
        "calendar.agenda.eventCount",
        expect.objectContaining({ count: numericMatcher }),
      ]);
    });
    await waitFor(() => {
      expect(calls).toContainEqual([
        "calendar.month.eventCount",
        expect.objectContaining({ count: numericMatcher }),
      ]);
    });
    expect(calls).toContainEqual([
      "calendar.month.hidden",
      expect.objectContaining({ count: numericMatcher }),
    ]);
    await waitFor(() => {
      expect(calls).toContainEqual([
        "calendar.panel.searchCount",
        expect.objectContaining({ count: numericMatcher }),
      ]);
    });

    assertA11Calls(calls);
  });

  it("A12: host ICU bridges work", () => {
    const i18nextCalls: unknown[][] = [];

    const reactIntlCalls: unknown[][] = [];

    const defaultMessages: Record<string, string> = {
      "calendar.agenda.range": "{startDay} {startMonth} – {endDay} {endMonth}",
      "calendar.agenda.rangeCrossYear":
        "{startDay} {startMonth} {startYear} – {endDay} {endMonth} {endYear}",
      "calendar.agenda.startsIn": "Starts {duration}",
      "calendar.create_event.repeat.on": "on {weekday}",
      "calendar.detail.recurrence": "Repeats {rule}",
    };

    const i18next = (key: string, options: Record<string, unknown>) => {
      i18nextCalls.push([key, options]);

      return `i18next:${String(options.defaultValue)}`;
    };

    const formatMessage = (
      descriptor: { readonly id: string; readonly defaultMessage: string },
      values: Readonly<Record<string, string | number>> | undefined
    ) => {
      reactIntlCalls.push([descriptor, values]);

      return `formatjs:${descriptor.defaultMessage}`;
    };

    const i18nextAdapter: CalendarTranslate = (id, values) =>
      i18next(`screenset.calendar:${id}`, {
        ...values,
        defaultValue: defaultMessages[id],
      });

    const reactIntlAdapter: CalendarTranslate = (id, values) =>
      formatMessage(
        {
          defaultMessage: defaultMessages[id],
          id,
        },
        values
      );

    const { rerender } = render(
      <CalendarLocalizationProvider t={i18nextAdapter}>
        <TranslationProbe values={{ count: 2 }} />
      </CalendarLocalizationProvider>
    );
    rerender(
      <CalendarLocalizationProvider t={reactIntlAdapter}>
        <TranslationProbe values={{ count: 2 }} />
      </CalendarLocalizationProvider>
    );

    expect(i18nextCalls[0]?.[0]).toBe(
      "screenset.calendar:calendar.agenda.range"
    );
    expect(i18nextCalls[0]?.[1]).toStrictEqual(
      expect.objectContaining({
        count: 2,
        defaultValue: "{startDay} {startMonth} – {endDay} {endMonth}",
      })
    );
    expect(reactIntlCalls[0]?.[0]).toStrictEqual(
      expect.objectContaining({
        defaultMessage: "{startDay} {startMonth} – {endDay} {endMonth}",
        id: "calendar.agenda.range",
      })
    );
    expect(reactIntlCalls[0]?.[1]).toStrictEqual({ count: 2 });
    expect(screen.getByTestId("interpolated")).toHaveTextContent(
      "formatjs:{startDay} {startMonth} – {endDay} {endMonth}"
    );
  });
});
