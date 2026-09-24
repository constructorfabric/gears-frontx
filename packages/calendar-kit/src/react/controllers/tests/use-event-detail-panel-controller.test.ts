import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { createShadowHost } from "../../../__test-utils__/setup";
import type { CalendarAttendee, CalendarEvent } from "../../../core/model";
import type { EventDetailPanelProps } from "../../../ui/event-detail-panel/event-detail-panel";
import {
  COPY_STATUS_RESET_MS,
  isSafeHttpUrl,
  useEventDetailPanelController,
} from "../use-event-detail-panel-controller";

const SAFE_JOIN_URL = "https://meet.example.com/chemistry";

const UNSAFE_SCRIPT_SCHEME = ["java", "script:"].join("");

type TimedCalendarEvent = Extract<CalendarEvent, { readonly allDay: false }>;

const makeEvent = (
  overrides: Partial<TimedCalendarEvent> = {}
): TimedCalendarEvent =>
  timedEvent({
    available: true,
    colorFamily: "purple",
    title: "Chemistry",
    ...overrides,
  });

const baseProps = (
  overrides: Partial<EventDetailPanelProps> = {}
): EventDetailPanelProps => ({
  direction: "ltr",
  event: makeEvent(),
  locale: "en-US",
  maxVisibleParticipants: 6,
  onClose: () => {},
  open: true,
  t,
  timeZone: UTC,
  ...overrides,
});

const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard"
);

const setClipboard = (
  api: { readonly writeText: (text: string) => Promise<void> } | undefined
): void => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: api,
  });
};

const installClipboard = (rejection: Error | null = null) => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  if (rejection) {
    writeText.mockRejectedValue(rejection);
  } else {
    writeText.mockResolvedValue();
  }

  setClipboard({ writeText });

  return writeText;
};

const restoreClipboard = (): void => {
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
};

describe(useEventDetailPanelController, () => {
  afterEach(restoreClipboard);

  it("seeds uncontrolled open state and closes through the public callbacks", () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ defaultOpen: true, onClose, onOpenChange })
      )
    );

    expect(result.current.isOpen).toBeTruthy();

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBeFalsy();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("defaults to closed when neither open nor defaultOpen is supplied", () => {
    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ defaultOpen: undefined, open: undefined })
      )
    );

    expect(result.current.isOpen).toBeFalsy();
  });

  it("follows controlled open state and reports a close intent without changing the prop", () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (props: EventDetailPanelProps) => useEventDetailPanelController(props),
      { initialProps: baseProps({ onClose, onOpenChange, open: true }) }
    );

    expect(result.current.isOpen).toBeTruthy();

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBeTruthy();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(baseProps({ onClose, onOpenChange, open: false }));

    expect(result.current.isOpen).toBeFalsy();
  });

  it("treats an explicit defaultOpen as uncontrolled even when open is supplied", () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ defaultOpen: true, onClose, onOpenChange, open: true })
      )
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBeFalsy();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps reporting close intent from an already-closed uncontrolled panel", () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({
          defaultOpen: false,
          onClose,
          onOpenChange,
          open: undefined,
        })
      )
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBeFalsy();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("restores focus to the stored origin element on close", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.append(opener);
    opener.focus();

    const { result, rerender } = renderHook(
      (props: EventDetailPanelProps) => useEventDetailPanelController(props),
      { initialProps: baseProps({ open: false }) }
    );

    act(() => {
      rerender(baseProps({ open: true }));
    });

    act(() => {
      result.current.close();
    });

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("copies an HTTP(S) join link and reports copied status", async () => {
    const writeText = installClipboard();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ joinUrl: SAFE_JOIN_URL }) })
      )
    );

    expect(result.current.canCopyJoinLink).toBeTruthy();

    await act(async () => {
      result.current.copyLink();

      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(SAFE_JOIN_URL);
    expect(result.current.copyStatus).toBe("copied");
  });

  it("fails closed for unsafe URLs without touching the clipboard", () => {
    const writeText = installClipboard();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({
          event: makeEvent({
            joinUrl: `${UNSAFE_SCRIPT_SCHEME}alert(document.cookie)`,
          }),
        })
      )
    );

    expect(result.current.canCopyJoinLink).toBeFalsy();

    act(() => {
      result.current.copyLink();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.copyStatus).toBe("idle");
  });

  it("reports clipboard rejection as an error status", async () => {
    const writeText = installClipboard(new Error("Permission denied"));

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ joinUrl: SAFE_JOIN_URL }) })
      )
    );

    act(() => {
      result.current.copyLink();
    });

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(SAFE_JOIN_URL);
    });
    await waitFor(() => {
      expect(result.current.copyStatus).toBe("error");
    });
  });

  it("reports clipboard failure when the browser Clipboard API is absent", () => {
    setClipboard(undefined);

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ joinUrl: SAFE_JOIN_URL }) })
      )
    );

    act(() => {
      result.current.copyLink();
    });

    expect(result.current.copyStatus).toBe("error");
  });

  it("resets copied status using the exported timeout constant", async () => {
    vi.useFakeTimers();

    try {
      installClipboard();

      const { result } = renderHook(() =>
        useEventDetailPanelController(
          baseProps({ event: makeEvent({ joinUrl: SAFE_JOIN_URL }) })
        )
      );

      await act(async () => {
        result.current.copyLink();

        await Promise.resolve();
      });

      expect(result.current.copyStatus).toBe("copied");

      act(() => {
        vi.advanceTimersByTime(COPY_STATUS_RESET_MS);
      });

      expect(result.current.copyStatus).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the explicit participant cap and reports the remaining count", () => {
    const attendees: readonly CalendarAttendee[] = Array.from(
      { length: 5 },
      (_, index) => ({
        displayName: `Person ${index}`,
        id: `person-${index}`,
      })
    );

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({
          event: makeEvent({ attendees }),
          maxVisibleParticipants: 2,
        })
      )
    );

    expect(result.current.visibleParticipants).toStrictEqual(
      attendees.slice(0, 2)
    );

    expect(result.current.participantOverflowCount).toBe(3);
  });

  it("returns every participant below the cap and none for an empty list", () => {
    const attendees: readonly CalendarAttendee[] = [
      { displayName: "A", id: "a" },
      { displayName: "B", id: "b" },
    ];

    const { result, rerender } = renderHook(
      (props: EventDetailPanelProps) => useEventDetailPanelController(props),
      {
        initialProps: baseProps({
          event: makeEvent({ attendees }),
          maxVisibleParticipants: 3,
        }),
      }
    );

    expect(result.current.visibleParticipants).toStrictEqual(attendees);
    expect(result.current.participantOverflowCount).toBe(0);

    rerender(
      baseProps({
        event: makeEvent({ attendees: [] }),
        maxVisibleParticipants: 3,
      })
    );

    expect(result.current.visibleParticipants).toStrictEqual([]);
    expect(result.current.participantOverflowCount).toBe(0);
  });

  it("marks busy events as restricted", () => {
    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ access: "busy" }) })
      )
    );

    expect(result.current.isRestricted).toBeTruthy();
    expect(result.current.canEdit).toBeFalsy();
    expect(result.current.canDelete).toBeFalsy();
  });

  it("suppresses terminal actions for busy events", () => {
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();
    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ access: "busy" }), onDelete, onEdit })
      )
    );

    act(() => {
      result.current.handleEdit();
      result.current.handleDelete();
    });

    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("restricts terminal actions for read-only events", () => {
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();
    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent(), onDelete, onEdit, readOnly: true })
      )
    );

    expect(result.current.isRestricted).toBeFalsy();
    expect(result.current.canEdit).toBeFalsy();
    expect(result.current.canDelete).toBeFalsy();
  });

  it("passes the exact event to edit and delete callbacks", () => {
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();
    const event = makeEvent();

    const { result } = renderHook(() =>
      useEventDetailPanelController(baseProps({ event, onDelete, onEdit }))
    );

    act(() => {
      result.current.handleEdit();
      result.current.handleDelete();
    });

    expect(onEdit).toHaveBeenCalledWith(event);
    expect(onDelete).toHaveBeenCalledWith(event);
  });
});

describe(isSafeHttpUrl, () => {
  it("accepts only http and https schemes, case-insensitively", () => {
    expect(isSafeHttpUrl("https://meet.example.com")).toBeTruthy();
    expect(isSafeHttpUrl("http://meet.example.com")).toBeTruthy();
    expect(isSafeHttpUrl("HTTPS://MEET.EXAMPLE.COM")).toBeTruthy();
  });

  it("rejects script and data schemes", () => {
    const scriptUrl = `${UNSAFE_SCRIPT_SCHEME}alert(1)`;
    expect(isSafeHttpUrl(scriptUrl)).toBeFalsy();
    expect(isSafeHttpUrl("data:text/html,x")).toBeFalsy();
    expect(isSafeHttpUrl("")).toBeFalsy();
  });

  it("rejects ftp and missing values", () => {
    const missingUrl: string | null | undefined = undefined;
    expect(isSafeHttpUrl("ftp://meet.example.com")).toBeFalsy();
    expect(isSafeHttpUrl(null)).toBeFalsy();
    expect(isSafeHttpUrl(missingUrl)).toBeFalsy();
  });
});

describe("useEventDetailPanelController copy", () => {
  afterEach(restoreClipboard);

  it("leaves the status idle when the event has no join link", () => {
    const writeText = installClipboard();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ joinUrl: null }) })
      )
    );

    expect(result.current.canCopyJoinLink).toBeFalsy();

    act(() => {
      result.current.copyLink();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.copyStatus).toBe("idle");
  });

  it("returns the copied status through the public result", async () => {
    installClipboard();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ joinUrl: SAFE_JOIN_URL }) })
      )
    );

    expect(result.current.copyStatus).toBe("idle");

    await act(async () => {
      result.current.copyLink();

      await Promise.resolve();
    });

    expect(result.current.copyStatus).toBe("copied");
  });

  it("resets the copy status when the selected event changes", async () => {
    installClipboard();

    const { result, rerender } = renderHook(
      (props: EventDetailPanelProps) => useEventDetailPanelController(props),
      {
        initialProps: baseProps({
          event: makeEvent({ joinUrl: SAFE_JOIN_URL }),
        }),
      }
    );

    await act(async () => {
      result.current.copyLink();

      await Promise.resolve();
    });

    expect(result.current.copyStatus).toBe("copied");

    act(() => {
      rerender(
        baseProps({
          event: makeEvent({ id: "event-2", joinUrl: SAFE_JOIN_URL }),
        })
      );
    });

    expect(result.current.copyStatus).toBe("idle");
  });
});

describe("useEventDetailPanelController participants and actions", () => {
  it("caps participants at six by default", () => {
    const attendees = Array.from({ length: 8 }, (_, index) => ({
      displayName: `Person ${index}`,
      id: `person-${index}`,
    }));

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ attendees }) })
      )
    );

    expect(result.current.visibleParticipants).toHaveLength(6);
    expect(result.current.participantOverflowCount).toBe(2);
  });

  it("treats a missing attendee list as empty", () => {
    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ attendees: undefined }) })
      )
    );

    expect(result.current.visibleParticipants).toStrictEqual([]);
    expect(result.current.participantOverflowCount).toBe(0);
  });

  it("no-ops terminal actions when their callbacks are missing", () => {
    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ onDelete: undefined, onEdit: undefined })
      )
    );

    expect(result.current.canEdit).toBeFalsy();
    expect(result.current.canDelete).toBeFalsy();

    expect(() => {
      act(() => {
        result.current.handleEdit();
        result.current.handleDelete();
      });
    }).not.toThrow();
  });

  it("suppresses terminal actions for busy events even with callbacks", () => {
    const onEdit = vi.fn<(event: CalendarEvent) => void>();
    const onDelete = vi.fn<(event: CalendarEvent) => void>();

    const { result } = renderHook(() =>
      useEventDetailPanelController(
        baseProps({ event: makeEvent({ access: "busy" }), onDelete, onEdit })
      )
    );

    expect(result.current.isRestricted).toBeTruthy();
    expect(result.current.canEdit).toBeFalsy();
    expect(result.current.canDelete).toBeFalsy();

    act(() => {
      result.current.handleEdit();
      result.current.handleDelete();
    });

    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("useEventDetailPanelController shadow-root focus", () => {
  it("restores focus to an opener inside the supplied shadow root", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    const opener = document.createElement("button");

    root.append(container);
    container.append(opener);
    opener.focus();

    try {
      const { result, rerender } = renderHook(
        (props: EventDetailPanelProps) => useEventDetailPanelController(props),
        { initialProps: baseProps({ container, open: false }) }
      );

      act(() => {
        rerender(baseProps({ container, open: true }));
      });

      act(() => {
        result.current.close();
      });

      expect(root.activeElement).toBe(opener);
    } finally {
      host.remove();
    }
  });
});
