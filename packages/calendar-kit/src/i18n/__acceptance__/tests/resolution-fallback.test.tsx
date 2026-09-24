import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { timedDraft } from "../../../__test-utils__/fixtures";
import {
  CalendarLocalizationProvider,
  CalendarProvider,
  CalendarToolbar,
  CreateEventPopover,
  calendarDate,
  parseIanaTimeZone,
  useCalendarContext,
  useCalendarLocalization,
} from "../../../index";
import type {
  CalendarMessages,
  CalendarTranslate,
  CalendarTranslations,
} from "../../../index";

const DATE = calendarDate("2026-08-24");
const NEW_YORK = parseIanaTimeZone("America/New_York");
const TOKYO = parseIanaTimeZone("Asia/Tokyo");

const identityTranslate: CalendarTranslate = (key) => key;

const undefinedTranslate: CalendarTranslate = new Proxy(identityTranslate, {
  apply: () => [][0],
});

const emptyTranslate: CalendarTranslate = () => "";

const translationForMode = (
  mode: "id" | "undefined" | "empty"
): CalendarTranslate => {
  if (mode === "id") {
    return identityTranslate;
  }
  if (mode === "undefined") {
    return undefinedTranslate;
  }
  return emptyTranslate;
};

const translationsForMode = (
  ids: readonly string[],
  mode: "id" | "undefined" | "empty"
): CalendarTranslations => {
  const translations: Record<string, string> = Object.fromEntries(
    ids.map((id) => [id, mode === "empty" ? "" : id])
  );

  if (mode === "undefined") {
    for (const id of ids) {
      Object.defineProperty(translations, id, {
        configurable: true,
        enumerable: true,
        value: undefined,
        writable: true,
      });
    }
  }

  return translations;
};

const splitTranslationEntry = (entry: string): [string, string | undefined] => {
  const [id, value] = entry.split("=", 2);

  if (id === undefined) {
    return ["", value];
  }
  return [id, value];
};

const hostTranslate: CalendarTranslate = (key) => `HOST:${key}`;

const parentTranslate: CalendarTranslate = (key) => `PARENT:${key}`;

const childTranslate: CalendarTranslate = (key) => `CHILD:${key}`;

const assertA1VisibleElements = (): void => {
  expect(screen.getByRole("button", { name: "Next day" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute(
    "placeholder",
    "Title"
  );
};

const assertA1TranslationOutput = (): void => {
  expect(screen.getByTestId("translations")).toHaveTextContent(
    "calendar.create_event.placeholder.location=Add a location"
  );
  expect(screen.getByTestId("translations")).toHaveTextContent(
    "calendar.month.eventCount=3 events"
  );
  expect(screen.getByTestId("translations")).not.toHaveTextContent(
    /undefined|null|^$/u
  );
  expect(screen.getByTestId("translations")).not.toHaveTextContent(
    /calendar\.common\./u
  );
};

const toolbarProps = {
  currentDate: DATE,
  onNext: () => {},
  onPrevious: () => {},
  onToday: () => {},
  onViewChange: () => {},
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

const TranslationProbe = ({
  ids,
  label = "translations",
}: {
  readonly ids: readonly string[];
  readonly label?: string;
}) => {
  const { t } = useCalendarLocalization();

  return (
    <output data-testid={label}>
      {ids.map((id) => `${id}=${t(id, { count: 3 })}`).join("|")}
    </output>
  );
};

const ContextProbe = ({ label }: { readonly label: string }) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  return (
    <output data-testid={label}>
      {`${locale}|${timeZone}|${direction}|${t("calendar.grid.label")}`}
    </output>
  );
};

describe("i18n acceptance: resolution and fallback", () => {
  it("A1: no-provider English default", () => {
    render(
      <>
        <CalendarToolbar {...toolbarProps} />
        <CreateEventPopover {...createEventProps} defaultExpanded />
        <TranslationProbe
          ids={[
            "calendar.toolbar.label",
            "calendar.toolbar.next.month",
            "calendar.create_event.placeholder.location",
            "calendar.month.eventCount",
          ]}
        />
      </>
    );

    expect(
      screen.getByRole("banner", { name: "Calendar toolbar" })
    ).toBeVisible();
    assertA1VisibleElements();
    assertA1TranslationOutput();
  });

  it("A2: host translation wins", () => {
    render(
      <CalendarLocalizationProvider
        messages={{ en: { "calendar.toolbar.label": "PROVIDER" } }}
        t={hostTranslate}
      >
        <TranslationProbe ids={["calendar.toolbar.label"]} />
        <CalendarToolbar {...toolbarProps} />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByTestId("translations")).toHaveTextContent(
      "calendar.toolbar.label=HOST:calendar.toolbar.label"
    );
    expect(screen.getByRole("banner")).toHaveAttribute(
      "aria-label",
      "HOST:calendar.toolbar.label"
    );
  });

  it("A4: instance override wins", () => {
    const { rerender } = render(
      <CalendarLocalizationProvider
        messages={{ en: { "calendar.toolbar.label": "PROVIDER" } }}
        t={hostTranslate}
      >
        <CalendarToolbar
          {...toolbarProps}
          translations={{ "calendar.toolbar.label": "INSTANCE" }}
        />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByRole("banner")).toHaveAttribute(
      "aria-label",
      "INSTANCE"
    );

    rerender(
      <CalendarLocalizationProvider
        messages={{ en: { "calendar.toolbar.label": "PROVIDER" } }}
        t={hostTranslate}
      >
        <CalendarToolbar {...toolbarProps} />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByRole("banner")).toHaveAttribute(
      "aria-label",
      "HOST:calendar.toolbar.label"
    );
  });

  it("A5: nested providers are isolated and composable", () => {
    render(
      <CalendarProvider timeZone={NEW_YORK}>
        <CalendarLocalizationProvider
          direction="rtl"
          locale="fr-FR"
          t={parentTranslate}
        >
          <ContextProbe label="parent" />
          <CalendarLocalizationProvider locale="de-DE" t={childTranslate}>
            <ContextProbe label="child" />
          </CalendarLocalizationProvider>
          <ContextProbe label="sibling" />
          <CalendarProvider timeZone={TOKYO}>
            <CalendarLocalizationProvider
              direction="ltr"
              locale="ja-JP"
              t={childTranslate}
            >
              <ContextProbe label="independent" />
            </CalendarLocalizationProvider>
          </CalendarProvider>
        </CalendarLocalizationProvider>
      </CalendarProvider>
    );

    expect(screen.getByTestId("parent")).toHaveTextContent(
      "fr-FR|America/New_York|rtl|PARENT:calendar.grid.label"
    );
    expect(screen.getByTestId("child")).toHaveTextContent(
      "de-DE|America/New_York|rtl|CHILD:calendar.grid.label"
    );
    expect(screen.getByTestId("sibling")).toHaveTextContent(
      "fr-FR|America/New_York|rtl|PARENT:calendar.grid.label"
    );
    expect(screen.getByTestId("independent")).toHaveTextContent(
      "ja-JP|Asia/Tokyo|ltr|CHILD:calendar.grid.label"
    );
  });

  it("A5b: direction follows the locale unless it is set", () => {
    render(
      <>
        <CalendarLocalizationProvider locale="ar-EG">
          <ContextProbe label="arabic" />
        </CalendarLocalizationProvider>
        <CalendarLocalizationProvider locale="de-DE">
          <ContextProbe label="german" />
        </CalendarLocalizationProvider>
        <CalendarLocalizationProvider direction="rtl" locale="de-DE">
          <ContextProbe label="forced" />
        </CalendarLocalizationProvider>
      </>
    );

    expect(screen.getByTestId("arabic")).toHaveTextContent(
      "ar-EG|UTC|rtl|Calendar grid"
    );
    expect(screen.getByTestId("german")).toHaveTextContent(
      "de-DE|UTC|ltr|Calendar grid"
    );
    expect(screen.getByTestId("forced")).toHaveTextContent(
      "de-DE|UTC|rtl|Calendar grid"
    );
  });

  it("A6: missing result never leaks", () => {
    const ownedIds = [
      "calendar.create_event.no_options",
      "calendar.create_event.repeat.ends",
      "calendar.create_event.repeat.never",
      "calendar.create_event.repeat.on_date",
      "calendar.create_event.weekday.monday",
      "calendar.create_event.weekday.tuesday",
      "calendar.create_event.weekday.wednesday",
      "calendar.create_event.weekday.thursday",
      "calendar.create_event.weekday.friday",
      "calendar.create_event.weekday.saturday",
      "calendar.create_event.weekday.sunday",
    ];

    const unknownId = "calendar.acceptance.unknown";

    const modes = ["id", "undefined", "empty"] as const;

    for (const mode of modes) {
      const hostT = translationForMode(mode);
      const translations = translationsForMode([...ownedIds, unknownId], mode);
      const messages: CalendarMessages = { en: translations };
      const onMissingTranslation = vi.fn<(key: string) => void>();
      const { unmount } = render(
        <CalendarLocalizationProvider
          messages={messages}
          onMissingTranslation={onMissingTranslation}
          t={hostT}
        >
          <TranslationProbe ids={[...ownedIds, unknownId]} />
        </CalendarLocalizationProvider>
      );

      const values = new Map<string, string | undefined>(
        (screen.getByTestId("translations").textContent ?? "")
          .split("|")
          .map(splitTranslationEntry)
      );

      for (const id of ownedIds) {
        const renderedValue = values.get(id) ?? "";
        expect(renderedValue).not.toBe("");
        expect(renderedValue).not.toBe(id);
        expect(renderedValue).not.toBe("undefined");
      }

      const unknownValue = values.get(unknownId) ?? "";
      expect(unknownValue).not.toBe("");
      expect(unknownValue).not.toBe(unknownId);
      expect(unknownValue).not.toBe("undefined");
      expect(onMissingTranslation).toHaveBeenCalledWith(unknownId);
      unmount();
    }
  });

  it("A8b: one catalogue per locale, swapped by the locale prop", () => {
    const messages = {
      de: { "calendar.toolbar.today": "Heute" },
      pt: { "calendar.toolbar.label": "Barra de ferramentas" },
      "pt-BR": { "calendar.toolbar.today": "Hoje" },
    };

    const { rerender } = render(
      <CalendarLocalizationProvider locale="pt-BR" messages={messages}>
        <TranslationProbe
          ids={["calendar.toolbar.today", "calendar.toolbar.label"]}
        />
      </CalendarLocalizationProvider>
    );

    // `pt-BR` serves the key it has; the key it does not walks to `pt`.
    expect(screen.getByTestId("translations")).toHaveTextContent(
      "calendar.toolbar.today=Hoje"
    );
    expect(screen.getByTestId("translations")).toHaveTextContent(
      "calendar.toolbar.label=Barra de ferramentas"
    );

    rerender(
      <CalendarLocalizationProvider locale="de" messages={messages}>
        <TranslationProbe
          ids={["calendar.toolbar.today", "calendar.toolbar.label"]}
        />
      </CalendarLocalizationProvider>
    );

    // Swapping the locale swaps the text, and a miss still lands on English.
    expect(screen.getByTestId("translations")).toHaveTextContent(
      "calendar.toolbar.today=Heute"
    );
    expect(screen.getByTestId("translations")).toHaveTextContent(
      "calendar.toolbar.label=Calendar toolbar"
    );
  });

  it("A8: catalogues fall back through the locale chain", () => {
    const pack = { "calendar.grid.label": "PACK GRID" };

    render(
      <>
        <CalendarLocalizationProvider
          locale="pt-BR"
          messages={{ en: pack, pt: pack }}
          t={identityTranslate}
        >
          <TranslationProbe
            ids={["calendar.grid.label", "calendar.toolbar.label"]}
            label="pack"
          />
        </CalendarLocalizationProvider>
        <CalendarLocalizationProvider
          locale="pt-BR"
          messages={{ "pt-BR": { "calendar.grid.label": "PROVIDER GRID" } }}
          t={identityTranslate}
        >
          <TranslationProbe ids={["calendar.grid.label"]} label="provider" />
        </CalendarLocalizationProvider>
        <CalendarLocalizationProvider
          locale="pt-BR"
          messages={{ "pt-BR": { "calendar.grid.label": "PROVIDER GRID" } }}
          t={() => "HOST GRID"}
        >
          <TranslationProbe ids={["calendar.grid.label"]} label="host" />
        </CalendarLocalizationProvider>
      </>
    );

    expect(screen.getByTestId("pack")).toHaveTextContent(
      "calendar.grid.label=PACK GRID"
    );
    expect(screen.getByTestId("pack")).toHaveTextContent(
      "calendar.toolbar.label=Calendar toolbar"
    );
    expect(screen.getByTestId("provider")).toHaveTextContent(
      "calendar.grid.label=PROVIDER GRID"
    );
    expect(screen.getByTestId("host")).toHaveTextContent(
      "calendar.grid.label=HOST GRID"
    );
  });
});
