import { describe, expect as assert, it } from "vitest";

import { parseIanaTimeZone } from "../../../core/model";
import type { IanaTimeZone } from "../../../core/model";
import { englishTranslate } from "../../../i18n/english";
import {
  commitAddPickerValue,
  readClickedOptionValue,
  readTimeZoneId,
  timeZoneLabel,
} from "../time-zone-labels";

describe(timeZoneLabel, () => {
  it("labels a grouped zone with its translated city group", () => {
    assert(
      timeZoneLabel(parseIanaTimeZone("Asia/Singapore"), englishTranslate)
    ).toBe("Singapore, Kuala Lumpur, Manila");
  });

  it("keeps the city label readable for zones without a city group", () => {
    assert(
      timeZoneLabel(
        parseIanaTimeZone("America/Argentina/Buenos_Aires"),
        englishTranslate
      )
    ).toBe("Buenos Aires");
  });
});

describe(readTimeZoneId, () => {
  it("parses available values and drops invalid values", () => {
    assert(readTimeZoneId("Europe/Berlin")).toBe("Europe/Berlin");
    assert(readTimeZoneId("Mars/Olympus_Mons")).toBeNull();
  });
});

describe(readClickedOptionValue, () => {
  it("reads the value of a clicked option and ignores other targets", () => {
    const option = new Option("Berlin", "Europe/Berlin");

    assert(readClickedOptionValue(option)).toBe("Europe/Berlin");
    assert(readClickedOptionValue(document.createElement("select"))).toBeNull();
    assert(readClickedOptionValue(null)).toBeNull();
  });

  it("ignores the empty placeholder option", () => {
    const placeholder = new Option("", "");

    assert(readClickedOptionValue(placeholder)).toBeNull();
  });
});

describe(commitAddPickerValue, () => {
  it("adds only values that parse and remain addable", () => {
    const added: string[] = [];

    const addClock = (timeZoneId: IanaTimeZone): void => {
      added.push(timeZoneId);
    };

    commitAddPickerValue(
      "Europe/Berlin",
      [parseIanaTimeZone("Europe/Berlin")],
      addClock
    );
    commitAddPickerValue(
      "Mars/Olympus_Mons",
      [parseIanaTimeZone("Europe/Berlin")],
      addClock
    );
    commitAddPickerValue(
      "Europe/London",
      [parseIanaTimeZone("Europe/Berlin")],
      addClock
    );

    assert(added).toStrictEqual(["Europe/Berlin"]);
  });
});
