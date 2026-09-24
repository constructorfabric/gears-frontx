import { formatViewerTimeZoneOffset } from "./format";
import type { CalendarTimeZoneOption, IanaTimeZone, UtcInstant } from "./model";
import { parseIanaTimeZone } from "./validation";

const CITY_GROUP_BY_TIME_ZONE = new Map<string, string>([
  ["Europe/London", "London, Lisbon, Paris"],
  ["Europe/Berlin", "Berlin, Bratislava, Belgrade"],
  ["Asia/Singapore", "Singapore, Kuala Lumpur, Manila"],
  ["America/New_York", "New York, Toronto, Havana"],
]);

interface TimeZoneOptionWithOffset {
  readonly option: CalendarTimeZoneOption;
  readonly offset: string;
}

export const readTimeZoneOption = (
  option: CalendarTimeZoneOption,
  referenceInstant: UtcInstant,
  locale: string
): readonly TimeZoneOptionWithOffset[] => {
  try {
    const timeZone = parseIanaTimeZone(option.id);

    return [
      {
        offset: formatViewerTimeZoneOffset(referenceInstant, timeZone, locale),
        option,
      },
    ];
  } catch {
    return [];
  }
};

export const zoneCityLabel = (timeZone: IanaTimeZone | string): string => {
  const segment = timeZone.split("/").pop() ?? timeZone;

  return segment.replaceAll("_", " ");
};

export const cityGroupLabel = (timeZone: IanaTimeZone | string): string =>
  CITY_GROUP_BY_TIME_ZONE.get(timeZone) ?? zoneCityLabel(timeZone);
