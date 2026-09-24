import { describe, expect, it } from "vitest";

import {
  timedEvent as makeTimedEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  parseIanaTimeZone,
  utcInstant,
} from "../../../core/model";
import type {
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventSegment,
  UtcInstant,
} from "../../../core/model";
import { englishTranslate } from "../../../i18n/english";
import { buildEventPresentation } from "../event-presentation";

const NEW_YORK = parseIanaTimeZone("America/New_York");

interface Payload {
  readonly source: string;
}

type TimedEvent = Extract<CalendarEvent<Payload>, { allDay: false }>;

const presentationEvent = (
  overrides: Partial<Pick<TimedEvent, "available">> = {}
): TimedEvent =>
  makeTimedEvent<Payload>({
    available: false,
    colorFamily: "purple",
    conflicts: [
      { dimension: "classroom", id: "event-conflict", label: "Room A" },
    ],
    id: "timed-event",
    metadata: { source: "test" },
    title: "Timed event",
    ...overrides,
  });

const segmentFor = (
  event: CalendarEvent<Payload>,
  start: UtcInstant,
  end: UtcInstant
): CalendarEventSegment => ({
  date: event.startDate,
  end,
  event,
  segment: "start",
  start,
});

const geometry: CalendarEventGeometry = {
  height: 44,
  inlineSize: 50,
  insetInlineStart: 25,
  top: 20,
  zIndex: 7,
};

describe(buildEventPresentation, () => {
  it("captures fixed-now timed output, explicit conflict precedence, geometry, and built-in description", () => {
    const event = presentationEvent();
    const output = buildEventPresentation({
      conflicts: [],
      currentInstant: utcInstant("2026-08-24T10:00:00.000Z"),
      event,
      geometry,
      readOnly: true,
      segment: segmentFor(event, event.start, event.end),
      selected: true,
      timeZone: UTC,
      translate: englishTranslate,
    });

    expect({
      conflicts: output.conflicts,
      description: output.description,
      geometry: output.context.geometry,
      isAvailable: output.isAvailable,
      isPast: output.isPast,
      selected: output.context.isSelected,
    }).toMatchInlineSnapshot(`
      {
        "conflicts": [],
        "description": "Past, Read only",
        "geometry": {
          "height": 44,
          "inlineSize": 50,
          "insetInlineStart": 25,
          "top": 20,
          "zIndex": 7,
        },
        "isAvailable": false,
        "isPast": true,
        "selected": true,
      }
    `);
  });

  it("captures viewer-date all-day and DST boundary output for a localized time zone", () => {
    const event: CalendarEvent<Payload> = {
      allDay: true,
      colorFamily: "turquoise",
      endDate: calendarDate("2026-03-09"),
      endTime: null,
      id: "all-day-dst",
      metadata: { source: "dst" },
      startDate: calendarDate("2026-03-07"),
      startTime: null,
      timeZone: NEW_YORK,
      title: "DST all day",
    };

    const segment = segmentFor(
      event,
      utcInstant("2026-03-08T05:00:00.000Z"),
      utcInstant("2026-03-09T04:00:00.000Z")
    );

    expect(
      buildEventPresentation({
        currentInstant: utcInstant("2026-03-09T03:59:59.000Z"),
        event,
        readOnly: false,
        segment,
        selected: false,
        timeZone: NEW_YORK,
        translate: englishTranslate,
      })
    ).toMatchInlineSnapshot(`
      {
        "conflicts": [],
        "context": {
          "conflicts": [],
          "event": {
            "allDay": true,
            "colorFamily": "turquoise",
            "endDate": "2026-03-09",
            "endTime": null,
            "id": "all-day-dst",
            "metadata": {
              "source": "dst",
            },
            "startDate": "2026-03-07",
            "startTime": null,
            "timeZone": "America/New_York",
            "title": "DST all day",
          },
          "geometry": undefined,
          "isAvailable": true,
          "isPast": false,
          "isReadOnly": false,
          "isSelected": false,
          "segment": {
            "date": "2026-03-07",
            "end": "2026-03-09T04:00:00.000Z",
            "event": {
              "allDay": true,
              "colorFamily": "turquoise",
              "endDate": "2026-03-09",
              "endTime": null,
              "id": "all-day-dst",
              "metadata": {
                "source": "dst",
              },
              "startDate": "2026-03-07",
              "startTime": null,
              "timeZone": "America/New_York",
              "title": "DST all day",
            },
            "segment": "start",
            "start": "2026-03-08T05:00:00.000Z",
          },
        },
        "description": undefined,
        "isAvailable": true,
        "isPast": false,
      }
    `);

    const timed = presentationEvent();
    expect(() =>
      buildEventPresentation({
        currentInstant: utcInstant("not-an-instant"),
        event: timed,
        readOnly: false,
        segment: segmentFor(timed, timed.start, timed.end),
        selected: false,
        timeZone: NEW_YORK,
        translate: englishTranslate,
      })
    ).toThrow(RangeError);
  });

  it("returns the shared presentation contract directly", () => {
    const event = presentationEvent({ available: true });
    const output = buildEventPresentation({
      currentInstant: utcInstant("2026-08-24T10:00:00.000Z"),
      event,
      readOnly: true,
      segment: segmentFor(event, event.start, event.end),
      selected: true,
      timeZone: UTC,
      translate: englishTranslate,
    });

    expect({
      description: output.description,
      isAvailable: output.isAvailable,
      isPast: output.isPast,
      isReadOnly: output.context.isReadOnly,
      isSelected: output.context.isSelected,
    }).toStrictEqual({
      description: "Past, Read only",
      isAvailable: true,
      isPast: true,
      isReadOnly: true,
      isSelected: true,
    });
  });

  it("keeps an explicit past override independent from the current instant", () => {
    const event = presentationEvent({ available: true });
    const output = buildEventPresentation({
      event,
      pastOverride: false,
      readOnly: false,
      segment: segmentFor(event, event.start, event.end),
      selected: false,
      timeZone: UTC,
      translate: englishTranslate,
    });

    expect(output.isPast).toBeFalsy();
    expect(output.isAvailable).toBeTruthy();
  });
});
