import { act, renderHook } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import {
  isValidRecurrenceRule,
  validateCreateEventDraft,
} from "../../../core/create-event";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type {
  AllDayCreateEventDraft,
  CreateEventDraft,
  CreateEventResult,
  TimedCreateEventDraft,
} from "../../../core/model";
import { useCreateEventController } from "../../../react/controllers/use-create-event-controller";
import {
  createEventErrorMessages,
  firstCreateEventError,
} from "../create-event-validation";

declare global {
  interface PromiseConstructor {
    withResolvers: <T>() => {
      promise: Promise<T>;
      reject: (reason?: unknown) => void;
      resolve: (value: T | PromiseLike<T>) => void;
    };
  }
}

const DATE = calendarDate("2026-08-24");

const NEXT_DATE = calendarDate("2026-08-25");

const draft = (): TimedCreateEventDraft => ({
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
});

describe("create-event-validation", () => {
  it("returns translated field messages for invalid drafts", () => {
    const validation = validateCreateEventDraft({
      ...draft(),
      endTime: parseLocalTime("08:00"),
      title: " ",
    });

    const messages = createEventErrorMessages(validation.errors, (key) => key);

    assert(messages.title).toBe("calendar.create_event.error.required");
    assert(messages.endTime).toBe("calendar.create_event.error.endBeforeStart");
    assert(firstCreateEventError(validation.errors, (key) => key)).toBe(
      "calendar.create_event.error.required"
    );
  });

  it("does not create an error message when the draft is valid", () => {
    const validation = validateCreateEventDraft(draft());

    assert(
      firstCreateEventError(validation.errors, (key) => key)
    ).toBeUndefined();
  });

  it("covers recurrence grammar and timed range branches", () => {
    assert(isValidRecurrenceRule("")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=DAILY;FREQ=WEEKLY")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=HOURLY")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=DAILY;INTERVAL=0")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=DAILY;COUNT=0")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=DAILY;UNTIL=invalid")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=WEEKLY;BYDAY=XX")).toBeFalsy();
    assert(isValidRecurrenceRule("FREQ=DAILY;UNKNOWN=value")).toBeFalsy();
    assert(
      isValidRecurrenceRule(
        "FREQ=WEEKLY;INTERVAL=2;COUNT=3;UNTIL=20260824T120000Z;BYDAY=MO,WE"
      )
    ).toBeTruthy();

    const invalidStart = draft();
    Object.defineProperty(invalidStart, "startTime", { value: "25:00" });

    const invalidEnd = draft();
    Object.defineProperty(invalidEnd, "endTime", { value: "25:00" });

    assert(validateCreateEventDraft(invalidStart).errors.startTime).toBe(
      "invalid"
    );
    assert(validateCreateEventDraft(invalidEnd).errors.endTime).toBe("invalid");
    assert(
      validateCreateEventDraft({
        ...draft(),
        endDate: calendarDate("2026-08-23"),
      }).errors.endDate
    ).toBe("before-start");
    assert(
      validateCreateEventDraft({ ...draft(), endTime: null }).valid
    ).toBeTruthy();
    assert(
      validateCreateEventDraft({
        ...draft(),
        endDate: NEXT_DATE,
        endTime: parseLocalTime("08:00"),
      }).valid
    ).toBeTruthy();
  });

  it("validates all-day clocks and exclusive end dates", () => {
    const invalidAllDay: AllDayCreateEventDraft = {
      allDay: true,
      calendarId: "calendar-1",
      endDate: DATE,
      endTime: null,
      startDate: DATE,
      startTime: null,
      timeZone: UTC,
      title: "Planning session",
    };

    Reflect.set(invalidAllDay, "startTime", parseLocalTime("09:00"));
    Reflect.set(invalidAllDay, "endTime", parseLocalTime("10:00"));

    const validAllDay: AllDayCreateEventDraft = {
      allDay: true,
      calendarId: "calendar-1",
      endDate: NEXT_DATE,
      endTime: null,
      startDate: DATE,
      startTime: null,
      timeZone: UTC,
      title: "Planning session",
    };

    assert(validateCreateEventDraft(invalidAllDay).errors.startTime).toBe(
      "invalid"
    );
    assert(validateCreateEventDraft(invalidAllDay).errors.endDate).toBe(
      "before-start"
    );
    assert(validateCreateEventDraft(validAllDay).valid).toBeTruthy();
  });

  it("supports default drafts, attendee comparisons, controlled rollback, and submit rejection", async () => {
    const onCancel = vi.fn<() => void>();
    const onDraftChange = vi.fn<(draft: CreateEventDraft) => void>();
    const onOpenChange = vi.fn<(open: boolean) => void>();

    const { result } = renderHook(() =>
      useCreateEventController({
        defaultDraft: undefined,
        defaultOpen: true,
        onCancel: () => {
          onCancel();
        },
        onSubmit: vi.fn<
          (draft: CreateEventDraft) => Promise<CreateEventResult>
        >(
          async (_draft: CreateEventDraft) =>
            await Promise.resolve({ eventId: "created" })
        ),
      })
    );

    assert(result.current.draft.title).toBe("");

    act(() => {
      result.current.setDraft({
        ...result.current.draft,
        attendeeIds: ["one"],
      });
    });
    act(() => {
      result.current.setDraft({
        ...result.current.draft,
        attendeeIds: ["two"],
      });
    });
    assert(result.current.isDirty).toBeTruthy();

    const controlledDraft = draft();

    const controlled = renderHook(() =>
      useCreateEventController({
        draft: controlledDraft,
        onCancel: () => {
          onCancel();
        },
        onDraftChange: (nextDraft) => {
          onDraftChange(nextDraft);
        },
        onOpenChange: (open) => {
          onOpenChange(open);
        },
        onSubmit: vi.fn<() => undefined>(),
        open: true,
      })
    );

    act(() => {
      controlled.result.current.setDraft({
        ...controlledDraft,
        title: "Changed",
      });
    });
    act(() => {
      controlled.result.current.confirmDiscard();
    });

    assert(onDraftChange).toHaveBeenLastCalledWith(controlledDraft);
    assert(onOpenChange).toHaveBeenCalledWith(false);
    assert(onCancel).toHaveBeenCalledOnce();

    const rejection = renderHook(() =>
      useCreateEventController({
        defaultDraft: draft(),
        onCancel: () => {},
        onSubmit: vi.fn<(draft: CreateEventDraft) => never>(() => {
          throw new Error("service unavailable");
        }),
      })
    );

    let response;
    await act(async () => {
      response = await rejection.result.current.submit();
    });

    assert(response).toStrictEqual({
      error: { kind: "transport", message: "service unavailable" },
    });
    assert(rejection.result.current.submitError?.kind).toBe("transport");
  });

  it("ignores cancel and duplicate submit while an async save is pending", async () => {
    let resolveSubmit: (() => void) | undefined;

    const onSubmit = vi.fn<
      (draft: CreateEventDraft) => Promise<{ eventId: string }>
    >(async (_draft: CreateEventDraft) => {
      const deferred = Promise.withResolvers<{ eventId: string }>();
      resolveSubmit = () => {
        deferred.resolve({ eventId: "created" });
      };

      return await deferred.promise;
    });

    const onCancel = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useCreateEventController({
        defaultDraft: draft(),
        onCancel: () => {
          onCancel();
        },
        onSubmit,
      })
    );

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.submit();
      void result.current.submit();
      result.current.requestCancel();
    });
    assert(onSubmit).toHaveBeenCalledOnce();
    assert(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      resolveSubmit?.();
      await pending;
    });
    assert(result.current.isOpen).toBeFalsy();
  });
});
