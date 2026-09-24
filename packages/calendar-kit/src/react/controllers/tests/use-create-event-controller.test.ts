import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type {
  CreateEventDraft,
  CreateEventResult,
  TimedCreateEventDraft,
} from "../../../core/model";
import { useCreateEventController } from "../use-create-event-controller";

const DATE = calendarDate("2026-08-24");

type ControllerOptions = Parameters<typeof useCreateEventController>[0];

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

const noSubmit = (): Promise<CreateEventResult> | undefined => [][0];

const options = (
  overrides: Partial<ControllerOptions> = {}
): ControllerOptions => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [{ id: "meet", label: "Constructor Meet" }],
  defaultDraft: draft(),
  locations: [{ id: "room-1", label: "Science Hall 204" }],
  onCancel: () => {},
  onSubmit: noSubmit,
  people: [
    { id: "person-1", label: "Ada Lovelace" },
    { id: "person-2", label: "Grace Hopper" },
  ],
  ...overrides,
});

describe(useCreateEventController, () => {
  it("seeds an uncontrolled draft and reports dirty state after a draft update", () => {
    const { result } = renderHook(() => useCreateEventController(options()));

    const nextDraft: TimedCreateEventDraft = {
      ...draft(),
      title: "Updated planning session",
    };

    expect(result.current.draft).toStrictEqual(draft());
    expect(result.current.isDirty).toBeFalsy();

    act(() => {
      result.current.setDraft(nextDraft);
    });

    expect(result.current.draft).toStrictEqual(nextDraft);
    expect(result.current.isDirty).toBeTruthy();
  });

  it("stays clean when the host resolves its own defaults after the card is open", () => {
    const initialDraft = draft();
    const { rerender, result } = renderHook(
      (currentDraft: CreateEventDraft) =>
        useCreateEventController(options({ draft: currentDraft, open: true })),
      { initialProps: initialDraft as CreateEventDraft }
    );

    rerender({ ...initialDraft, calendarId: "calendar-2" });

    expect(result.current.isDirty).toBeFalsy();

    act(() => {
      result.current.requestCancel();
    });

    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });

  it("uses the controlled draft as the source of truth and emits the exact replacement", () => {
    const initialDraft = draft();

    const nextDraft: TimedCreateEventDraft = {
      ...initialDraft,
      title: "Controlled replacement",
    };

    const onDraftChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (controllerOptions: ControllerOptions) =>
        useCreateEventController(controllerOptions),
      {
        initialProps: options({ draft: initialDraft, onDraftChange }),
      }
    );

    act(() => {
      result.current.setDraft(nextDraft);
    });

    expect(onDraftChange).toHaveBeenCalledExactlyOnceWith(nextDraft);
    expect(result.current.draft).toStrictEqual(initialDraft);

    rerender(options({ draft: nextDraft, onDraftChange }));

    expect(result.current.draft).toStrictEqual(nextDraft);
  });

  it("keeps open state controlled until the host accepts the close request", () => {
    const onOpenChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (controllerOptions: ControllerOptions) =>
        useCreateEventController(controllerOptions),
      {
        initialProps: options({ onOpenChange, open: true }),
      }
    );

    expect(result.current.isOpen).toBeTruthy();

    act(() => {
      result.current.setOpen(false);
    });

    expect(result.current.isOpen).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);

    rerender(options({ onOpenChange, open: false }));

    expect(result.current.isOpen).toBeFalsy();
  });

  it("supports uncontrolled expansion and reports the host callback", () => {
    const onExpandedChange = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useCreateEventController(
        options({ defaultExpanded: false, onExpandedChange })
      )
    );

    expect(result.current.isExpanded).toBeFalsy();

    act(() => {
      result.current.setExpanded(true);
    });

    expect(result.current.isExpanded).toBeTruthy();
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("rejects invalid draft data before invoking the host submit callback", async () => {
    const onSubmit =
      vi.fn<
        (
          submittedDraft: CreateEventDraft
        ) => Promise<CreateEventResult> | undefined
      >();

    const { result } = renderHook(() =>
      useCreateEventController(
        options({
          defaultDraft: {
            ...draft(),
            endTime: parseLocalTime("14:00"),
            startTime: parseLocalTime("15:00"),
            title: " ",
          },
          onSubmit,
        })
      )
    );

    await act(async () => await result.current.submit());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.title).toBe("required");
    expect(result.current.errors.endTime).toBe("before-start");
  });

  it("calls the host submit callback once while an async attempt is pending", async () => {
    const { promise: pending, resolve: resolveSubmit } =
      Promise.withResolvers<CreateEventResult>();

    const onSubmit = vi.fn<
      (submittedDraft: CreateEventDraft) => Promise<CreateEventResult>
    >(async () => await pending);

    const { result } = renderHook(() =>
      useCreateEventController(options({ onSubmit }))
    );

    let firstAttempt: Promise<CreateEventResult | undefined> | undefined;

    let secondAttempt: Promise<CreateEventResult | undefined> | undefined;

    act(() => {
      firstAttempt = result.current.submit();
      secondAttempt = result.current.submit();
    });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(draft());
    expect(result.current.isSubmitting).toBeTruthy();

    await act(async () => {
      resolveSubmit({ eventId: "event-1" });
      await firstAttempt;
      await secondAttempt;
    });

    expect(result.current.isSubmitting).toBeFalsy();
    expect(result.current.submitError).toBeNull();
  });

  it("keeps the form open and exposes a typed host error after a rejected result", async () => {
    const hostError = {
      kind: "transport" as const,
      message: "Calendar service unavailable",
    };

    const onSubmit = vi.fn<
      (submittedDraft: CreateEventDraft) => Promise<CreateEventResult>
    >(async () => await Promise.resolve({ error: hostError }));

    const { result } = renderHook(() =>
      useCreateEventController(options({ onSubmit }))
    );

    await act(async () => await result.current.submit());

    expect(result.current.submitError).toStrictEqual(hostError);
    expect(result.current.isOpen).toBeTruthy();
    expect(result.current.isSubmitting).toBeFalsy();
  });

  it("maps a rejected host promise to a transport error without calling a service itself", async () => {
    const onSubmit = vi.fn<
      (submittedDraft: CreateEventDraft) => Promise<CreateEventResult>
    >(async () => await Promise.reject(new Error("network down")));

    const { result } = renderHook(() =>
      useCreateEventController(options({ onSubmit }))
    );

    await act(async () => await result.current.submit());

    await waitFor(() => {
      expect(result.current.submitError).toStrictEqual({
        kind: "transport",
        message: "network down",
      });
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("cancels a clean draft immediately", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.requestCancel();
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });

  it("asks before discarding a dirty draft", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.requestCancel();
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(result.current.isDiscardDialogOpen).toBeFalsy();

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed before closing" });
    });
    act(() => {
      result.current.requestCancel();
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(result.current.isDiscardDialogOpen).toBeTruthy();
  });

  it("dismisses the dirty-draft confirmation", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed before closing" });
      result.current.requestCancel();
      result.current.dismissDiscard();
    });

    expect(result.current.isDiscardDialogOpen).toBeFalsy();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("confirms discarding the dirty draft", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed before closing" });
      result.current.requestCancel();
      result.current.confirmDiscard();
    });

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });
});
