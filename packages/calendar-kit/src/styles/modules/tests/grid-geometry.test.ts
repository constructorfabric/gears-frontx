import { describe, expect as assert, it } from "vitest";

import { declarations } from "../../../__test-utils__/css-declarations";
import { EVENT_CHIP_HEIGHT } from "../../../core/grid";
import { HOUR_ROW_HEIGHT } from "../../../ui/week-grid/week-grid-layout";

import gridGeometryCss from "../grid-geometry.module.css?raw";

describe("grid geometry", () => {
  it("matches the constants the grids position events with", () => {
    const geometry = declarations(gridGeometryCss, ".gridGeometry");

    assert({
      chip: geometry.get("--grid-chip-height"),
      hour: geometry.get("--grid-hour-height"),
    }).toStrictEqual({
      chip: `${EVENT_CHIP_HEIGHT}px`,
      hour: `${HOUR_ROW_HEIGHT}px`,
    });
  });
});
