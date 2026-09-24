import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { timedDraft, timedEvent } from "../../../__test-utils__/fixtures";
import {
  CalendarGrid,
  CalendarLocalizationProvider,
  CalendarToolbar,
  CreateEventPopover,
  EventDetailPanel,
  SearchResults,
  WorldClocks,
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  useCalendarLocalization,
  utcInstant,
} from "../../../index";
import type { CalendarTranslate } from "../../../index";

const DATE = calendarDate("2026-08-24");
const NOW = utcInstant("2026-08-24T08:00:00.000Z");
const UTC = parseIanaTimeZone("UTC");
const BERLIN = parseIanaTimeZone("Europe/Berlin");

const EVENT = timedEvent({
  description: "Application description",
  id: "event-1",
  location: "Application location",
  organizer: "Application organizer",
  title: "Application title",
});

const translation =
  (prefix: string): CalendarTranslate =>
  (key) =>
    `${prefix}:${key}`;

const LocaleProbe = () => {
  const { locale, t } = useCalendarLocalization();
  const number = new Intl.NumberFormat(locale).format(1234);
  const plural = new Intl.PluralRules(locale).select(2);

  return (
    <output data-testid="locale">{`${locale}|${number}|${plural}|${t("calendar.grid.label")}`}</output>
  );
};

const DirectionProbe = () => {
  const { direction, t } = useCalendarLocalization();

  return (
    <output aria-label={t("calendar.grid.label")} dir={direction}>
      {t("calendar.toolbar.label")}
    </output>
  );
};

const gridCell = {
  date: DATE,
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endTime: parseLocalTime("10:00"),
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startTime: parseLocalTime("09:00"),
};

const gridProps: ComponentProps<typeof CalendarGrid> = {
  columns: [{ key: "day", label: "Day" }],
  getCellKey: () => "day-cell",
  getCellLabel: () => "Day cell",
  renderCell: () => <span>cell</span>,
  rows: [{ cells: [gridCell], key: "row" }],
};

const createEventProps: ComponentProps<typeof CreateEventPopover> = {
  calendars: [{ colorFamily: "turquoise", id: "calendar-1", name: "Work" }],
  conferencingProviders: [],
  defaultDraft: timedDraft(),
  locations: [],
  onCancel: () => {},
  onSubmit: () => [][0],
  people: [],
};

const assertA14StaticAccessibility = (): void => {
  expect(
    screen.getByRole("button", { name: "A14 previous month" })
  ).toBeVisible();
  expect(screen.getByRole("grid", { name: "A14 calendar grid" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "A14 close detail" })
  ).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: "A14 title field" })
  ).toBeVisible();
};

const assertA14WorldClockAccessibility = (): void => {
  expect(screen.getByRole("combobox", { name: "A14 add clock" })).toBeVisible();
};

describe("i18n acceptance: locale, accessibility, and SSR", () => {
  it("A13: explicit locale changes translation and formatting", () => {
    const { rerender } = render(
      <CalendarLocalizationProvider
        locale="en-US"
        messages={{ en: { "calendar.grid.label": "EN TRANSLATION" } }}
        t={(key) => key}
      >
        <LocaleProbe />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByTestId("locale")).toHaveTextContent(
      "en-US|1,234|other|EN TRANSLATION"
    );

    rerender(
      <CalendarLocalizationProvider
        locale="ar-EG"
        messages={{ "ar-EG": { "calendar.grid.label": "AR TRANSLATION" } }}
        t={(key) => key}
      >
        <LocaleProbe />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByTestId("locale")).toHaveTextContent(
      "ar-EG|١٬٢٣٤|two|AR TRANSLATION"
    );
  });

  it("A14: translated accessibility output", async () => {
    const labels: Record<string, string> = {
      "calendar.create_event.field.title": "A14 title field",
      "calendar.detail.close": "A14 close detail",
      "calendar.grid.label": "A14 calendar grid",
      "calendar.panel.worldClocksAdd": "A14 add clock",
      "calendar.toolbar.label": "A14 toolbar",
      "calendar.toolbar.next.month": "A14 next month",
      "calendar.toolbar.previous.month": "A14 previous month",
    };

    const t: CalendarTranslate = (key) => labels[key] ?? `A14:${key}`;

    render(
      <>
        <CalendarToolbar
          {...{
            currentDate: DATE,
            onNext: () => {},
            onPrevious: () => {},
            onToday: () => {},
            onViewChange: () => {},
          }}
          activeView="month"
          t={t}
        />
        <CalendarGrid {...gridProps} t={t} />
        <EventDetailPanel defaultOpen event={EVENT} onClose={() => {}} t={t} />
        <WorldClocks
          availableTimeZoneIds={[BERLIN]}
          defaultTimeZoneIds={[]}
          now={NOW}
          onChange={() => {}}
          t={t}
        />
        <CreateEventPopover {...createEventProps} t={t} />
      </>
    );

    expect(screen.getByRole("banner", { name: "A14 toolbar" })).toBeVisible();
    assertA14StaticAccessibility();

    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "A14:calendar.panel.worldClocksEdit" })
    );
    assertA14WorldClockAccessibility();
  });

  it("A15: direction is hydration-stable", async () => {
    const props = {
      direction: "rtl" as const,
      locale: "fr-FR" as const,
      t: translation("A15"),
    };

    const serverHtml = renderToString(
      <CalendarLocalizationProvider {...props}>
        <DirectionProbe />
      </CalendarLocalizationProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.documentElement.dir = "ltr";
    document.body.append(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(
        container,
        <CalendarLocalizationProvider {...props}>
          <DirectionProbe />
        </CalendarLocalizationProvider>
      );
      await Promise.resolve();
    });

    expect(container.querySelector("output")).toHaveAttribute("dir", "rtl");
    expect(container.querySelector("output")).toHaveAttribute(
      "aria-label",
      "A15:calendar.grid.label"
    );
    expect(container.textContent).toBe("A15:calendar.toolbar.label");
    root?.unmount();
    container.remove();
  });

  it("A16: deterministic temporal inputs", async () => {
    const props: ComponentProps<typeof SearchResults> = {
      defaultQuery: "Application",
      events: [EVENT],
      now: NOW,
      onDismiss: () => {},
      onReveal: () => {},
      t: translation("A16"),
      timeZone: UTC,
    };

    const serverHtml = renderToString(<SearchResults {...props} />);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.append(container);

    await act(async () => {
      hydrateRoot(container, <SearchResults {...props} />);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(container.innerHTML).toBe(serverHtml);
    });
    expect(container.textContent).toContain("A16:calendar.agenda.today");
    container.remove();
  });
});
