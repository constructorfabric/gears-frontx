import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import type {
  CalendarCellContext,
  CalendarConflict,
  CalendarDetailRenderContext,
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
  CalendarMoveRequest,
  CalendarSelectionRange,
  CalendarTranslate,
  IanaTimeZone,
} from "../core/model";

export interface CalendarLocalizedProps {
  /** Resolved translator. */
  readonly t: CalendarTranslate;
  /** Resolved text direction. */
  readonly direction: CalendarDirection;
  /** Class added to the component root. */
  readonly className?: string;
}

export interface CalendarTemporalProps extends CalendarLocalizedProps {
  /** Resolved locale. */
  readonly locale: string;
  /** Viewer time zone every date and time is shown in. */
  readonly timeZone: IanaTimeZone;
}

export interface CalendarQuickCreatePayload {
  /** The activated slot as a one-cell range, or the painted range. */
  readonly range: CalendarSelectionRange;
  /** Screen rectangle of the activated cell, for anchoring a create popover. */
  readonly anchorRect?: DOMRectReadOnly;
}

export type CalendarEventRenderer<Payload = unknown> = (
  context: CalendarEventRenderContext<Payload>
) => ReactNode;

export type CalendarConflictRenderer = (
  conflict: CalendarConflict,
  context: CalendarEventRenderContext
) => ReactNode;

export type CalendarDetailRenderer<Payload = unknown> = (
  context: CalendarDetailRenderContext<Payload>
) => ReactNode;

export interface CalendarInteractionCallbacks<Payload = unknown> {
  /** Click, Enter or Space on an available event; `anchor` is the card, for a detail popover. */
  readonly onEventSelect?: (
    event: CalendarEvent<Payload>,
    context: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  /** An empty slot was activated in `quick-create` mode. */
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
  /** A range was painted in `paint-and-move` mode. The range is ordered and serializable. */
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
  /** An event was dropped in `paint-and-move` mode; call `confirm` or `cancel`. */
  readonly onMoveRequest?: (request: CalendarMoveRequest) => void;
}

export type CalendarGridCellKeyDownHandler = (
  event: ReactKeyboardEvent<HTMLDivElement>,
  context: CalendarCellContext
) => void;

export type CalendarEventKeyDownHandler<Payload = unknown> = (
  event: ReactKeyboardEvent<HTMLButtonElement>,
  context: CalendarEventRenderContext<Payload>
) => void;
