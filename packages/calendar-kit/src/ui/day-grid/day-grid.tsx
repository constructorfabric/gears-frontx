"use client";

import { clsx } from "clsx";
import { memo, useCallback, useMemo, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

import { isEventActionable } from "../../core/actionability";
import { arrayAt } from "../../core/array";
import { rangesOverlap } from "../../core/event-overlap";
import {
  formatGridTime,
  formatViewerDate,
  formatViewerDayNumber,
  formatViewerTimeZoneOffset,
  formatViewerWeekdayShort,
} from "../../core/format";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarSlotMinutes,
  CalendarTimeWindow,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarDate,
  CalendarEventSegment,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import { compareUtcInstants, toViewerDateTime } from "../../core/temporal";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useDayGridController } from "../../react/controllers/use-day-grid-controller";
import type {
  CalendarConflictRenderer,
  CalendarEventRenderer,
  CalendarQuickCreatePayload,
} from "../../react/slots";
import { EventCard } from "../event-card/event-card";
import { CalendarGrid } from "../grid/calendar-grid";
import type { CalendarGridProps } from "../grid/calendar-grid";
import { buildEventAnnouncement } from "./day-grid-format";

import styles from "./day-grid.module.css";

export interface DayGridProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** The day to show. */
  readonly date: CalendarDate;
  /** Events to lay out. Only the ones overlapping `date` are drawn. */
  readonly events: readonly CalendarEvent[];
  /** Visible part of the day, on slot boundaries. Default: the whole day. */
  readonly visibleHours?: CalendarTimeWindow;
  /** Length of one row. Default `60`. */
  readonly slotMinutes?: CalendarSlotMinutes;
  /** Shaded business hours; also where the grid first scrolls to. Default 08:00–18:00. */
  readonly workingHours?: CalendarTimeWindow;
  /** Repeat the hour labels on the trailing edge, hidden from assistive technology. */
  readonly trailingGutter?: boolean;
  /** Class added to every time cell. */
  readonly cellClassName?: string;
  /** Class added to the day header. */
  readonly columnHeaderClassName?: string;
  /** Class added to every gutter label. */
  readonly gutterClassName?: string;
  /** Controlled mode. `read-only` disables quick-create. Default `quick-create`. */
  readonly interactionMode?: "quick-create" | "read-only";
  /** Initial mode when uncontrolled. */
  readonly defaultInteractionMode?: "quick-create" | "read-only";
  /** Called when the grid asks to change mode. */
  readonly onInteractionModeChange?: (
    mode: "quick-create" | "read-only"
  ) => void;
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the default `EventCard`. */
  readonly renderEvent?: CalendarEventRenderer;
  /** Replaces how each conflict renders inside the default card. */
  readonly renderConflict?: CalendarConflictRenderer;
  /** Replaces the content of each empty time cell. */
  readonly renderCell?: CalendarGridProps["renderCell"];
  /** An available event was activated. `anchor` is the card element. */
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
  /** An empty slot was activated in `quick-create` mode. */
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
}

interface DayGridStyles extends CSSProperties {
  readonly "--day-grid-slot-count"?: number;
}

const DEFAULT_MODE = "quick-create" as const;

type DayGridContentProps = Omit<DayGridProps, keyof CalendarContextProps>;

type DayGridControllerResult = ReturnType<typeof useDayGridController>;

type DayGridTimedEvent = DayGridControllerResult["timedEvents"][number];

type DayGridEventSelectHandler = (
  event: CalendarEvent,
  context: CalendarEventRenderContext,
  anchor: HTMLElement
) => void;

interface DayGridEventConfig {
  readonly locale: string;
  readonly handleSelect: DayGridEventSelectHandler;
  readonly readOnly: boolean;
  readonly renderConflict?: CalendarConflictRenderer;
  readonly renderEvent?: CalendarEventRenderer;
  readonly renderTime?: (context: CalendarEventRenderContext) => ReactNode;
  readonly t: CalendarTranslate;
  readonly timeZone: IanaTimeZone;
}

const createSlotCell = (
  slotStarts: readonly UtcInstant[],
  index: number,
  date: CalendarCell["date"],
  timeZone: IanaTimeZone,
  dayEnd: UtcInstant
): CalendarCell => {
  const start = arrayAt(slotStarts, index);
  const end = arrayAt(slotStarts, index + 1) ?? dayEnd;

  if (start === undefined) {
    throw new Error(`Missing slot cell at index ${index}`);
  }

  return {
    date,
    end,
    endTime: toViewerDateTime(end, timeZone).time,
    start,
    startTime: toViewerDateTime(start, timeZone).time,
  };
};

const isHourStart = (instant: UtcInstant, timeZone: IanaTimeZone): boolean =>
  toViewerDateTime(instant, timeZone).time.endsWith(":00");

const cellKey = (cell: CalendarCell): string => `${cell.date}:${cell.start}`;

const buildCellLabel = (
  cell: CalendarCell,
  workingHour: boolean,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate
): string =>
  `${formatGridTime(cell.start, timeZone, locale)} ${t(workingHour ? "calendar.day.workingHour" : "calendar.day.nonWorkingHour")}`;

const buildEventTime = (
  context: CalendarEventRenderContext,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate
): string => {
  if (context.event.allDay) {
    return t("calendar.eventCard.allDay");
  }
  return `${formatGridTime(context.segment.start, timeZone, locale)} – ${formatGridTime(context.segment.end, timeZone, locale)}`;
};

const buildUnavailableCellKeys = (
  cells: readonly CalendarCell[],
  placements: readonly DayGridTimedEvent[]
): ReadonlySet<string> => {
  const unavailable = new Set<string>();

  for (const placement of placements) {
    if (isEventActionable(placement.segment.event)) {
      continue;
    }

    const placementRange = {
      end: placement.segment.end,
      start: placement.segment.start,
    };

    for (const cell of cells) {
      if (rangesOverlap(placementRange, { end: cell.end, start: cell.start })) {
        unavailable.add(cellKey(cell));
      }
    }
  }

  return unavailable;
};

const DAY_GRID_SLOT_HEIGHT = 43;

const dayEventGeometry = (
  geometry: {
    readonly left: number;
    readonly width: number;
    readonly zIndex: number;
  },
  topPercent: number,
  heightPercent: number,
  slotCount: number
): CalendarEventGeometry => {
  const dayBlockSize = slotCount * DAY_GRID_SLOT_HEIGHT;

  return {
    height: Math.round((heightPercent / 100) * dayBlockSize),
    inlineSize: geometry.width,
    insetInlineStart: geometry.left,
    top: Math.round((topPercent / 100) * dayBlockSize),
    zIndex: geometry.zIndex,
  };
};

const timedEventStyle = (
  geometry: {
    readonly left: number;
    readonly width: number;
    readonly zIndex: number;
  },
  topPercent: number,
  heightPercent: number
): CSSProperties => ({
  blockSize: `${heightPercent}%`,
  inlineSize: `calc(${geometry.width}% - var(--calendar-event-inset))`,
  insetBlockStart: `${topPercent}%`,
  insetInlineStart: `${geometry.left}%`,
  zIndex: geometry.zIndex,
});

const buildSharedRenderTime = (
  config: DayGridEventConfig
): ((context: CalendarEventRenderContext) => ReactNode) =>
  config.renderEvent === undefined
    ? (context) => (
        <span className={clsx(styles.eventTime, "eventTime")}>
          {buildEventTime(context, config.timeZone, config.locale, config.t)}
        </span>
      )
    : () => null;

const renderDayGridEventCard = ({
  config,
  event,
  geometry,
  past,
  positioned,
  segment,
  selected,
}: {
  readonly config: DayGridEventConfig;
  readonly event: CalendarEvent;
  readonly geometry?: CalendarEventGeometry;
  readonly past: boolean;
  readonly positioned?: boolean;
  readonly segment: CalendarEventSegment;
  readonly selected: boolean;
}) => (
  <EventCard
    available={isEventActionable(event)}
    className={styles.dayEvent}
    event={event}
    geometry={geometry}
    onSelect={config.handleSelect}
    past={past}
    positioned={positioned}
    readOnly={config.readOnly}
    renderConflict={config.renderConflict}
    renderTime={config.renderTime}
    renderTitle={config.renderEvent}
    segment={segment}
    selected={selected}
  />
);

const DayGridEventLayerImpl = ({
  config,
  currentInstant,
  currentTimeLabel,
  slotCount,
  nowPercent,
  onEventFocus,
  selectedEventId,
  timedEvents,
}: {
  readonly config: DayGridEventConfig;
  readonly currentInstant: UtcInstant;
  readonly currentTimeLabel: string;
  readonly slotCount: number;
  readonly nowPercent: number | null;
  readonly onEventFocus: (segment: CalendarEventSegment) => void;
  readonly selectedEventId: string | null;
  readonly timedEvents: readonly DayGridTimedEvent[];
}) => (
  <div className={clsx(styles.eventLayer, "eventLayer")}>
    {timedEvents.map((placement) => (
      <div
        className={clsx(styles.event, styles.timedEvent, "timedEvent")}
        key={`${placement.segment.event.id}-${placement.segment.start}`}
        onFocusCapture={() => {
          onEventFocus(placement.segment);
        }}
        style={timedEventStyle(
          placement.geometry,
          placement.topPercent,
          placement.heightPercent
        )}
      >
        {renderDayGridEventCard({
          config,
          event: placement.segment.event,
          geometry: dayEventGeometry(
            placement.geometry,
            placement.topPercent,
            placement.heightPercent,
            slotCount
          ),
          past: compareUtcInstants(placement.segment.end, currentInstant) <= 0,
          positioned: false,
          segment: placement.segment,
          selected: selectedEventId === placement.segment.event.id,
        })}
      </div>
    ))}
    {nowPercent !== null && (
      <div
        className={styles.nowLine}
        role="status"
        aria-label={`${config.t("calendar.day.currentTime")}: ${currentTimeLabel}`}
        style={{ insetBlockStart: `${nowPercent}%` }}
      >
        <span className={styles.nowLabel}>{currentTimeLabel}</span>
      </div>
    )}
  </div>
);

const DayGridEventLayer = memo(DayGridEventLayerImpl);
DayGridEventLayer.displayName = "DayGridEventLayer";

const useDayGridAnnouncements = (
  setControllerAnnouncement: (announcement: string) => void
): {
  readonly announce: (announcement: string) => void;
  readonly liveText: string;
} => {
  const [liveText, setLiveText] = useState("");

  const announce = useCallback(
    (announcement: string): void => {
      setControllerAnnouncement(announcement);
      setLiveText(announcement);
    },
    [setControllerAnnouncement]
  );

  return { announce, liveText };
};

const useDayGridContent = (props: DayGridContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const {
    date,
    events,
    interactionMode,
    defaultInteractionMode = DEFAULT_MODE,
    onInteractionModeChange,
    selectedEventId,
    defaultSelectedEventId,
    onSelectedEventIdChange,
    renderEvent,
    renderConflict,
    renderCell,
    onEventSelect,
    onQuickCreate,
    slotMinutes,
    visibleHours,
    workingHours,
  } = props;

  const resolvedDirection = direction === "rtl" ? "rtl" : "ltr";

  const {
    allDaySegments,
    axisRange,
    currentInstant,
    slotStarts,
    interactionMode: resolvedInteractionMode,
    isToday,
    isWorkingDay,
    nowPercent,
    selectedEventId: resolvedSelectedEventId,
    selectEmptyCell,
    selectEvent,
    setAnnouncement,
    setBodyRef,
    timedEvents,
    utcDayRange,
    workingSlots,
  } = useDayGridController({
    date,
    defaultInteractionMode,
    defaultSelectedEventId,
    events,
    interactionMode,
    onEventSelect,
    onInteractionModeChange,
    onQuickCreate,
    onSelectedEventIdChange,
    selectedEventId,
    slotMinutes,
    timeZone,
    visibleHours,
    workingHours,
  });

  const { announce, liveText } = useDayGridAnnouncements(setAnnouncement);

  const displayedDateLabel = formatViewerDate(
    utcDayRange.start,
    timeZone,
    locale,
    { dateStyle: "full" }
  );

  const gridCells = useMemo(
    () =>
      slotStarts.map((_, index) =>
        createSlotCell(slotStarts, index, date, timeZone, axisRange.end)
      ),
    [axisRange.end, date, slotStarts, timeZone]
  );

  const cellIndexByKey = useMemo(
    () => new Map(gridCells.map((cell, index) => [cellKey(cell), index])),
    [gridCells]
  );

  const gridRows = useMemo(
    () =>
      gridCells.map((cell, index) => ({ cells: [cell], key: `hour-${index}` })),
    [gridCells]
  );

  const unavailableCellKeys = useMemo(
    () => buildUnavailableCellKeys(gridCells, timedEvents),
    [gridCells, timedEvents]
  );

  const currentTimeLabel = formatGridTime(currentInstant, timeZone, locale);
  const defaultActiveCell = arrayAt(gridCells, 8);

  const gridLabel = `${displayedDateLabel} ${timeZone}`;

  const gridTranslate = useCallback<CalendarTranslate>(
    (key, values) => {
      if (key === "calendar.grid.label") {
        return gridLabel;
      }

      return t(key, values);
    },
    [gridLabel, t]
  );

  const readOnly = resolvedInteractionMode === "read-only";

  const handleEventCardSelect = useCallback(
    (
      event: CalendarEvent,
      context: CalendarEventRenderContext,
      anchor: HTMLElement
    ): void => {
      selectEvent(event.id, context, anchor);
    },
    [selectEvent]
  );

  const eventConfig = useMemo<DayGridEventConfig>(() => {
    const config: DayGridEventConfig = {
      handleSelect: handleEventCardSelect,
      locale,
      readOnly,
      renderConflict,
      renderEvent,
      t,
      timeZone,
    };

    return { ...config, renderTime: buildSharedRenderTime(config) };
  }, [
    handleEventCardSelect,
    locale,
    readOnly,
    renderConflict,
    renderEvent,
    t,
    timeZone,
  ]);

  const handleActiveCellChange = (cell: CalendarCell): void => {
    const index = cellIndexByKey.get(cellKey(cell));

    if (index === undefined) {
      return;
    }

    const isWorkingHourValue = workingSlots.at(index) ?? false;
    const label = buildCellLabel(cell, isWorkingHourValue, timeZone, locale, t);

    announce(`${t("calendar.day.focus")}: ${label}`);
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    context: CalendarCellContext
  ): void => {
    const index = cellIndexByKey.get(cellKey(context.cell));

    if (index === undefined) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      selectEmptyCell(index, event.currentTarget);
    }
  };

  const handleTimedLayoutClick = (
    event: ReactMouseEvent<HTMLDivElement>
  ): void => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-event-id]") !== null
    ) {
      return;
    }
    if (!(event.target instanceof Element)) {
      return;
    }

    const cellElement =
      event.target.closest<HTMLDivElement>('[role="gridcell"]');
    const key = cellElement?.dataset.cellKey;

    if (!cellElement || key === undefined) {
      return;
    }

    const index = cellIndexByKey.get(key);

    if (index !== undefined) {
      selectEmptyCell(
        index,
        cellElement,
        new DOMRect(event.clientX, event.clientY, 0, 0)
      );
    }
  };

  const handleTimedLayoutKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void => {
    if (
      event.defaultPrevented ||
      (event.key !== "Enter" && event.key !== " ")
    ) {
      return;
    }
    if (!(event.target instanceof Element)) {
      return;
    }

    const cellElement =
      event.target.closest<HTMLDivElement>('[role="gridcell"]');
    const key = cellElement?.dataset.cellKey;

    if (!cellElement || key === undefined) {
      return;
    }

    const index = cellIndexByKey.get(key);

    if (index === undefined) {
      return;
    }

    event.preventDefault();
    selectEmptyCell(index, cellElement);
  };

  const handleEventFocus = useCallback(
    (segment: CalendarEventSegment): void => {
      const announcement = buildEventAnnouncement(segment, timeZone, locale, t);

      announce(announcement);
    },
    [announce, locale, t, timeZone]
  );

  const liveRegionLabel =
    liveText || `${t("calendar.day.range")}: ${displayedDateLabel}`;

  return {
    allDaySegments,
    cellIndexByKey,
    cellKey,
    currentInstant,
    currentTimeLabel,
    date,
    defaultActiveCell,
    displayedDateLabel,
    eventConfig,
    gridLabel,
    gridRows,
    gridTranslate,
    handleActiveCellChange,
    handleCellKeyDown,
    handleEventFocus,
    handleTimedLayoutClick,
    handleTimedLayoutKeyDown,
    isToday,
    isWorkingDay,
    liveRegionLabel,
    liveText,
    locale,
    nowPercent,
    readOnly,
    renderCell,
    resolvedDirection,
    resolvedSelectedEventId,
    setBodyRef,
    slotStarts,
    t,
    timeZone,
    timedEvents,
    unavailableCellKeys,
    utcDayRange,
    workingSlots,
  };
};

const DayGridContent = (props: DayGridContentProps) => {
  const view = useDayGridContent(props);

  const {
    allDaySegments,
    cellIndexByKey,
    cellKey: getCellKey,
    currentInstant,
    currentTimeLabel,
    date,
    defaultActiveCell,
    displayedDateLabel,
    eventConfig,
    gridLabel,
    gridRows,
    gridTranslate,
    handleActiveCellChange,
    handleCellKeyDown,
    handleEventFocus,
    handleTimedLayoutClick,
    handleTimedLayoutKeyDown,
    slotStarts,
    isToday,
    isWorkingDay,
    liveRegionLabel,
    liveText,
    locale,
    nowPercent,
    readOnly,
    renderCell,
    resolvedDirection,
    resolvedSelectedEventId,
    setBodyRef,
    t,
    timedEvents,
    timeZone,
    unavailableCellKeys,
    utcDayRange,
    workingSlots,
  } = view;

  const {
    cellClassName,
    className,
    columnHeaderClassName,
    gutterClassName,
    trailingGutter = false,
  } = props;

  const gutterLabels = slotStarts.map((slotStart) => (
    <div className={clsx(styles.gutterHour, gutterClassName)} key={slotStart}>
      {isHourStart(slotStart, timeZone)
        ? formatGridTime(slotStart, timeZone, locale)
        : null}
    </div>
  ));

  const getDayCellLabel = (cell: CalendarCell): string => {
    const index = cellIndexByKey.get(getCellKey(cell)) ?? 0;

    return buildCellLabel(
      cell,
      workingSlots[index] ?? false,
      timeZone,
      locale,
      t
    );
  };

  const renderDayCell = (context: CalendarCellContext): ReactNode => {
    const index = cellIndexByKey.get(context.key) ?? 0;
    const unavailable = unavailableCellKeys.has(context.key);

    const cellContext: CalendarCellContext = {
      ...context,
      isReadOnly: readOnly,
      isUnavailable: unavailable,
    };

    return (
      <div
        className={clsx(
          styles.cellContent,
          (workingSlots[index] ?? false)
            ? styles.workingHour
            : styles.nonWorkingHour,
          cellClassName
        )}
      >
        {renderCell?.(cellContext)}
      </div>
    );
  };

  return (
    <section
      className={clsx(
        styles.dayGrid,
        "dayGrid",
        isWorkingDay ? styles.workingDay : styles.nonWorkingDay,
        trailingGutter && styles.trailingGutter,
        className
      )}
      dir={resolvedDirection}
      aria-label={gridLabel}
      style={{ "--day-grid-slot-count": slotStarts.length } as DayGridStyles}
    >
      <div className={styles.header}>
        <div
          className={clsx(styles.headerGutter, "headerGutter", gutterClassName)}
          title={timeZone}
        >
          {formatViewerTimeZoneOffset(utcDayRange.start, timeZone, locale)}
        </div>
        <div
          className={clsx(styles.headerDay, "headerDay", columnHeaderClassName)}
        >
          <span
            className={clsx(
              styles.weekdayLabel,
              "weekdayLabel",
              isToday && styles.today
            )}
          >
            {formatViewerWeekdayShort(utcDayRange.start, timeZone, locale)}
          </span>
          <span
            className={clsx(
              styles.dayNumber,
              "dayNumber",
              isToday && styles.today
            )}
          >
            {formatViewerDayNumber(utcDayRange.start, timeZone, locale)}
          </span>
        </div>
        {trailingGutter && (
          <div
            className={clsx(
              styles.headerGutter,
              styles.trailingGutterCell,
              gutterClassName
            )}
            aria-hidden="true"
          >
            {formatViewerTimeZoneOffset(utcDayRange.start, timeZone, locale)}
          </div>
        )}
      </div>

      <div
        className={styles.allDay}
        aria-label={`${t("calendar.day.allDayEventsFor")}: ${displayedDateLabel}`}
      >
        <div className={clsx(styles.allDayGutter, gutterClassName)}>
          {t("calendar.event.allDay")}
        </div>
        <div className={styles.allDayTrack}>
          {allDaySegments.map((segment) => (
            <div
              className={clsx(styles.event, styles.allDayEvent)}
              key={`${segment.event.id}-${segment.segment}`}
              onFocusCapture={() => {
                handleEventFocus(segment);
              }}
            >
              {renderDayGridEventCard({
                config: eventConfig,
                event: segment.event,
                past: date >= segment.event.endDate,
                segment,
                selected: resolvedSelectedEventId === segment.event.id,
              })}
            </div>
          ))}
          {allDaySegments.length === 0 && (
            <span className={styles.allDayEmpty}>
              {t("calendar.day.noAllDayEvents")}
            </span>
          )}
        </div>
        {trailingGutter && (
          <div
            className={clsx(
              styles.allDayGutter,
              styles.trailingGutterCell,
              gutterClassName
            )}
            aria-hidden="true"
          />
        )}
      </div>

      <div
        className={clsx(styles.timedLayout, "timedLayout")}
        role="presentation"
        ref={setBodyRef}
        onClick={handleTimedLayoutClick}
        onKeyDown={handleTimedLayoutKeyDown}
      >
        <div className={styles.gutter} aria-hidden="true">
          {gutterLabels}
        </div>
        <div className={clsx(styles.timedGrid, "timedGrid")}>
          <CalendarGrid
            columns={[{ key: "day", label: displayedDateLabel }]}
            rows={gridRows}
            t={gridTranslate}
            className={styles.dayCalendarGrid}
            defaultActiveCellKey={
              defaultActiveCell === undefined
                ? undefined
                : getCellKey(defaultActiveCell)
            }
            getCellKey={getCellKey}
            getCellLabel={getDayCellLabel}
            onActiveCellChange={handleActiveCellChange}
            onCellKeyDown={handleCellKeyDown}
            renderCell={renderDayCell}
          />
          <DayGridEventLayer
            config={eventConfig}
            currentInstant={currentInstant}
            currentTimeLabel={currentTimeLabel}
            slotCount={slotStarts.length}
            nowPercent={nowPercent}
            onEventFocus={handleEventFocus}
            selectedEventId={resolvedSelectedEventId}
            timedEvents={timedEvents}
          />
        </div>
        {trailingGutter && (
          <div
            className={clsx(styles.gutter, styles.trailingGutterCell)}
            aria-hidden="true"
          >
            {gutterLabels}
          </div>
        )}
      </div>

      <div
        className={styles.liveRegion}
        role="status"
        aria-label={liveRegionLabel}
        aria-live="polite"
        aria-atomic="true"
      >
        {liveText}
      </div>
    </section>
  );
};

export const DayGrid = (props: DayGridProps) => (
  <CalendarScope {...props}>
    <DayGridContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

DayGrid.displayName = "DayGrid";
