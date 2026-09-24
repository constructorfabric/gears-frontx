// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-keyboard:p1

import { clsx } from "clsx";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { arrayAt } from "../../core/array";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarDate,
  CalendarEventRenderContext,
  CalendarGridColumn,
  WeekGridInteractionMode,
} from "../../core/model";
import { toViewerDateTime } from "../../core/temporal";
import { useCalendarContext } from "../../i18n/calendar-context";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { useWeekGridController } from "../../react/controllers/use-week-grid-controller";
import type { FocusedCell } from "../../react/controllers/use-week-grid-controller";
import { useCurrentInstant } from "../../react/hooks/use-current-instant";
import type { WeekGridProps } from "./week-grid";
import {
  buildAllDayPositions,
  buildGridData,
  buildNowPosition,
  buildTimedPositions,
  buildTimedSegments,
  buildUnavailableCellKeys,
  buildVisibleAllDaySpans,
  formatDayNumber,
  formatFullDateForDate,
  formatWeekday,
} from "./week-grid-layout";
import type { CellMeta } from "./week-grid-layout";

import styles from "./week-grid.module.css";

export interface WeekGridNowLineStyle extends CSSProperties {
  readonly "--cal-now-segment-inline-size"?: string;
  readonly "--cal-now-segment-inline-start"?: string;
}

export interface WeekGridHeaderColumn {
  readonly column: CalendarGridColumn;
  readonly dayNumber: string | undefined;
  readonly isToday: boolean;
  readonly weekday: string | undefined;
}

export type WeekGridContentProps<Payload> = Omit<
  WeekGridProps<Payload>,
  keyof CalendarContextProps
>;

const DEFAULT_VISIBLE_DAYS = 5;
const DEFAULT_MODE: WeekGridInteractionMode = "quick-create";

export const EMPTY_LIST: readonly never[] = [];

const framesScroll = (element: HTMLElement): boolean =>
  element.scrollHeight > element.clientHeight;

const eventIdAtTarget = (target: EventTarget | null): string | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  return (
    target.closest<HTMLElement>("[data-event-id]")?.dataset.eventId ?? null
  );
};

export const useWeekGridContent = <Payload = unknown>(
  props: WeekGridContentProps<Payload>
) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
  const {
    date,
    events,
    now,
    visibleDays = DEFAULT_VISIBLE_DAYS,
    visibleHours,
    slotMinutes,
    workingHours,
    trailingGutter = false,
    interactionMode,
    defaultInteractionMode = DEFAULT_MODE,
    onInteractionModeChange,
    selectedEventId,
    defaultSelectedEventId,
    onSelectedEventIdChange,
    renderEvent,
    renderConflict,
    renderCell,
    renderUnavailable,
    onEventSelect,
    onQuickCreate,
    onPaintSelect,
    onMoveRequest,
    className,
  } = props;

  const controller = useWeekGridController({
    date,
    defaultInteractionMode,
    defaultSelectedEventId,
    direction,
    events,
    interactionMode,
    onEventSelect,
    onInteractionModeChange,
    onMoveRequest,
    onPaintSelect,
    onQuickCreate,
    onSelectedEventIdChange,
    selectedEventId,
    slotMinutes,
    timeZone,
    visibleDays,
    visibleHours,
    workingHours,
  });
  const controllerCellKey = controller.getCellKey;

  const { currentInstant } = useCurrentInstant({
    cadence: "interval",
    intervalMs: 60_000,
    now,
  });
  const todayDate = toViewerDateTime(currentInstant, timeZone).date;

  const draggedEventIdRef = useRef<string | null>(null);

  const [dismissedDetailId, setDismissedDetailId] = useState<string | null>(
    null
  );

  const [liveText, setLiveText] = useState("");

  const positionedDateRef = useRef<CalendarDate | null>(null);
  const framePositionedDateRef = useRef<CalendarDate | null>(null);

  const scrollOffset = useCallback(
    (element: HTMLElement): number =>
      (element.scrollHeight / controller.slotRowCount) *
      controller.workingSlotIndex,
    [controller.slotRowCount, controller.workingSlotIndex]
  );

  const frameRef = useCallback(
    (element: HTMLDivElement | null): void => {
      if (
        element === null ||
        framePositionedDateRef.current === date ||
        !framesScroll(element)
      ) {
        return;
      }

      framePositionedDateRef.current = date;

      element.scrollTop = scrollOffset(element);
    },
    [date, scrollOffset]
  );

  const scrollRef = useCallback(
    (element: HTMLDivElement | null): void => {
      if (element === null) {
        return;
      }
      if (positionedDateRef.current === date) {
        return;
      }

      if (!framesScroll(element)) {
        return;
      }

      positionedDateRef.current = date;

      element.scrollTop = scrollOffset(element);
    },
    [date, scrollOffset]
  );

  const gridData = useMemo(
    () =>
      buildGridData(
        controller.dayColumns,
        controller.viewerDates,
        timeZone,
        t,
        locale,
        controllerCellKey,
        {
          slotRowCount: controller.slotRowCount,
          workingHours: controller.workingHours,
        }
      ),
    [
      controller.dayColumns,
      controller.slotRowCount,
      controller.viewerDates,
      controller.workingHours,
      controllerCellKey,
      locale,
      t,
      timeZone,
    ]
  );

  const viewerDateByDate = useMemo(
    () =>
      new Map<string, CalendarDate>(
        controller.viewerDates.map((viewerDate) => [viewerDate, viewerDate])
      ),
    [controller.viewerDates]
  );

  const headerColumns = useMemo<readonly WeekGridHeaderColumn[]>(
    () =>
      gridData.columns.map((column) => {
        if (column.key === "time") {
          return {
            column,
            dayNumber: undefined,
            isToday: false,
            weekday: undefined,
          };
        }

        const viewerDate = viewerDateByDate.get(column.key);

        const dayStart =
          viewerDate === undefined
            ? undefined
            : gridData.allDayCellByDate.get(viewerDate)?.start;

        return {
          column,
          dayNumber:
            dayStart === undefined
              ? undefined
              : formatDayNumber(dayStart, timeZone, locale),
          isToday: viewerDate === todayDate,
          weekday:
            dayStart === undefined
              ? undefined
              : formatWeekday(dayStart, timeZone, locale),
        };
      }),
    [
      gridData.allDayCellByDate,
      viewerDateByDate,
      gridData.columns,
      locale,
      timeZone,
      todayDate,
    ]
  );

  const timedSegments = useMemo(() => {
    try {
      return buildTimedSegments(events, controller.viewerDates, timeZone);
    } catch {
      return [];
    }
  }, [controller.viewerDates, events, timeZone]);

  const allDaySpans = useMemo(() => {
    try {
      return buildVisibleAllDaySpans(
        events,
        controller.allViewerDates,
        controller.viewerDates,
        timeZone
      );
    } catch {
      return [];
    }
  }, [controller.allViewerDates, controller.viewerDates, events, timeZone]);

  const gridCellKey = useMemo(
    () =>
      (cell: CalendarCell): string =>
        gridData.cellKeyByCell.get(cell) ?? controllerCellKey(cell),
    [controllerCellKey, gridData.cellKeyByCell]
  );

  const timedPositionsByCell = useMemo(
    () =>
      buildTimedPositions(timedSegments, controller.dayColumns, gridCellKey),
    [controller.dayColumns, gridCellKey, timedSegments]
  );

  const allDayPositionsByCell = useMemo(
    () => buildAllDayPositions(allDaySpans, gridData, gridCellKey, timeZone),
    [allDaySpans, gridCellKey, gridData, timeZone]
  );

  const unavailableCellKeys = useMemo(
    () =>
      buildUnavailableCellKeys(
        events,
        controller.dayColumns,
        gridCellKey,
        timeZone
      ),
    [controller.dayColumns, events, gridCellKey, timeZone]
  );

  const firstTimedCell = arrayAt(
    arrayAt(controller.dayColumns, 0)?.slots ?? [],
    0
  );

  const firstTimedCellKey = firstTimedCell
    ? gridCellKey(firstTimedCell)
    : undefined;

  const nowPosition = useMemo(
    () =>
      buildNowPosition(
        currentInstant,
        controller.viewerDates,
        controller.dayColumns,
        timeZone,
        gridCellKey
      ),
    [
      controller.dayColumns,
      controller.viewerDates,
      currentInstant,
      gridCellKey,
      timeZone,
    ]
  );

  const todayColumnIndex = controller.viewerDates.indexOf(todayDate);
  const paintCells = controller.paint?.cells ?? EMPTY_LIST;

  const selectedPaintKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const cell of paintCells) {
      keys.add(gridCellKey(cell));
    }

    return keys;
  }, [gridCellKey, paintCells]);

  const cellAtTarget = (
    target: EventTarget | null
  ): {
    readonly cell: CalendarCell;
    readonly meta: CellMeta;
    readonly element: HTMLElement;
  } | null => {
    if (!(target instanceof Element)) {
      return null;
    }

    const element = target.closest<HTMLElement>('[role="gridcell"]');

    if (!element) {
      return null;
    }

    const key = element.dataset.cellKey;

    if (key === undefined) {
      return null;
    }

    const cell = gridData.cellByKey.get(key);

    const meta = cell === undefined ? undefined : gridData.metaByCell.get(cell);

    if (cell === undefined || meta === undefined || meta.kind !== "timed") {
      return null;
    }

    return { cell, element, meta };
  };

  const handleGridActiveCellChange = (cell: CalendarCell): void => {
    const meta = gridData.metaByCell.get(cell);

    if (meta?.kind === "timed" && meta.slotIndex !== null) {
      const position: FocusedCell = {
        columnIndex: meta.columnIndex,
        rowIndex: meta.slotIndex,
      };
      controller.setFocusedCell(position);
      setLiveText(`${t("calendar.week.focus")}: ${meta.label}`);
    }
  };

  const handleEventSelect = (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ): void => {
    setDismissedDetailId(null);
    controller.selectEvent(eventId, context, anchor);
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    context: CalendarCellContext
  ): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
    if (event.defaultPrevented) {
      return;
    }

    const meta = gridData.metaByCell.get(context.cell);

    if (!meta || meta.kind !== "timed" || meta.slotIndex === null) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();

    if (controller.interactionMode === "quick-create") {
      controller.activateCell(
        meta.columnIndex,
        meta.slotIndex,
        event.currentTarget.getBoundingClientRect()
      );
    }
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-quick-create
    if (eventIdAtTarget(event.target) !== null) {
      return;
    }

    const target = cellAtTarget(event.target);

    if (
      !target ||
      controller.interactionMode !== "quick-create" ||
      target.meta.slotIndex === null
    ) {
      return;
    }

    controller.activateCell(
      target.meta.columnIndex,
      target.meta.slotIndex,
      new DOMRect(event.clientX, event.clientY, 0, 0)
    );
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-quick-create
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-paint
    if (eventIdAtTarget(event.target) !== null) {
      return;
    }

    const target = cellAtTarget(event.target);

    if (
      !target ||
      controller.interactionMode !== "paint-and-move" ||
      target.meta.slotIndex === null
    ) {
      return;
    }

    event.preventDefault();
    controller.beginPaint(target.meta.columnIndex, target.meta.slotIndex);
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-paint
  };

  const updatePaintFromTarget = (target: EventTarget | null): void => {
    if (eventIdAtTarget(target) !== null) {
      return;
    }

    const cellTarget = cellAtTarget(target);

    if (cellTarget === null || cellTarget.meta.slotIndex === null) {
      return;
    }

    controller.updatePaint(
      cellTarget.meta.columnIndex,
      cellTarget.meta.slotIndex
    );
  };

  const handlePointerUp = (): void => {
    controller.endPaint();
  };

  const handlePointerCancel = (): void => {
    controller.cancelPaint();
    controller.cancelMove();
  };

  const handlePointerLeave = (): void => {
    controller.cancelPaint();
    controller.cancelMove();
  };

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-move-request
    if (controller.interactionMode !== "paint-and-move") {
      return;
    }

    const eventId = eventIdAtTarget(event.target);
    const target = cellAtTarget(event.target);

    if (
      eventId === null ||
      eventId === "" ||
      !target ||
      target.meta.slotIndex === null
    ) {
      return;
    }

    draggedEventIdRef.current = eventId;
    controller.beginMove(eventId, target.cell);
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-move-request
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (draggedEventIdRef.current === null) {
      return;
    }

    event.preventDefault();
    const target = cellAtTarget(event.target);

    if (target) {
      controller.updateMove(target.cell);
    }
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-move-resolve
    if (draggedEventIdRef.current === null) {
      return;
    }

    event.preventDefault();
    const target = cellAtTarget(event.target);

    if (target) {
      controller.updateMove(target.cell);
      controller.endMove();
    } else {
      controller.cancelMove();
    }

    draggedEventIdRef.current = null;
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-move-resolve
  };

  const handleDragEnd = (): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-return-pass
    if (draggedEventIdRef.current !== null) {
      controller.cancelMove();
    }

    draggedEventIdRef.current = null;
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-return-pass
  };

  const { selectedEvent } = controller;
  const detailVisible =
    selectedEvent !== undefined && selectedEvent.id !== dismissedDetailId;

  const closeDetail = (): void => {
    if (!selectedEvent) {
      return;
    }

    setDismissedDetailId(selectedEvent.id);
    controller.clearSelection();
  };

  const rootClassName = clsx(
    styles.weekGrid,
    visibleDays === 7 && styles.sevenDays,
    visibleDays === 5 && styles.fiveDays,
    trailingGutter && styles.trailingGutter,
    className
  );

  const firstViewerDate = controller.viewerDates[0] ?? date;

  const firstViewerDateLabel = formatFullDateForDate(
    firstViewerDate,
    timeZone,
    locale
  );

  const defaultLiveText = `${t("calendar.week.range")} ${firstViewerDateLabel}`;

  const liveRegionText = liveText || defaultLiveText;

  const getCellLabel = (
    cell: CalendarCell,
    context: CalendarCellContext
  ): string => gridData.metaByCell.get(cell)?.label ?? context.key;

  const isCellNavigable = (cell: CalendarCell): boolean =>
    gridData.metaByCell.get(cell)?.kind === "timed";

  const columnCount = controller.viewerDates.length;

  // A week without today spans the whole row instead of highlighting one column.
  const nowSegmentStyle: WeekGridNowLineStyle =
    todayColumnIndex === -1
      ? {}
      : {
          "--cal-now-segment-inline-size": `${100 / columnCount}%`,
          "--cal-now-segment-inline-start": `${(todayColumnIndex / columnCount) * 100}%`,
        };

  const nowLineStyle: WeekGridNowLineStyle | undefined =
    nowPosition === null
      ? undefined
      : {
          ...nowSegmentStyle,
          insetBlockStart: `${nowPosition.offset}px`,
        };

  return {
    allDayPositionsByCell,
    closeDetail,
    controller,
    currentInstant,
    detailVisible,
    firstTimedCellKey,
    frameRef,
    getCellLabel,
    gridCellKey,
    gridData,
    handleCellKeyDown,
    handleClick,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    handleDrop,
    handleEventSelect,
    handleGridActiveCellChange,
    handlePointerCancel,
    handlePointerDown,
    handlePointerLeave,
    handlePointerUp,
    headerColumns,
    isCellNavigable,
    liveRegionText,
    locale,
    nowLineStyle,
    nowPosition,
    renderCell,
    renderConflict,
    renderEvent,
    renderUnavailable,
    rootClassName,
    scrollRef,
    selectedEvent,
    selectedPaintKeys,
    t,
    timeZone,
    timedPositionsByCell,
    trailingGutter,
    unavailableCellKeys,
    updatePaintFromTarget,
  };
};
// @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
