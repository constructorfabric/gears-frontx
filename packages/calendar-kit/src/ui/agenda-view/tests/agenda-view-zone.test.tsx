import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { identityTranslate as t } from "../../../__test-utils__/fixtures";
import { calendarDate, parseIanaTimeZone } from "../../../core/model";
import { AgendaView } from "../agenda-view";
import type { AgendaViewProps } from "../agenda-view";

const SOFIA = parseIanaTimeZone("Europe/Sofia");
const ANCHOR_DAY = calendarDate("2026-09-14");

const renderAgendaZoneGutter = (props: Partial<AgendaViewProps> = {}) => {
  const defaults: AgendaViewProps = {
    date: ANCHOR_DAY,
    direction: "ltr",
    events: [],
    locale: "en-US",
    t,
    timeZone: SOFIA,
  };

  return render(<AgendaView {...defaults} {...props} />);
};

describe("agenda day-header zone gutter", () => {
  it("renders the whole formatted zone offset in the gutter, not a truncated form", () => {
    renderAgendaZoneGutter();
    const [gutter] = screen.getAllByTitle("Europe/Sofia");

    assert(gutter?.textContent).toBe("GMT+3");
    assert(gutter?.getAttribute("title")).toBe("Europe/Sofia");
  });
});
