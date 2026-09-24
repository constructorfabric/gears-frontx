import { describe, expect as assert, it } from "vitest";

import { parseIanaTimeZone, utcInstant } from "../model";
import {
  cityGroupLabel,
  readTimeZoneOption,
  zoneCityLabel,
} from "../time-zones";

describe(readTimeZoneOption, () => {
  it("returns one offset record for a valid option and drops an invalid option", () => {
    const instant = utcInstant("2026-07-01T12:00:00.000Z");

    const valid = { id: parseIanaTimeZone("Europe/Berlin"), label: "Berlin" };

    const invalid = { ...valid, label: "Mars" };
    Object.defineProperty(invalid, "id", { value: "Mars/Olympus_Mons" });

    assert(readTimeZoneOption(valid, instant, "en-US")).toHaveLength(1);
    assert(readTimeZoneOption(invalid, instant, "en-US")).toStrictEqual([]);
  });
});

describe("time-zone labels", () => {
  it("uses the product city group for known zones", () => {
    assert(cityGroupLabel(parseIanaTimeZone("Europe/Berlin"))).toBe(
      "Berlin, Bratislava, Belgrade"
    );
  });

  it("falls back to the final zone segment and expands underscores", () => {
    assert(
      zoneCityLabel(parseIanaTimeZone("America/Argentina/Buenos_Aires"))
    ).toBe("Buenos Aires");
    assert(cityGroupLabel(parseIanaTimeZone("Pacific/Apia"))).toBe("Apia");
  });
});
