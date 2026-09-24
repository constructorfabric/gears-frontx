import { useRef, useState } from "react";

import { validateCreateEventDraft } from "../../core/create-event";
import type { CreateEventValidationErrors } from "../../core/create-event";
import type {
  CalendarRef,
  CreateEventDraft,
  CreateEventResult,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
} from "../../core/validation";

export type CreateEventSubmitError = Omit<
  NonNullable<CreateEventResult["error"]>,
  "message"
> & {
  readonly message: string | null;
};

export interface CalendarResourceOption {
  /** Stable id stored on the draft. */
  readonly id: string;
  /** Display text, also what the combobox filters on. */
  readonly label: string;
}

export interface UseCreateEventControllerOptions {
  /** Controlled open state. */
  readonly open?: boolean;
  /** Initial open state when uncontrolled. */
  readonly defaultOpen?: boolean;
  /** Called on open and close, including after submit and a confirmed discard. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Controlled draft. */
  readonly draft?: CreateEventDraft;
  /** Initial draft when uncontrolled. Also the baseline for the unsaved-changes check. */
  readonly defaultDraft?: CreateEventDraft;
  /** Called on every field edit. */
  readonly onDraftChange?: (draft: CreateEventDraft) => void;
  /** Controlled expanded state: the same form as a larger centered window. */
  readonly expanded?: boolean;
  /** Initial expanded state when uncontrolled. */
  readonly defaultExpanded?: boolean;
  /** Called when the expand or collapse control is used. */
  readonly onExpandedChange?: (expanded: boolean) => void;
  /** Calendars offered in the schedule field. */
  readonly calendars?: readonly CalendarRef[];
  /** People offered in the people combobox. */
  readonly people?: readonly CalendarResourceOption[];
  /** Locations offered in the location combobox. */
  readonly locations?: readonly CalendarResourceOption[];
  /** Conferencing providers offered in the conferencing select. */
  readonly conferencingProviders?: readonly CalendarResourceOption[];
  /** Zone the draft is edited in. */
  readonly timeZone?: IanaTimeZone;
  /** Reference instant for the time-zone offset label. Omit to follow the wall clock. */
  readonly now?: UtcInstant;
  /** Called with a valid draft; a returned `error` keeps the form open. */
  readonly onSubmit: (
    draft: CreateEventDraft
  ) => Promise<CreateEventResult> | undefined;
  /** Called when the form closes without saving: a clean cancel, or a confirmed discard. */
  readonly onCancel: () => void;
}

export interface UseCreateEventControllerResult {
  readonly draft: CreateEventDraft;
  readonly isDirty: boolean;
  readonly isOpen: boolean;
  readonly isExpanded: boolean;
  readonly isSubmitting: boolean;
  readonly errors: CreateEventValidationErrors;
  readonly submitError: CreateEventSubmitError | null;
  readonly isDiscardDialogOpen: boolean;
  readonly setDraft: (draft: CreateEventDraft) => void;
  readonly setOpen: (open: boolean) => void;
  readonly setExpanded: (expanded: boolean) => void;
  readonly submit: () => Promise<CreateEventResult | undefined>;
  readonly requestCancel: () => void;
  readonly dismissDiscard: () => void;
  readonly confirmDiscard: () => void;
}

const createDefaultDraft = (
  timeZone: IanaTimeZone,
  now?: UtcInstant
): CreateEventDraft => {
  const date = calendarDate(
    (now === undefined ? new Date() : new Date(now)).toISOString().slice(0, 10)
  );

  return {
    allDay: false,
    calendarId: null,
    endDate: date,
    endTime: parseLocalTime("10:00"),
    startDate: date,
    startTime: parseLocalTime("09:00"),
    timeZone,
    title: "",
  };
};

const COMPARED_DRAFT_FIELDS = [
  "title",
  "startDate",
  "endDate",
  "timeZone",
  "calendarId",
  "allDay",
  "startTime",
  "endTime",
  "eventTypeId",
  "location",
  "conferencingProviderId",
  "recurrenceRule",
  "description",
] as const satisfies readonly (keyof CreateEventDraft)[];

const sameDraft = (
  left: CreateEventDraft,
  right: CreateEventDraft
): boolean => {
  if (COMPARED_DRAFT_FIELDS.some((field) => left[field] !== right[field])) {
    return false;
  }

  const leftAttendees = left.attendeeIds ?? [];
  const rightAttendees = right.attendeeIds ?? [];

  return (
    leftAttendees.length === rightAttendees.length &&
    leftAttendees.every((id, index) => id === rightAttendees[index])
  );
};

export const useCreateEventController = (
  options: UseCreateEventControllerOptions
): UseCreateEventControllerResult => {
  const [initialDraft, setInitialDraft] = useState<CreateEventDraft>(
    () =>
      options.defaultDraft ??
      options.draft ??
      createDefaultDraft(
        options.timeZone ?? parseIanaTimeZone("UTC"),
        options.now
      )
  );

  const [internalDraft, setInternalDraft] = useState(initialDraft);

  const [internalOpen, setInternalOpen] = useState(
    options.defaultOpen ?? options.open ?? true
  );

  const [internalExpanded, setInternalExpanded] = useState(
    options.defaultExpanded ?? false
  );

  const [errors, setErrors] = useState<CreateEventValidationErrors>({});

  const [submitError, setSubmitError] = useState<CreateEventSubmitError | null>(
    null
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

  // Host default writes are not user edits.
  const [isEdited, setIsEdited] = useState(false);

  const submittingRef = useRef(false);

  const isDraftControlled = options.draft !== undefined;
  const isOpenControlled = options.open !== undefined;
  const isExpandedControlled = options.expanded !== undefined;

  const draft = isDraftControlled ? options.draft : internalDraft;

  const isOpen = isOpenControlled ? options.open : internalOpen;

  const isExpanded = isExpandedControlled ? options.expanded : internalExpanded;

  const isDirty = isEdited && !sameDraft(draft, initialDraft);

  const [previousOpen, setPreviousOpen] = useState(isOpen);

  if (previousOpen !== isOpen) {
    setPreviousOpen(isOpen);

    if (isOpen) {
      setIsEdited(false);

      if (isDraftControlled) {
        setInitialDraft(draft);
      }
    }
  }

  const writeDraft = (nextDraft: CreateEventDraft): void => {
    if (isDraftControlled) {
      options.onDraftChange?.(nextDraft);
    } else {
      setInternalDraft(nextDraft);
    }
  };

  const setDraft = (nextDraft: CreateEventDraft): void => {
    setIsEdited(true);
    writeDraft(nextDraft);
    setErrors({});
    setSubmitError(null);
  };

  const setOpen = (nextOpen: boolean): void => {
    if (!isOpenControlled) {
      setInternalOpen(nextOpen);
    }

    options.onOpenChange?.(nextOpen);
  };

  const setExpanded = (nextExpanded: boolean): void => {
    if (!isExpandedControlled) {
      setInternalExpanded(nextExpanded);
    }

    options.onExpandedChange?.(nextExpanded);
  };

  const submit = async (): Promise<CreateEventResult | undefined> => {
    if (submittingRef.current) {
      return undefined;
    }

    const validation = validateCreateEventDraft(draft);

    if (!validation.valid) {
      setErrors(validation.errors);
      setSubmitError(null);

      return undefined;
    }

    const endSubmit = (): void => {
      submittingRef.current = false;
      setIsSubmitting(false);
    };

    submittingRef.current = true;
    setIsSubmitting(true);
    setErrors({});
    setSubmitError(null);

    let result: CreateEventResult | undefined;

    try {
      result = await options.onSubmit(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : null;

      endSubmit();
      setSubmitError({ kind: "transport", message });

      return message === null
        ? undefined
        : { error: { kind: "transport", message } };
    }

    endSubmit();

    if (result?.error !== undefined) {
      setSubmitError(result.error);

      return result;
    }

    setInitialDraft(draft);
    setOpen(false);

    return result;
  };

  const requestCancel = (): void => {
    if (isSubmitting || submittingRef.current) {
      return;
    }

    if (isDirty) {
      setIsDiscardDialogOpen(true);

      return;
    }

    setOpen(false);
    options.onCancel();
  };

  const dismissDiscard = (): void => {
    setIsDiscardDialogOpen(false);
  };

  const confirmDiscard = (): void => {
    setIsDiscardDialogOpen(false);
    setIsEdited(false);
    writeDraft(initialDraft);
    setOpen(false);
    options.onCancel();
  };

  return {
    confirmDiscard,
    dismissDiscard,
    draft,
    errors,
    isDirty,
    isDiscardDialogOpen,
    isExpanded,
    isOpen,
    isSubmitting,
    requestCancel,
    setDraft,
    setExpanded,
    setOpen,
    submit,
    submitError,
  };
};

export type {
  CreateEventField,
  CreateEventValidationError,
} from "../../core/create-event";
