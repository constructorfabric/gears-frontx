import { describe, expect as assert, it } from "vitest";

import { VIEW_OPTIONS, visibleViewOptions } from "../view-options";

describe("view options", () => {
  it("lists day, week, month and agenda in navigation order", () => {
    assert(VIEW_OPTIONS.map((option) => option.value)).toStrictEqual([
      "day",
      "week",
      "month",
      "agenda",
    ]);
  });

  it("carries the toolbar translation key set for every option", () => {
    for (const option of VIEW_OPTIONS) {
      assert(option.labelKey).toBe(`calendar.toolbar.view.${option.value}`);
      assert(option.viewNameKey).toBe(
        `calendar.toolbar.viewName.${option.value}`
      );
      assert(option.changeKey).toBe(`calendar.toolbar.change.${option.value}`);
      assert(option.previousKey).toBe(
        `calendar.toolbar.previous.${option.value}`
      );
      assert(option.nextKey).toBe(`calendar.toolbar.next.${option.value}`);
    }
  });
});

describe(visibleViewOptions, () => {
  it("returns every option for the full view set", () => {
    assert(visibleViewOptions(["day", "week", "month", "agenda"])).toHaveLength(
      4
    );
  });

  it("keeps the host order of the available views", () => {
    const options = visibleViewOptions(["agenda", "day"]);

    assert(options.map((option) => option.value)).toStrictEqual([
      "agenda",
      "day",
    ]);
    assert(options[0].labelKey).toBe("calendar.toolbar.view.agenda");
    assert(options[1].labelKey).toBe("calendar.toolbar.view.day");
  });

  it("renders nothing for an empty available set", () => {
    assert(visibleViewOptions([])).toStrictEqual([]);
  });
});
