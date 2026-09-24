"use client";
// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-slots:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-keyboard:p1

import { clsx } from "clsx";
import { useRef } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from "react";

import { formatGridTime } from "../../core/format";
import { EVENT_CHIP_HEIGHT } from "../../core/grid";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarDate,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
  CalendarGridRow,
  CalendarMoveRequest,
  CalendarSelectionRange,
  CalendarSlotMinutes,
  CalendarTimeWindow,
  UtcInstant,
  WeekGridInteractionMode,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import type {
  CalendarConflictRenderer,
  CalendarDetailRenderer,
  CalendarEventRenderer,
  CalendarQuickCreatePayload,
} from "../../react/slots";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import { EventCard } from "../event-card/event-card";
import { buildEventPresentation } from "../event-card/event-presentation";
import type { CalendarGridProps } from "../grid/calendar-grid";
import { baseCellContext, navigateGrid } from "../grid/grid-navigation";
import type { GridCellRecord } from "../grid/grid-navigation";
import { useGridCells } from "../grid/use-grid-cells";
import { Button } from "../primitives/button/button";
import { ScrollRegion } from "../primitives/scroll-region/scroll-region";
import { EMPTY_LIST, useWeekGridContent } from "./use-week-grid-content";
import type {
  WeekGridContentProps,
  WeekGridHeaderColumn,
  WeekGridNowLineStyle,
} from "./use-week-grid-content";
import type {
  AllDayPosition,
  CellMeta,
  NowPosition,
  PositionedEvent,
} from "./week-grid-layout";

import gridStyles from "../grid/calendar-grid.module.css";
import styles from "./week-grid.module.css";

export interface WeekGridProps<Payload = unknown> extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Any day in the week to show. The week starts on Monday. */
  readonly date: CalendarDate;
  /** Events to lay out. Only the ones overlapping the visible week are drawn. */
  readonly events: readonly CalendarEvent<Payload>[];
  /** Reference instant for the now line and past styling. Default: the wall clock, per minute. */
  readonly now?: UtcInstant;
  /** `5` shows Monday–Friday, `7` the whole week. Default `5`. */
  readonly visibleDays?: 5 | 7;
  /** Visible hours, e.g. `{ start: "06:00", end: "23:00" }`, on slot boundaries. Default: all. */
  readonly visibleHours?: CalendarTimeWindow;
  /** Length of one row. Default `60`. */
  readonly slotMinutes?: CalendarSlotMinutes;
  /** Shaded business hours; also where the grid first scrolls to. Default 08:00–18:00. */
  readonly workingHours?: CalendarTimeWindow;
  /** Repeat the hour labels on the trailing edge. The copy is hidden from assistive technology. */
  readonly trailingGutter?: boolean;
  /** Class added to every day cell. */
  readonly cellClassName?: string;
  /** Class added to every day header. */
  readonly columnHeaderClassName?: string;
  /** Class on every gutter label: hours, all-day, zone and the trailing copy. */
  readonly gutterClassName?: string;
  /** Controlled interaction mode. Default `quick-create`. */
  readonly interactionMode?: WeekGridInteractionMode;
  /** Initial interaction mode when uncontrolled. */
  readonly defaultInteractionMode?: WeekGridInteractionMode;
  /** Called when the grid asks to change mode. */
  readonly onInteractionModeChange?: (mode: WeekGridInteractionMode) => void;
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the default `EventCard` for timed and all-day events. */
  readonly renderEvent?: CalendarEventRenderer<Payload>;
  /** Replaces how each conflict renders inside the default card. */
  readonly renderConflict?: CalendarConflictRenderer;
  /** Renders an inline detail for the selected event. Receives `close`. */
  readonly renderDetail?: CalendarDetailRenderer<Payload>;
  /** Replaces the content of each empty time cell. */
  readonly renderCell?: CalendarGridProps["renderCell"];
  /** Drawn in cells covered by an unavailable or busy timed event. */
  readonly renderUnavailable?: (cell: CalendarCell) => ReactNode;
  /** An available event was activated; `anchor` is the card, for a detail popover. */
  readonly onEventSelect?: (
    event: CalendarEvent<Payload>,
    context: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  /** An empty slot was activated in `quick-create` mode. */
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
  /** A range was painted in `paint-and-move` mode. */
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
  /** An event was dropped on a new slot in `paint-and-move` mode. Call `confirm` or `cancel`. */
  readonly onMoveRequest?: (request: CalendarMoveRequest) => void;
}

interface WeekGridInteractionLayerProps {
  readonly currentInstant: UtcInstant;
  readonly nowLineStyle?: WeekGridNowLineStyle;
  readonly nowPosition: NowPosition | null;
  readonly onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  readonly onDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDragStart: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerEnter: (target: EventTarget | null) => void;
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (target: EventTarget | null) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly ref?: Ref<HTMLDivElement>;
  readonly timedRows: readonly ReactNode[];
}

const WeekGridInteractionLayer = ({
  currentInstant,
  nowLineStyle,
  nowPosition,
  onClick,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  ref,
  timedRows,
}: WeekGridInteractionLayerProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const nowTime = formatGridTime(currentInstant, timeZone, locale);

  return (
    <ScrollRegion
      ref={ref}
      className={styles.interactionSurface}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        onPointerMove(event.target);
      }}
      onPointerEnter={(event) => {
        onPointerEnter(event.target);
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {timedRows}
      {nowPosition !== null && (
        <div
          className={styles.nowLine}
          role="status"
          aria-label={`${t("calendar.week.currentTime")}: ${nowTime}`}
          style={nowLineStyle}
        >
          <span className={styles.nowLabel}>{nowTime}</span>
        </div>
      )}
    </ScrollRegion>
  );
};

interface WeekGridLiveRegionProps {
  readonly text: string;
}

const WeekGridLiveRegion = ({ text }: WeekGridLiveRegionProps) => (
  <div
    className={styles.liveRegion}
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {text}
  </div>
);

interface WeekGridDetailProps<Payload> {
  readonly event: CalendarEvent<Payload> | undefined;
  readonly onClose: () => void;
  readonly renderDetail?: CalendarDetailRenderer<Payload>;
}

const WeekGridDetail = <Payload,>({
  event,
  onClose,
  renderDetail,
}: WeekGridDetailProps<Payload>) =>
  event === undefined || renderDetail === undefined ? null : (
    <div className={styles.detailSlot}>
      {renderDetail({ close: onClose, event })}
    </div>
  );

interface WeekGridHeaderProps {
  readonly columns: readonly WeekGridHeaderColumn[];
  readonly trailing: ReactNode;
  readonly columnHeaderClassName?: string;
  readonly gutterClassName?: string;
}

const WeekGridHeader = ({
  columns,
  columnHeaderClassName,
  gutterClassName,
  trailing,
}: WeekGridHeaderProps) => {
  const { timeZone } = useCalendarContext();
  const headerCells = columns.map(
    ({ column, dayNumber, isToday, weekday }, columnIndex) => (
      <div
        className={clsx(
          gridStyles.headerCell,
          column.key === "time" ? gutterClassName : columnHeaderClassName
        )}
        key={column.key}
        role="columnheader"
        aria-colindex={columnIndex + 1}
      >
        {column.key === "time" && (
          <span className={styles.headerGutter} title={timeZone}>
            {column.label}
          </span>
        )}
        {column.key !== "time" &&
          weekday !== undefined &&
          dayNumber !== undefined && (
            <>
              <span className={clsx(styles.weekday, isToday && styles.today)}>
                {weekday}
              </span>
              <span className={clsx(styles.dayNumber, isToday && styles.today)}>
                {dayNumber}
              </span>
            </>
          )}
        {column.key !== "time" &&
          (weekday === undefined || dayNumber === undefined) &&
          column.label}
      </div>
    )
  );

  return (
    <div className={gridStyles.row} role="row" aria-rowindex={1}>
      {headerCells}
      {trailing}
    </div>
  );
};

interface WeekCalendarGridProps extends CalendarGridProps {
  readonly headerColumns: readonly WeekGridHeaderColumn[];
  readonly onFrameRef?: Ref<HTMLDivElement>;
  readonly renderTimedRows: (rows: readonly ReactNode[]) => ReactNode;
  readonly renderTrailingCell?: (row: CalendarGridRow) => ReactNode;
  readonly columnHeaderClassName?: string;
  readonly gutterClassName?: string;
}

const WeekCalendarGrid = (props: WeekCalendarGridProps) => {
  const { direction, t } = useCalendarLocalization();

  const {
    columns,
    headerColumns,
    rows,
    getCellKey,
    getCellLabel,
    activeCellKey,
    defaultActiveCellKey,
    onActiveCellChange,
    isCellNavigable,
    onCellKeyDown,
    renderCell,
    renderTimedRows,
    renderTrailingCell,
    onFrameRef,
    className,
    columnHeaderClassName,
    gutterClassName,
  } = props;

  const {
    currentActiveCellKey,
    labelsByCell,
    recordsByKey,
    setUncontrolledActiveCellKey,
  } = useGridCells({
    activeCellKey,
    defaultActiveCellKey,
    getCellKey,
    getCellLabel,
    rows,
  });

  const cellElementsRef = useRef(new Map<string, HTMLDivElement>());

  const focusCell = (key: string): void => {
    cellElementsRef.current.get(key)?.focus();
  };

  const setActiveCell = (record: GridCellRecord): void => {
    if (activeCellKey === undefined) {
      setUncontrolledActiveCellKey(record.key);
    }

    onActiveCellChange?.(record.cell);
    focusCell(record.key);
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    record: GridCellRecord,
    context: CalendarCellContext
  ): void => {
    onCellKeyDown?.(event, context);

    if (event.defaultPrevented) {
      return;
    }

    const navigation = navigateGrid({
      direction,
      getCellKey,
      isCellNavigable,
      key: event.key,
      record,
      recordsByKey,
      rows,
    });

    if (!navigation.handled) {
      return;
    }

    event.preventDefault();

    if (navigation.destination !== undefined) {
      setActiveCell(navigation.destination);
    }
  };

  const renderedRows = rows.map((row, rowIndex) => (
    <div
      className={gridStyles.row}
      key={row.key}
      role="row"
      aria-rowindex={rowIndex + 2}
    >
      {row.cells.map((cell) => {
        const key = getCellKey(cell);
        const record = recordsByKey.get(key);

        if (!record) {
          return null;
        }

        const isFocused = currentActiveCellKey === key;

        const provisionalContext = baseCellContext(cell, key, isFocused);

        const label =
          labelsByCell.get(cell) ?? getCellLabel(cell, provisionalContext);

        const context: CalendarCellContext = { ...provisionalContext, label };

        const handleFocus = (): void => {
          if (activeCellKey === undefined) {
            setUncontrolledActiveCellKey(key);
          }
        };

        const handleKeyDown = (
          event: ReactKeyboardEvent<HTMLDivElement>
        ): void => {
          handleCellKeyDown(event, record, context);
        };

        return (
          <div
            className={gridStyles.cell}
            key={key}
            ref={(element) => {
              if (element) {
                cellElementsRef.current.set(key, element);
              } else {
                cellElementsRef.current.delete(key);
              }
            }}
            role="gridcell"
            data-cell-key={key}
            aria-colindex={record.columnIndex + 1}
            aria-rowindex={rowIndex + 2}
            aria-label={label}
            tabIndex={isFocused ? 0 : -1}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
          >
            {renderCell(context)}
          </div>
        );
      })}
      {renderTrailingCell?.(row)}
    </div>
  ));

  return (
    <div
      ref={onFrameRef}
      className={clsx(gridStyles.root, className)}
      role="grid"
      aria-label={t("calendar.grid.label")}
      aria-colcount={columns.length}
      aria-rowcount={rows.length + 1}
      dir={direction}
    >
      {columns.length > 0 ? (
        <WeekGridHeader
          columns={headerColumns}
          columnHeaderClassName={columnHeaderClassName}
          gutterClassName={gutterClassName}
          trailing={
            renderTrailingCell === undefined ? null : (
              <div
                className={clsx(
                  gridStyles.headerCell,
                  styles.trailingGutterCell,
                  gutterClassName
                )}
                aria-hidden="true"
              />
            )
          }
        />
      ) : null}
      {renderedRows[0]}
      {renderTimedRows(renderedRows.slice(1))}
    </div>
  );
};

interface EventFrameProps {
  readonly eventId: string;
  readonly className: string;
  readonly insetBlockStart?: string;
  readonly inlineSize?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
  readonly draggable?: boolean;
}

const EventFrame = ({
  eventId,
  className,
  insetBlockStart,
  inlineSize,
  style,
  children,
  draggable = false,
}: EventFrameProps) => (
  <div
    className={className}
    data-event-id={eventId}
    style={{ ...style, inlineSize, insetBlockStart }}
    draggable={draggable}
  >
    {children}
  </div>
);

interface WeekGridEventProps<Payload> {
  readonly currentInstant: UtcInstant;
  readonly event: CalendarEvent<Payload>;
  readonly geometry: CalendarEventGeometry;
  readonly onSelect: (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  readonly readOnly: boolean;
  readonly renderConflict?: CalendarConflictRenderer;
  readonly renderEvent?: CalendarEventRenderer<Payload>;
  readonly selectedEventId: string | null;
  readonly segment: CalendarEventSegment;
}

const WeekGridEvent = <Payload,>(props: WeekGridEventProps<Payload>) => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const {
    currentInstant,
    event,
    geometry,
    onSelect,
    readOnly,
    renderConflict,
    renderEvent,
    selectedEventId,
    segment,
  } = props;

  const presentation = buildEventPresentation({
    currentInstant,
    event,
    geometry,
    locale,
    readOnly,
    segment,
    selected: selectedEventId === event.id,
    timeZone,
    translate: t,
  });
  const { context, description, conflicts, isAvailable, isPast } = presentation;

  const handleSelect = (anchor?: HTMLElement): void => {
    onSelect(event.id, context, anchor);
  };

  if (renderEvent !== undefined) {
    const handleKeyDown = (
      keyboardEvent: ReactKeyboardEvent<HTMLButtonElement>
    ): void => {
      if (
        keyboardEvent.repeat ||
        (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ")
      ) {
        return;
      }

      keyboardEvent.preventDefault();

      if (isAvailable) {
        handleSelect(keyboardEvent.currentTarget);
      }
    };

    return (
      <Button
        variant="ghost"
        className={clsx(
          styles.customEvent,
          !isAvailable && styles.unavailable,
          context.isSelected && styles.selectedRing
        )}
        data-event-id={event.id}
        aria-label={event.title}
        aria-disabled={isAvailable ? undefined : "true"}
        aria-pressed={context.isSelected ? "true" : "false"}
        aria-description={description}
        draggable={isAvailable && !readOnly}
        disabled={!isAvailable}
        focusableWhenDisabled
        onClick={(clickEvent) => {
          handleSelect(clickEvent.currentTarget);
        }}
        onKeyDown={handleKeyDown}
      >
        {renderEvent(context)}
        {conflicts.length > 0 && (
          <ConflictIndicator
            conflicts={conflicts}
            className={styles.customConflicts}
            renderConflict={
              renderConflict === undefined
                ? undefined
                : (conflict): ReactNode => renderConflict(conflict, context)
            }
          />
        )}
      </Button>
    );
  }

  const renderTime = (
    eventContext: CalendarEventRenderContext<Payload>
  ): ReactNode => {
    if (eventContext.event.allDay) {
      return t("calendar.eventCard.allDay");
    }

    const start = formatGridTime(eventContext.segment.start, timeZone, locale);
    const end = formatGridTime(eventContext.segment.end, timeZone, locale);

    return `${start} – ${end}`;
  };

  return (
    <EventCard
      event={event}
      geometry={geometry}
      positioned={false}
      segment={segment}
      selected={context.isSelected}
      available={isAvailable}
      past={isPast}
      readOnly={readOnly}
      renderConflict={renderConflict}
      renderTime={renderTime}
      onSelect={(_event, _context, anchor) => {
        handleSelect(anchor);
      }}
    />
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

interface WeekGridCellContentProps<Payload> {
  readonly allDayPositions: readonly AllDayPosition<Payload>[];
  readonly cellClassName?: string;
  readonly gutterClassName?: string;
  readonly context: CalendarCellContext;
  readonly currentInstant: UtcInstant;
  readonly gridCellKey: string;
  readonly meta: CellMeta | undefined;
  readonly onSelect: (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  readonly readOnly: boolean;
  readonly renderCell?: CalendarGridProps["renderCell"];
  readonly renderConflict?: CalendarConflictRenderer;
  readonly renderEvent?: CalendarEventRenderer<Payload>;
  readonly renderUnavailable?: (cell: CalendarCell) => ReactNode;
  readonly selectedEventId: string | null;
  readonly selectedPaintKeys: ReadonlySet<string>;
  readonly timedPositions: readonly PositionedEvent<Payload>[];
  readonly unavailableCellKeys: ReadonlySet<string>;
}

const visibleGutterLabel = (meta: CellMeta): string | null =>
  meta.slotIndex === null || meta.cell.startTime.endsWith(":00")
    ? meta.label
    : null;

const WeekGridCellContent = <Payload,>(
  props: WeekGridCellContentProps<Payload>
) => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots

  const {
    allDayPositions,
    cellClassName,
    context,
    currentInstant,
    gridCellKey,
    gutterClassName,
    meta,
    onSelect,
    readOnly,
    renderCell,
    renderConflict,
    renderEvent,
    renderUnavailable,
    selectedEventId,
    selectedPaintKeys,
    timedPositions,
    unavailableCellKeys,
  } = props;

  if (meta === undefined) {
    return null;
  }

  if (meta.kind === "gutter") {
    return (
      <span className={clsx(styles.gutter, gutterClassName)}>
        {visibleGutterLabel(meta)}
      </span>
    );
  }

  const unavailable = unavailableCellKeys.has(gridCellKey);

  const cellContext: CalendarCellContext = {
    ...context,
    isReadOnly: readOnly,
    isSelected: selectedPaintKeys.has(gridCellKey),
    isUnavailable: unavailable,
  };

  return (
    <>
      <div
        className={clsx(
          styles.cellContent,
          unavailable && styles.unavailable,
          cellClassName
        )}
      >
        {renderCell?.(cellContext)}
        {unavailable && renderUnavailable?.(context.cell)}
      </div>
      {allDayPositions.map((position) => (
        <EventFrame
          key={`${position.event.id}:${position.startColumn}:${position.endColumn}`}
          eventId={position.event.id}
          className={clsx(styles.eventFrame, styles.allDayFrame)}
          draggable={!readOnly && !unavailable}
          insetBlockStart={`${position.lane * (EVENT_CHIP_HEIGHT + 2)}px`}
          inlineSize={`${position.endColumn - position.startColumn}00%`}
        >
          <WeekGridEvent<Payload>
            currentInstant={currentInstant}
            event={position.event}
            geometry={position.geometry}
            onSelect={onSelect}
            readOnly={readOnly}
            renderConflict={renderConflict}
            renderEvent={renderEvent}
            selectedEventId={selectedEventId}
            segment={position.segment}
          />
        </EventFrame>
      ))}
      {timedPositions.map((position) => (
        <EventFrame
          key={position.segment.event.id + position.segment.date}
          eventId={position.event.id}
          className={clsx(styles.eventFrame, styles.timedFrame)}
          draggable={!readOnly && !unavailable}
          style={{
            blockSize: `${position.height}px`,
            insetInlineStart: `${position.geometry.insetInlineStart}%`,
            zIndex: position.geometry.zIndex,
          }}
          insetBlockStart={`${position.top}px`}
          inlineSize={`${position.geometry.inlineSize}%`}
        >
          <WeekGridEvent<Payload>
            currentInstant={currentInstant}
            event={position.event}
            geometry={position.geometry}
            onSelect={onSelect}
            readOnly={readOnly}
            renderConflict={renderConflict}
            renderEvent={renderEvent}
            selectedEventId={selectedEventId}
            segment={position.segment}
          />
        </EventFrame>
      ))}
    </>
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

// @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
const WeekGridContent = <Payload = unknown,>(
  props: WeekGridContentProps<Payload>
) => {
  const {
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
    timedPositionsByCell,
    trailingGutter,
    unavailableCellKeys,
    updatePaintFromTarget,
  } = useWeekGridContent(props);

  const {
    cellClassName,
    columnHeaderClassName,
    gutterClassName,
    renderDetail,
  } = props;

  const renderTrailingCell = (row: CalendarGridRow): ReactNode => {
    const [gutterCell] = row.cells;

    const meta =
      gutterCell === undefined
        ? undefined
        : gridData.metaByCell.get(gutterCell);

    return (
      <div
        className={clsx(gridStyles.cell, styles.trailingGutterCell)}
        aria-hidden="true"
      >
        {meta === undefined ? null : (
          <span className={clsx(styles.gutter, gutterClassName)}>
            {visibleGutterLabel(meta)}
          </span>
        )}
      </div>
    );
  };

  const renderWeekCell = (context: CalendarCellContext) => (
    <WeekGridCellContent
      allDayPositions={
        allDayPositionsByCell.get(gridCellKey(context.cell)) ?? EMPTY_LIST
      }
      cellClassName={cellClassName}
      gutterClassName={gutterClassName}
      context={context}
      currentInstant={currentInstant}
      gridCellKey={gridCellKey(context.cell)}
      meta={gridData.metaByCell.get(context.cell)}
      onSelect={handleEventSelect}
      readOnly={controller.interactionMode === "read-only"}
      renderCell={renderCell}
      renderConflict={renderConflict}
      renderEvent={renderEvent}
      renderUnavailable={renderUnavailable}
      selectedEventId={controller.selectedEventId}
      selectedPaintKeys={selectedPaintKeys}
      timedPositions={
        timedPositionsByCell.get(gridCellKey(context.cell)) ?? EMPTY_LIST
      }
      unavailableCellKeys={unavailableCellKeys}
    />
  );

  const renderTimedRows = (timedRows: readonly ReactNode[]) => (
    <WeekGridInteractionLayer
      currentInstant={currentInstant}
      nowLineStyle={nowLineStyle}
      nowPosition={nowPosition}
      onClick={handleClick}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerEnter={updatePaintFromTarget}
      onPointerLeave={handlePointerLeave}
      onPointerMove={updatePaintFromTarget}
      onPointerUp={handlePointerUp}
      ref={scrollRef}
      timedRows={timedRows}
    />
  );

  return (
    <div className={styles.container}>
      <WeekCalendarGrid
        columns={gridData.columns}
        headerColumns={headerColumns}
        rows={gridData.rows}
        className={rootClassName}
        onFrameRef={frameRef}
        defaultActiveCellKey={firstTimedCellKey}
        getCellKey={gridCellKey}
        getCellLabel={getCellLabel}
        onActiveCellChange={handleGridActiveCellChange}
        isCellNavigable={isCellNavigable}
        onCellKeyDown={handleCellKeyDown}
        renderCell={renderWeekCell}
        renderTimedRows={renderTimedRows}
        renderTrailingCell={trailingGutter ? renderTrailingCell : undefined}
        columnHeaderClassName={columnHeaderClassName}
        gutterClassName={gutterClassName}
      />
      <WeekGridLiveRegion text={liveRegionText} />
      <WeekGridDetail
        event={detailVisible ? selectedEvent : undefined}
        onClose={closeDetail}
        renderDetail={renderDetail}
      />
    </div>
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
};

export const WeekGrid = <Payload = unknown,>(props: WeekGridProps<Payload>) => (
  <CalendarScope {...props}>
    <WeekGridContent<Payload> {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

WeekGrid.displayName = "WeekGrid";
