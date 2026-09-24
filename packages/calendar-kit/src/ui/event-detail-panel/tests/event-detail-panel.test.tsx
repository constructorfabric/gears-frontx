import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allDayEvent, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { createShadowHost } from "../../../__test-utils__/setup";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type {
  CalendarAttendee,
  CalendarEvent,
  CalendarRsvp,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { EventDetailPanel } from "../event-detail-panel";
import type { EventDetailPanelProps } from "../event-detail-panel";

const BERLIN = parseIanaTimeZone("Europe/Berlin");

const DATE = calendarDate("2026-08-24");

const EVENT_TITLE = "Chemistry";

const SAFE_JOIN_URL = "https://meet.example.com/chemistry";

const SAFE_HTTP_JOIN_URL = "http://meet.example.com/chemistry";

const RAW_RECURRENCE_RULE = "FREQ=WEEKLY;BYDAY=MO,WE";

// Joined so the no-script-url lint ignores the fixture.
const SCRIPT_JOIN_URL = ["java", "script:alert(1)"].join("");

const RSVP: CalendarRsvp = {
  awaiting: 8,
  invited: 31,
  maybe: 3,
  no: 3,
  yes: 17,
};

const BASE_EVENT = {
  allDay: false,
  available: true,
  colorFamily: "purple",
  description: null,
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "event-1",
  location: null,
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: EVENT_TITLE,
} satisfies CalendarEvent;

interface ScheduleMetadata {
  readonly courseCode: string;
  readonly classroom: string;
}

const SCHEDULE_EVENT = {
  ...BASE_EVENT,
  metadata: {
    classroom: "Science Hall 204",
    courseCode: "CHEM-204",
  },
} satisfies CalendarEvent<ScheduleMetadata>;

const panelProps = (
  overrides: Partial<EventDetailPanelProps> = {}
): EventDetailPanelProps => ({
  direction: "ltr",
  event: timedEvent({ ...BASE_EVENT }),
  locale: "en-US",
  maxVisibleParticipants: 6,
  onClose: () => {},
  open: true,
  t,
  timeZone: UTC,
  ...overrides,
});

const renderPanel = (overrides: Partial<EventDetailPanelProps> = {}) =>
  render(<EventDetailPanel {...panelProps(overrides)} />);

let originalClipboard: PropertyDescriptor | undefined;

const installClipboard = (rejection: Error | null = null) => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  if (rejection) {
    writeText.mockRejectedValue(rejection);
  } else {
    writeText.mockResolvedValue();
  }

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return writeText;
};

const activateWithKeyboard = async (
  user: ReturnType<typeof userEvent.setup>,
  control: HTMLElement,
  key: "Enter" | " "
): Promise<void> => {
  control.focus();
  await user.keyboard(key === " " ? " " : `{${key}}`);
};

const makeAttendees = (count: number): readonly CalendarAttendee[] =>
  Array.from({ length: count }, (_, index) => ({
    displayName: `Person ${index}`,
    id: `person-${index}`,
  }));

describe(EventDetailPanel, () => {
  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }

    originalClipboard = undefined;
  });

  it("renders the controlled open state and reports the event title as the dialog name", () => {
    const { rerender } = renderPanel({ open: true });

    screen.getByRole("dialog", { name: EVENT_TITLE });

    rerender(<EventDetailPanel {...panelProps({ open: false })} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed by default and ignores a changed defaultOpen after mount", () => {
    const { rerender } = renderPanel({
      defaultOpen: undefined,
      open: undefined,
    });

    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <EventDetailPanel
        {...panelProps({ defaultOpen: true, open: undefined })}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens content from the initial uncontrolled defaultOpen value", () => {
    renderPanel({ defaultOpen: true, open: undefined });

    expect(
      screen.getByRole("dialog", { name: EVENT_TITLE })
    ).toBeInTheDocument();
  });

  it("renders the supplied event directly with no status or alert regions", () => {
    const { rerender } = renderPanel({});

    expect(
      screen.getByRole("dialog", { name: EVENT_TITLE })
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<EventDetailPanel {...panelProps({})} />);

    expect(
      screen.getByRole("dialog", { name: EVENT_TITLE })
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a named open shell when no event is supplied", () => {
    renderPanel({ event: null });

    screen.getByRole("dialog", { name: /event details|detail/iu });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hides restricted event details and actions for busy access", () => {
    const attendees: readonly CalendarAttendee[] = [
      { displayName: "Person 0", id: "p0" },
    ];

    renderPanel({
      event: timedEvent({
        ...BASE_EVENT,
        access: "busy",
        attendees,
        joinUrl: SAFE_JOIN_URL,
        rsvp: RSVP,
      }),
    });

    expect(screen.queryByRole("link", { name: /join/iu })).toBeNull();
    expect(screen.queryByText("Person 0")).toBeNull();
    expect(screen.queryByText(`${RSVP.invited} invited`)).toBeNull();
    expect(screen.queryByRole("button", { name: /edit/iu })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/iu })).toBeNull();
  });

  it("renders a link only for a safe HTTP(S) join URL", () => {
    const { rerender } = renderPanel({
      event: timedEvent({ ...BASE_EVENT, joinUrl: SAFE_JOIN_URL }),
    });

    expect(screen.getByRole("link", { name: /join/iu })).toHaveAttribute(
      "href",
      SAFE_JOIN_URL
    );

    rerender(
      <EventDetailPanel
        {...panelProps({
          event: timedEvent({ ...BASE_EVENT, joinUrl: SAFE_HTTP_JOIN_URL }),
        })}
      />
    );

    expect(screen.getByRole("link", { name: /join/iu })).toHaveAttribute(
      "href",
      SAFE_HTTP_JOIN_URL
    );

    rerender(
      <EventDetailPanel
        {...panelProps({
          event: timedEvent({ ...BASE_EVENT, joinUrl: SCRIPT_JOIN_URL }),
        })}
      />
    );

    expect(screen.queryByRole("link", { name: /join/iu })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/iu })).toBeNull();
    expect(screen.getByText(SCRIPT_JOIN_URL)).toBeInTheDocument();
  });

  it("renders RSVP counts from the supplied CalendarRsvp values", () => {
    renderPanel({
      anchorElement: document.body,
      event: timedEvent({ ...BASE_EVENT, rsvp: RSVP }),
    });

    expect(screen.getByText(`${RSVP.invited} invited`)).toBeTruthy();
    expect(screen.getByText(`${RSVP.yes} yes`)).toBeTruthy();
    expect(screen.getByText(`${RSVP.no} no`)).toBeTruthy();
    expect(screen.getByText(`${RSVP.awaiting} awaiting`)).toBeTruthy();
    expect(screen.getByText(`${RSVP.maybe} maybe`)).toBeTruthy();
  });

  it("renders nothing RSVP-related when RSVP is absent or null", () => {
    const { rerender } = renderPanel({
      event: timedEvent({ ...BASE_EVENT, attendees: [] }),
    });

    expect(
      screen.queryByText(/^\d+ (?:invited|yes|no|awaiting|maybe)$/u)
    ).toBeNull();

    rerender(
      <EventDetailPanel
        {...panelProps({
          event: timedEvent({ ...BASE_EVENT, attendees: [], rsvp: null }),
        })}
      />
    );

    expect(
      screen.queryByText(/^\d+ (?:invited|yes|no|awaiting|maybe)$/u)
    ).toBeNull();
  });

  it("passes the exact typed event to product body and action slots", () => {
    const renderBody = vi.fn<(event: CalendarEvent) => ReactNode>((event) => {
      expect(event).toBe(SCHEDULE_EVENT);

      return <p>Course code: {SCHEDULE_EVENT.metadata.courseCode}</p>;
    });

    const renderActions = vi.fn<(event: CalendarEvent) => ReactNode>(
      (event) => {
        expect(event).toBe(SCHEDULE_EVENT);

        return (
          <button type="button">
            Room: {SCHEDULE_EVENT.metadata.classroom}
          </button>
        );
      }
    );

    renderPanel({ event: SCHEDULE_EVENT, renderActions, renderBody });

    expect(renderBody).toHaveBeenCalledWith(SCHEDULE_EVENT);
    expect(renderActions).toHaveBeenCalledWith(SCHEDULE_EVENT);
    expect(screen.getByText("Course code: CHEM-204")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Room: Science Hall 204" })
    ).toBeTruthy();
  });

  it("shows only the capped participants before show-all", () => {
    renderPanel({
      anchorElement: document.body,
      event: timedEvent({ ...BASE_EVENT, attendees: makeAttendees(4) }),
      maxVisibleParticipants: 2,
    });

    expect(screen.getAllByText(/^Person \d+$/u)).toHaveLength(2);
    expect(screen.getByText("Person 0")).toBeTruthy();
    expect(screen.getByText("Person 1")).toBeTruthy();
    expect(screen.queryByText("Person 2")).toBeNull();
    expect(screen.queryByText("Person 3")).toBeNull();
  });

  it("reveals the remaining participants when show-all is clicked", async () => {
    const user = userEvent.setup();
    renderPanel({
      anchorElement: document.body,
      event: timedEvent({ ...BASE_EVENT, attendees: makeAttendees(4) }),
      maxVisibleParticipants: 2,
    });

    await user.click(
      screen.getByRole("button", { name: /show all|more|\+\d/iu })
    );

    expect(screen.getAllByText(/^Person \d+$/u)).toHaveLength(4);
    expect(screen.getByText("Person 2")).toBeTruthy();
    expect(screen.getByText("Person 3")).toBeTruthy();
  });

  it("lets the host replace the raw recurrence rule with a localized summary", () => {
    const localizedRecurrence = "Repeats every week on Monday and Wednesday";

    renderPanel({
      event: timedEvent({ ...BASE_EVENT, recurrenceRule: RAW_RECURRENCE_RULE }),
      t: (key, values) =>
        key === "calendar.detail.recurrence"
          ? localizedRecurrence
          : t(key, values),
    });

    const dialog = screen.getByRole("dialog", { name: EVENT_TITLE });

    expect(dialog).toHaveTextContent(localizedRecurrence);
    expect(dialog).not.toHaveTextContent(RAW_RECURRENCE_RULE);
  });

  it("renders the event clock converted into the comparison time zone", () => {
    renderPanel({
      comparisonTimeZone: BERLIN,
      event: timedEvent({ ...BASE_EVENT }),
    });

    const dialog = screen.getByRole("dialog", { name: EVENT_TITLE });

    expect(dialog).toHaveTextContent("GMT+0 UTC, 09:00 - 10:00");
    expect(dialog).toHaveTextContent("GMT+2 Berlin, 11:00 - 12:00");
  });

  it("activates close and copy through Enter and Space", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();
    const event = timedEvent({ ...BASE_EVENT, joinUrl: SAFE_JOIN_URL });
    const writeText = installClipboard();

    renderPanel({ event, onClose, onOpenChange });

    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /close/iu }),
      "Enter"
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /copy/iu }),
      "Enter"
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /close/iu }),
      " "
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /copy/iu }),
      " "
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(2);
    });
    expect(writeText).toHaveBeenNthCalledWith(1, SAFE_JOIN_URL);
    expect(writeText).toHaveBeenNthCalledWith(2, SAFE_JOIN_URL);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports edit and delete with the event and announces copy success", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();
    const event = timedEvent({ ...BASE_EVENT, joinUrl: SAFE_JOIN_URL });
    installClipboard();

    renderPanel({ event, onDelete, onEdit });

    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /copy/iu }),
      "Enter"
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /edit/iu }),
      "Enter"
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /delete/iu }),
      "Enter"
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /copy/iu }),
      " "
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /edit/iu }),
      " "
    );
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /delete/iu }),
      " "
    );

    expect(onEdit).toHaveBeenCalledWith(event);
    expect(onDelete).toHaveBeenCalledWith(event);

    await expect(
      screen.findByRole("status", { name: /copied/iu })
    ).resolves.toHaveTextContent("Copied");
  });

  it("announces a clipboard rejection through a status region", async () => {
    const user = userEvent.setup();
    const writeText = installClipboard(new Error("Permission denied"));

    renderPanel({
      event: timedEvent({ ...BASE_EVENT, joinUrl: SAFE_JOIN_URL }),
    });
    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /copy/iu }),
      "Enter"
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(SAFE_JOIN_URL);
    });
    await expect(
      screen.findByRole("status", { name: /copy failed/iu })
    ).resolves.toHaveTextContent("Copy failed");
  });

  it("omits edit and delete controls when callbacks are missing", () => {
    renderPanel({ onDelete: undefined, onEdit: undefined });

    expect(screen.queryByRole("button", { name: /edit/iu })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/iu })).toBeNull();
  });

  it("omits or marks terminal actions unavailable in read-only mode", () => {
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();

    renderPanel({ onDelete, onEdit, readOnly: true });

    expect(screen.queryByRole("button", { name: /edit/iu })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/iu })).toBeNull();

    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("reports close intent from Escape and the named close control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    renderPanel({ onClose, onOpenChange });

    const dialog = screen.getByRole("dialog", { name: EVENT_TITLE });
    dialog.focus();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await activateWithKeyboard(
      user,
      screen.getByRole("button", { name: /close/iu }),
      "Enter"
    );

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opens and dismisses inside an attached shadow root", async () => {
    const user = userEvent.setup();
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    root.append(container);
    render(<EventDetailPanel {...panelProps({ onClose, onOpenChange })} />, {
      container,
    });

    const dialog = within(container).getByRole("dialog", { name: EVENT_TITLE });
    dialog.focus();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    host.remove();
  });
});

describe("EventDetailPanel shell", () => {
  it("applies the host className and direction to the dialog root", () => {
    const instanceT = vi.fn<(key: string) => string>((key) => key);
    renderPanel({ className: "host-panel", direction: "rtl", t: instanceT });

    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveClass("host-panel");
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(
      instanceT.mock.calls.some(([key]) => key === "calendar.detail.close")
    ).toBeTruthy();
  });

  it("names the dialog with the translated fallback for an unnamed event", () => {
    renderPanel({ event: timedEvent({ ...BASE_EVENT, title: "   " }) });

    expect(screen.getByRole("dialog", { name: "Event details" })).toBeTruthy();
  });
});

const richEvent = (): CalendarEvent =>
  timedEvent({
    ...BASE_EVENT,
    conflicts: [
      {
        dimension: "classroom",
        id: "c1",
        label: "Room 204",
        message: "Double-booked with Biology",
        severity: "warning",
      },
    ],
    description: "Bring a lab coat.",
    location: "Science Hall 204",
    organizer: "Dr. Rivera",
    organizerEmail: "rivera@example.com",
  });

describe("EventDetailPanel default presentation", () => {
  it("caps participants at six by default and reveals the rest on show-all", async () => {
    const user = userEvent.setup();
    const attendees = makeAttendees(8);

    renderPanel({
      anchorElement: document.body,
      event: timedEvent({ ...BASE_EVENT, attendees }),
    });

    expect(screen.getAllByText(/^Person \d+$/u)).toHaveLength(6);
    expect(screen.queryByText("Person 7")).toBeNull();

    await user.click(screen.getByRole("button", { name: /\+2/u }));

    expect(screen.getAllByText(/^Person \d+$/u)).toHaveLength(8);
    expect(screen.getByText("Person 7")).toBeTruthy();
  });

  it("renders the populated location, organizer, and description sections", () => {
    renderPanel({ event: richEvent() });

    expect(screen.getByText("Science Hall 204")).toBeTruthy();
    expect(screen.getByText("Dr. Rivera")).toBeTruthy();
    expect(screen.getByText("Bring a lab coat.")).toBeTruthy();
  });

  it("renders the conflict dimension, label, and message", () => {
    renderPanel({ event: richEvent() });

    expect(screen.getByText("classroom")).toBeTruthy();
    expect(screen.getByText("Room 204")).toBeTruthy();
    expect(screen.getByText("Double-booked with Biology")).toBeTruthy();
  });

  it("omits empty optional sections", () => {
    renderPanel({
      event: timedEvent({
        ...BASE_EVENT,
        conflicts: [],
        description: "",
        location: null,
        organizer: null,
      }),
    });

    expect(screen.queryByText("calendar.detail.location")).toBeNull();
    expect(screen.queryByText("calendar.detail.organizer")).toBeNull();
    expect(screen.queryByText("calendar.detail.description")).toBeNull();
    expect(screen.queryByText("calendar.detail.conflicts")).toBeNull();
  });

  it("renders an all-day event as an inclusive date range without clocks", () => {
    renderPanel({
      event: allDayEvent({
        available: true,
        colorFamily: "orange",
        endDate: "2026-08-26",
        id: "event-all-day",
        startDate: DATE,
        title: "Holiday",
      }),
    });

    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("Aug 24, 2026 – Aug 25, 2026");
    expect(dialog).not.toHaveTextContent(/AM|PM/u);
  });

  it("hides the comparison line until a comparison zone is supplied", () => {
    const { rerender } = renderPanel({ event: timedEvent({ ...BASE_EVENT }) });

    expect(screen.queryByText(/Berlin/u)).toBeNull();

    rerender(
      <EventDetailPanel
        {...panelProps({
          comparisonTimeZone: parseIanaTimeZone("Europe/Berlin"),
          event: timedEvent({ ...BASE_EVENT }),
        })}
      />
    );

    expect(screen.getByText("GMT+2 Berlin, 11:00 - 12:00")).toBeTruthy();
  });
});

describe("EventDetailPanel keyboard and event absence", () => {
  it("ignores non-activating keys on the close control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();

    renderPanel({ onClose });

    const close = screen.getByRole("button", { name: /close/iu });
    close.focus();
    await user.keyboard("a");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the named empty shell when the event prop is omitted entirely", () => {
    const { event: _omitted, ...rest } = panelProps();

    render(<EventDetailPanel {...rest} />);

    expect(screen.getByRole("dialog", { name: "Event details" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("EventDetailPanel slots", () => {
  it("calls the header, metadata, and footer slots with the exact event and mounts their outputs", () => {
    const event = timedEvent({ ...BASE_EVENT });
    const renderHeader = vi.fn<(event: CalendarEvent | null) => ReactNode>(
      () => <div>header-slot</div>
    );
    const renderMetadata = vi.fn<(event: CalendarEvent) => ReactNode>(() => (
      <div>metadata-slot</div>
    ));
    const renderFooter = vi.fn<(event: CalendarEvent) => ReactNode>(() => (
      <div>footer-slot</div>
    ));

    renderPanel({ event, renderFooter, renderHeader, renderMetadata });

    expect(renderHeader).toHaveBeenCalledWith(event);
    expect(renderMetadata).toHaveBeenCalledWith(event);
    expect(renderFooter).toHaveBeenCalledWith(event);
    expect({
      footerMounted: screen.queryByText("footer-slot") !== null,
      headerMounted: screen.queryByText("header-slot") !== null,
      metadataMounted: screen.queryByText("metadata-slot") !== null,
    }).toStrictEqual({
      footerMounted: true,
      headerMounted: true,
      metadataMounted: true,
    });
  });

  it("passes a null event to the header slot when no event is supplied", () => {
    const renderHeader = vi.fn<() => ReactNode>(() => <div>header-slot</div>);

    renderPanel({ event: null, renderHeader });

    expect(renderHeader).toHaveBeenCalledWith(null);
    expect(screen.getByText("header-slot")).toBeTruthy();
  });

  it("replaces the default action row through the actions slot", () => {
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();
    const renderActions = vi.fn<() => ReactNode>(() => (
      <button type="button">custom-actions</button>
    ));

    renderPanel({ onDelete, onEdit, renderActions });

    expect(renderActions).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "custom-actions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit/iu })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/iu })).toBeNull();
  });
});

describe("EventDetailPanel shadow-root mounting", () => {
  it("keeps the dialog and backdrop inside the supplied shadow-root container", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");

    root.append(container);

    try {
      renderPanel({ container });

      expect(
        within(container).getByRole("dialog", { name: EVENT_TITLE })
      ).toBeTruthy();
      expect(container.querySelector('div[aria-hidden="true"]')).toBeTruthy();
    } finally {
      host.remove();
    }
  });

  it("restores focus to a shadow-root opener after dismissal", async () => {
    const user = userEvent.setup();
    const { host, root } = createShadowHost();
    const renderContainer = document.createElement("div");
    const opener = document.createElement("button");

    root.append(renderContainer);
    root.append(opener);
    opener.focus();

    try {
      const view = render(
        <EventDetailPanel
          {...panelProps({ container: renderContainer, open: false })}
        />,
        { container: renderContainer }
      );

      const closeFromHost = (): void => {
        view.rerender(
          <EventDetailPanel
            {...panelProps({ container: renderContainer, open: false })}
          />
        );
      };

      act(() => {
        view.rerender(
          <EventDetailPanel
            {...panelProps({
              container: renderContainer,
              onClose: closeFromHost,
              open: true,
            })}
          />
        );
      });

      const dialog = within(renderContainer).getByRole("dialog", {
        name: EVENT_TITLE,
      });
      dialog.focus();
      await user.keyboard("{Escape}");

      expect(root.activeElement).toBe(opener);
    } finally {
      host.remove();
    }
  });
});
