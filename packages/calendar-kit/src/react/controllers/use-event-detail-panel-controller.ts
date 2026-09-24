import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { CalendarAttendee, CalendarEvent } from "../../core/model";

export const COPY_STATUS_RESET_MS = 2000;

const DEFAULT_MAX_VISIBLE_PARTICIPANTS = 6;

const EMPTY_ATTENDEES: readonly CalendarAttendee[] = [];

type FocusContainer =
  | Element
  | DocumentFragment
  | null
  | RefObject<Element | DocumentFragment | null>;

export type EventDetailPanelCopyStatus = "idle" | "copied" | "error";

export interface UseEventDetailPanelControllerOptions {
  readonly event?: CalendarEvent | null;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onClose: () => void;
  readonly onEdit?: (event: CalendarEvent) => void;
  readonly onDelete?: (event: CalendarEvent) => void;
  readonly readOnly?: boolean;
  readonly maxVisibleParticipants?: number;
  readonly container?: FocusContainer;
}

export interface EventDetailPanelControllerInternals {
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly originFocus: HTMLElement | null;
}

export interface UseEventDetailPanelControllerResult {
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly canCopyJoinLink: boolean;
  readonly copyLink: () => void;
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly visibleParticipants: readonly CalendarAttendee[];
  readonly participantOverflowCount: number;
  readonly isRestricted: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly handleEdit: () => void;
  readonly handleDelete: () => void;
  readonly getInternals: () => Readonly<EventDetailPanelControllerInternals>;
}

interface CopyStateRecord {
  readonly eventId: string | null;
  readonly state: EventDetailPanelCopyStatus;
}

const resolveFocusContainer = (
  container: FocusContainer | undefined
): Element | DocumentFragment | null => {
  if (!container) {
    return null;
  }
  if (container instanceof Element || container instanceof DocumentFragment) {
    return container;
  }
  return container.current;
};

const findActiveElement = (
  container: FocusContainer | undefined
): HTMLElement | null => {
  const resolvedContainer = resolveFocusContainer(container);

  if (resolvedContainer !== null) {
    const root = resolvedContainer.getRootNode();

    if (
      root instanceof ShadowRoot &&
      root.activeElement instanceof HTMLElement
    ) {
      return root.activeElement;
    }
  }

  const documentActiveElement = document.activeElement;

  if (documentActiveElement?.shadowRoot?.activeElement instanceof HTMLElement) {
    return documentActiveElement.shadowRoot.activeElement;
  }

  return documentActiveElement instanceof HTMLElement
    ? documentActiveElement
    : null;
};

export const isSafeHttpUrl = (
  url: string | null | undefined
): url is string => {
  if (typeof url !== "string" || url === "") {
    return false;
  }

  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const useEventDetailPanelController = (
  options: UseEventDetailPanelControllerOptions
): UseEventDetailPanelControllerResult => {
  const {
    event,
    open,
    defaultOpen,
    onOpenChange,
    onClose,
    onEdit,
    onDelete,
    readOnly = false,
    maxVisibleParticipants,
    container,
  } = options;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    defaultOpen ?? false
  );

  const [copyState, setCopyState] = useState<CopyStateRecord>({
    eventId: null,
    state: "idle",
  });

  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isControlled = open !== undefined && defaultOpen === undefined;

  const isOpen = isControlled ? open : uncontrolledOpen;

  const originFocusRef = useRef<HTMLElement | null>(null);
  const previousOpenRef = useRef(isOpen);

  const eventId = event?.id ?? null;

  const copyStatus: EventDetailPanelCopyStatus =
    copyState.eventId === eventId ? copyState.state : "idle";

  const isRestricted = event?.access === "busy";
  const attendees = event?.attendees ?? EMPTY_ATTENDEES;
  const cap = maxVisibleParticipants ?? DEFAULT_MAX_VISIBLE_PARTICIPANTS;
  const visibleParticipants = attendees.slice(0, cap);
  const participantOverflowCount = Math.max(
    0,
    attendees.length - visibleParticipants.length
  );
  const canCopyJoinLink = isSafeHttpUrl(event?.joinUrl);
  const canEdit = !isRestricted && !readOnly && onEdit !== undefined;
  const canDelete = !isRestricted && !readOnly && onDelete !== undefined;

  useLayoutEffect(() => {
    if (
      isOpen &&
      (!previousOpenRef.current || originFocusRef.current === null)
    ) {
      originFocusRef.current = findActiveElement(container);
    }

    previousOpenRef.current = isOpen;
  }, [container, isOpen]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    },
    []
  );

  const close = (): void => {
    originFocusRef.current?.focus();

    if (!isControlled && isOpen) {
      setUncontrolledOpen(false);
    }

    onOpenChange?.(false);
    onClose();
  };

  const scheduleCopyStatusReset = (): void => {
    if (copyResetTimerRef.current !== null) {
      clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = setTimeout(() => {
      copyResetTimerRef.current = null;
      setCopyState((previous) =>
        previous.state === "idle" ? previous : { ...previous, state: "idle" }
      );
    }, COPY_STATUS_RESET_MS);
  };

  const copyLink = (): void => {
    const url = event?.joinUrl;

    if (!isSafeHttpUrl(url)) {
      return;
    }

    const targetEventId = event?.id ?? null;

    const clipboard =
      "clipboard" in navigator ? navigator.clipboard : undefined;

    if (!clipboard) {
      setCopyState({ eventId: targetEventId, state: "error" });
      scheduleCopyStatusReset();
      return;
    }

    const writeLink = async (): Promise<void> => {
      try {
        await clipboard.writeText(url);
        setCopyState({ eventId: targetEventId, state: "copied" });
        scheduleCopyStatusReset();
      } catch {
        setCopyState({ eventId: targetEventId, state: "error" });
        scheduleCopyStatusReset();
      }
    };

    void writeLink();
  };

  const handleEdit = (): void => {
    if (!canEdit || !event) {
      return;
    }

    onEdit(event);
  };

  const handleDelete = (): void => {
    if (!canDelete || !event) {
      return;
    }

    onDelete(event);
  };

  const getInternals = (): Readonly<EventDetailPanelControllerInternals> => ({
    copyStatus,
    originFocus: originFocusRef.current,
  });

  return {
    canCopyJoinLink,
    canDelete,
    canEdit,
    close,
    copyLink,
    copyStatus,
    getInternals,
    handleDelete,
    handleEdit,
    isOpen,
    isRestricted,
    participantOverflowCount,
    visibleParticipants,
  };
};
