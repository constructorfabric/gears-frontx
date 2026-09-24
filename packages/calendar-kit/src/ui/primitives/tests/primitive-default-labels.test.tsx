import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { CalendarLocalizationProvider } from "../../../i18n/calendar-localization-provider";
import { Combobox } from "../combobox/combobox";
import { DateField } from "../date-field/date-field";
import { Dialog, DialogContent } from "../dialog/dialog";
import { List, ListItem } from "../list/list";
import { Subheader } from "../subheader/subheader";
import { Tag } from "../tag/tag";

const DEFAULT_IDS = [
  "calendar.list.add",
  "calendar.list.moreOptions",
  "calendar.subheader.back",
  "calendar.subheader.close",
  "calendar.dialog.close",
  "calendar.tag.remove",
  "calendar.combobox.clearSelectedPeople",
  "calendar.combobox.toggleOptions",
  "calendar.dateField.openCalendar",
] as const;

const translated = (id: string): string => `translated:${id}`;

describe("primitive default labels", () => {
  it("requests and renders every primitive default label", () => {
    const calls: string[] = [];

    const t: CalendarTranslate = (key) => {
      calls.push(key);

      return translated(key);
    };

    render(
      <CalendarLocalizationProvider t={t}>
        <List>
          <ListItem label="Calendar" onAction={() => {}} onMore={() => {}} />
        </List>
        <Subheader onBack={() => {}} onClose={() => {}} title="Calendar" />
        <Dialog open onOpenChange={() => {}}>
          <DialogContent />
        </Dialog>
        <Tag onDismiss={() => {}}>Person</Tag>
        <Combobox
          onClearTags={() => {}}
          onValueChange={() => {}}
          options={[{ label: "Person", value: "person" }]}
          selectedValues={["person"]}
          showChevron
          tags
          value=""
        />
        <DateField
          aria-label="Start date"
          locale="en-US"
          value=""
          onValueChange={() => {}}
        />
      </CalendarLocalizationProvider>
    );

    for (const id of DEFAULT_IDS) {
      expect(calls).toStrictEqual(expect.arrayContaining([id]));
    }

    const buttonNames = screen
      .getAllByRole("button")
      .map(
        (button) =>
          button.getAttribute("aria-label") ?? button.textContent?.trim()
      );

    expect(buttonNames).toStrictEqual(
      expect.arrayContaining([
        translated("calendar.list.add"),
        translated("calendar.list.moreOptions"),
        translated("calendar.subheader.back"),
        translated("calendar.subheader.close"),
        translated("calendar.dialog.close"),
        translated("calendar.tag.remove"),
        translated("calendar.combobox.clearSelectedPeople"),
        translated("calendar.combobox.toggleOptions"),
        translated("calendar.dateField.openCalendar"),
      ])
    );
  });
});
