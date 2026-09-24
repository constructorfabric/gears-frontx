import type { IanaTimeZone } from "../../core/model";
import { zoneCityLabel } from "../../core/time-zones";
import { parseIanaTimeZone } from "../../core/validation";
import type { CalendarTranslate } from "../../i18n/calendar-localization";

const CITY_GROUP_MESSAGE_IDS = new Map<string, string>([
  ["Europe/London", "calendar.timeZone.cityGroup.londonLisbonParis"],
  ["Europe/Berlin", "calendar.timeZone.cityGroup.berlinBratislavaBelgrade"],
  ["Asia/Singapore", "calendar.timeZone.cityGroup.singaporeKualaLumpurManila"],
  ["America/New_York", "calendar.timeZone.cityGroup.newYorkTorontoHavana"],
]);

export const timeZoneLabel = (
  timeZoneId: IanaTimeZone,
  t: CalendarTranslate
): string => {
  const messageId = CITY_GROUP_MESSAGE_IDS.get(timeZoneId);

  return messageId === undefined ? zoneCityLabel(timeZoneId) : t(messageId);
};

export const readTimeZoneId = (value: string): IanaTimeZone | null => {
  try {
    return parseIanaTimeZone(value);
  } catch {
    return null;
  }
};

export const readClickedOptionValue = (
  target: EventTarget | null
): string | null =>
  target instanceof HTMLOptionElement && target.value !== ""
    ? target.value
    : null;

const addableTimeZoneSets = new WeakMap<
  readonly IanaTimeZone[],
  ReadonlySet<IanaTimeZone>
>();

export const commitAddPickerValue = (
  rawValue: string,
  addableTimeZoneIds: readonly IanaTimeZone[],
  addClock: (timeZoneId: IanaTimeZone) => void
): void => {
  const timeZoneId = readTimeZoneId(rawValue);
  let addableTimeZoneSet = addableTimeZoneSets.get(addableTimeZoneIds);

  if (addableTimeZoneSet === undefined) {
    addableTimeZoneSet = new Set(addableTimeZoneIds);
    addableTimeZoneSets.set(addableTimeZoneIds, addableTimeZoneSet);
  }

  if (timeZoneId === null || !addableTimeZoneSet.has(timeZoneId)) {
    return;
  }

  addClock(timeZoneId);
};
