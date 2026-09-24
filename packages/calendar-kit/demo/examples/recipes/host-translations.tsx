import {
  CalendarLocalizationProvider,
  CalendarProvider,
  parseIanaTimeZone,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarDirection,
  CalendarTranslate,
} from "@gears-frontx/calendar-kit";
import type { ReactNode } from "react";

interface HostI18n {
  readonly language: string;
  readonly dir: CalendarDirection;
  readonly t: (
    key: string,
    values?: Readonly<Record<string, string | number>>
  ) => string | undefined;
}

export const CalendarI18nRoot = ({
  i18n,
  children,
}: {
  readonly i18n: HostI18n;
  readonly children: ReactNode;
}) => {
  const translate: CalendarTranslate = (id, values) =>
    i18n.t(`calendar:${id}`, values) ?? id;

  return (
    <CalendarProvider timeZone={parseIanaTimeZone("Europe/Istanbul")}>
      <CalendarLocalizationProvider
        direction={i18n.dir}
        locale={i18n.language}
        onMissingTranslation={(id) => {
          console.warn("calendar translation has no text", id);
        }}
        messages={{
          // A catalogue is keyed by locale, so a language swap needs no other change.
          [i18n.language]: { "calendar.toolbar.today": "Now" },
        }}
        t={translate}
      >
        {children}
      </CalendarLocalizationProvider>
    </CalendarProvider>
  );
};
