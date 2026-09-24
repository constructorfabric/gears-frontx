"use client";

import { clsx } from "clsx";
import { TimerIcon, UserIcon, UsersIcon } from "lucide-react";
import { createContext, memo, useContext, useId, useMemo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import {
  formatCalendarList,
  formatDuration,
  formatRelativeHint,
  formatViewerTimeZoneOffset,
} from "../../core/format";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
  UtcInstant,
} from "../../core/model";
import { fromViewerDateTime } from "../../core/temporal";
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
import { useAgendaViewController } from "../../react/controllers/use-agenda-view-controller";
import { isSafeHttpUrl } from "../../react/controllers/use-event-detail-panel-controller";
import type { CalendarEventRenderer } from "../../react/slots";
import { Avatar, AvatarOverflow } from "../primitives/avatar/avatar";
import { Button } from "../primitives/button/button";
import {
  buildLiveAnnouncement,
  formatAgendaDate,
  formatAgendaEventCount,
  formatAgendaTime,
  getRelativeDayLabel,
} from "./agenda-format";
import { buildAgendaRenderContext, isRowAvailable } from "./agenda-rows";
import type {
  AgendaDayGroup as AgendaDayGroupData,
  AgendaEventRow,
} from "./agenda-rows";

import styles from "./agenda-view.module.css";

export interface AgendaViewProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** First day of the 30-day window. */
  readonly date: CalendarDate;
  /** Events to list. Days without events still render. */
  readonly events: readonly CalendarEvent[];
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the body of an event row; the time gutter and colour bar stay. */
  readonly renderEvent?: CalendarEventRenderer;
  /** Replaces a day's heading. */
  readonly renderDayHeader?: (date: CalendarDate) => ReactNode;
  /** An available event was activated. `anchor` is the row element. */
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
}

interface AgendaDayGroupProps {
  readonly group: AgendaDayGroupData;
  readonly renderDayHeader?: (date: CalendarDate) => ReactNode;
  readonly todayDate: CalendarDate;
}

interface AgendaInteractionContextValue {
  readonly currentInstant: UtcInstant;
  readonly focusedRowIndex: number;
  readonly onFocusRow: (index: number) => void;
  readonly onRowKeyDown: (
    event: ReactKeyboardEvent,
    index: number,
    eventId: string
  ) => void;
  readonly onSelectRow: (eventId: string, anchor?: HTMLElement) => void;
  readonly renderEvent?: CalendarEventRenderer;
  readonly selectedEventId: string | null;
  readonly setRowRef: (index: number, element: HTMLElement | null) => void;
}

const AgendaInteractionContext =
  createContext<AgendaInteractionContextValue | null>(null);

const useAgendaInteraction = (): AgendaInteractionContextValue => {
  const value = useContext(AgendaInteractionContext);

  if (value === null) {
    throw new Error("AgendaEventButton must be rendered inside AgendaView");
  }

  return value;
};

const buildEventDescription = (
  row: AgendaEventRow,
  locale: string,
  t: CalendarTranslate
): string => {
  const parts = [
    ...(row.past ? [t("calendar.event.past")] : []),
    ...(isRowAvailable(row) ? [] : [t("calendar.event.unavailable")]),
  ];

  return formatCalendarList(locale, parts);
};

const buildRelativeHint = (
  row: AgendaEventRow,
  currentInstant: UtcInstant,
  locale: string,
  t: CalendarTranslate
): string | null => {
  if (row.kind !== "timed" || row.past) {
    return null;
  }

  if (row.now) {
    return t("calendar.agenda.now");
  }

  return t("calendar.agenda.startsIn", {
    duration: formatRelativeHint(row.start, currentInstant, locale),
  });
};

const AGENDA_AVATAR_LIMIT = 6;

const formatAgendaDuration = (
  start: UtcInstant,
  end: UtcInstant,
  locale: string
): string => formatDuration(start, end, locale).replaceAll(" ", " ");

interface AgendaEventContentProps {
  readonly relativeHint: string | null;
  readonly row: AgendaEventRow;
}

const AgendaEventContent = ({ relativeHint, row }: AgendaEventContentProps) => {
  const { locale, t } = useCalendarLocalization();

  const title =
    row.event.title.trim() === ""
      ? t("calendar.event.type.default")
      : row.event.title;

  const isTimed = row.kind === "timed";
  const { organizer } = row.event;
  const attendees = row.event.attendees ?? [];
  const attendeeCount = attendees.length;
  const shownAttendees = attendees.slice(0, AGENDA_AVATAR_LIMIT);
  const hiddenAttendeeCount = attendeeCount - shownAttendees.length;

  return (
    <>
      <span className={styles.eventTitle}>{title}</span>
      <span className={styles.eventMetadata}>
        {isTimed && (
          <span className={styles.metadataRow} data-agenda-metadata="timing">
            <span className={styles.metadataGroup}>
              <TimerIcon aria-hidden="true" className={styles.metadataIcon} />
              <span>{formatAgendaDuration(row.start, row.end, locale)}</span>
            </span>
            {relativeHint !== null && (
              <span className={styles.relativeHint}>{relativeHint}</span>
            )}
          </span>
        )}
        {(organizer?.trim() ?? "") !== "" && (
          <span className={styles.metadataRow} data-agenda-metadata="organizer">
            <UserIcon aria-hidden="true" className={styles.metadataIcon} />
            <span>{organizer}</span>
          </span>
        )}
        {attendeeCount > 0 && (
          <span className={styles.metadataRow} data-agenda-metadata="attendees">
            <UsersIcon aria-hidden="true" className={styles.metadataIcon} />
            <span>{attendeeCount.toLocaleString(locale)}</span>
          </span>
        )}
      </span>
      {attendeeCount > 0 && (
        <span className={styles.avatars} data-agenda-avatars>
          {shownAttendees.map((attendee) => (
            <Avatar
              className={styles.avatar}
              decorative
              key={attendee.id}
              locale={locale}
              name={attendee.displayName}
            />
          ))}
          {hiddenAttendeeCount > 0 && (
            <AvatarOverflow
              className={styles.avatar}
              count={hiddenAttendeeCount}
              label={t("calendar.agenda.attendees")}
            />
          )}
        </span>
      )}
    </>
  );
};

const COLOR_CLASSES: ReadonlyMap<string, string> = new Map([
  ["turquoise", styles.colorTurquoise],
  ["purple", styles.colorPurple],
  ["orange", styles.colorOrange],
]);

const SEGMENT_CLASSES: ReadonlyMap<AgendaEventRow["segment"], string> = new Map(
  [
    ["start", styles.segmentStart],
    ["middle", styles.segmentMiddle],
    ["end", styles.segmentEnd],
  ]
);

const resolveColorClass = (
  colorFamily: CalendarEvent["colorFamily"]
): string | undefined => COLOR_CLASSES.get(colorFamily);

const resolveSegmentClass = (
  segment: AgendaEventRow["segment"]
): string | undefined => SEGMENT_CLASSES.get(segment);

interface AgendaEventButtonProps {
  readonly row: AgendaEventRow;
}

const AgendaEventButtonImpl = ({ row }: AgendaEventButtonProps) => {
  const {
    currentInstant,
    focusedRowIndex,
    onFocusRow,
    onRowKeyDown,
    onSelectRow,
    renderEvent,
    selectedEventId,
    setRowRef,
  } = useAgendaInteraction();

  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const descriptionId = useId();
  const selected = selectedEventId === row.event.id;
  const available = isRowAvailable(row);
  const context = buildAgendaRenderContext(row, selected);
  const description = buildEventDescription(row, locale, t);
  const relativeHint = buildRelativeHint(row, currentInstant, locale, t);

  const eventContent = renderEvent ? (
    renderEvent(context)
  ) : (
    <AgendaEventContent relativeHint={relativeHint} row={row} />
  );

  const joinUrl = isSafeHttpUrl(row.event.joinUrl) ? row.event.joinUrl : null;

  return (
    <span className={clsx(styles.slotRow, "slotRow")}>
      <Button
        ref={(element: HTMLButtonElement | null) => {
          setRowRef(row.focusIndex, element);
        }}
        aria-describedby={description.length > 0 ? descriptionId : undefined}
        aria-disabled={available ? undefined : "true"}
        aria-pressed={selected ? "true" : "false"}
        className={clsx(
          styles.agendaEvent,
          resolveColorClass(row.event.colorFamily),
          resolveSegmentClass(row.segment),
          selected && styles.selected,
          row.past && styles.past,
          row.now && styles.now,
          !available && styles.unavailable
        )}
        data-event-id={row.event.id}
        data-selected={selected ? "true" : undefined}
        onClick={(clickEvent) => {
          onSelectRow(row.event.id, clickEvent.currentTarget);
        }}
        onFocus={() => {
          onFocusRow(row.focusIndex);
        }}
        onKeyDown={(event) => {
          onRowKeyDown(event, row.focusIndex, row.event.id);
        }}
        tabIndex={focusedRowIndex === row.focusIndex ? 0 : -1}
        type="button"
        size="content"
        variant="outline"
      >
        <span className={clsx(styles.slot, "slot")} data-agenda-slot>
          <span
            className={clsx(
              styles.slotTimes,
              "slotTimes",
              row.kind === "allday" && styles.slotTimesAllDay
            )}
          >
            {row.kind === "timed" ? (
              <>
                <span className={styles.slotTimeStart} data-slot-time>
                  {formatAgendaTime(row.start, timeZone, locale)}
                </span>
                <span className={styles.slotTimeEnd} data-slot-time>
                  {formatAgendaTime(row.end, timeZone, locale)}
                </span>
              </>
            ) : (
              <span className={styles.slotTimeAllDay} data-slot-time>
                {t("calendar.agenda.allDay")}
              </span>
            )}
          </span>
          <span aria-hidden="true" className={styles.slotBar} />
          <span className={clsx(styles.slotBody, "slotBody")}>
            {eventContent}
            {description.length > 0 && (
              <span id={descriptionId} className={styles.srOnly}>
                {description}
              </span>
            )}
          </span>
        </span>
      </Button>
      {joinUrl !== null && (
        <a
          className={clsx(styles.joinButton, "joinButton")}
          href={joinUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("calendar.detail.join")}
        </a>
      )}
    </span>
  );
};

const AgendaEventButton = memo(AgendaEventButtonImpl);

const AgendaNowLine = ({
  currentInstant,
  minutePercent,
}: {
  readonly currentInstant: UtcInstant;
  readonly minutePercent: number;
}) => {
  const { locale } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const currentTimeLabel = formatAgendaTime(currentInstant, timeZone, locale);

  return (
    <div
      aria-hidden="true"
      className={clsx(styles.nowLine, "nowLine")}
      data-current-time={currentTimeLabel}
      data-testid="agenda-now-line"
      style={{ insetBlockStart: `${minutePercent}%` }}
    >
      <span className={styles.nowGutter} aria-hidden="true">
        {currentTimeLabel}
      </span>
      <span className={styles.nowRule} aria-hidden="true" />
    </div>
  );
};

const AgendaDayGroup = ({
  group,
  renderDayHeader,
  todayDate,
}: AgendaDayGroupProps) => {
  const { currentInstant } = useAgendaInteraction();
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const dayStart = fromViewerDateTime({
    date: group.date,
    time: "00:00",
    timeZone,
  });
  const isToday = group.date === todayDate;
  const relativeLabel = getRelativeDayLabel(group.date, todayDate, t);
  const dateLabel = formatAgendaDate(dayStart, timeZone, locale);
  const isAbsoluteOnly = relativeLabel === null && group.eventCount === 0;

  return (
    <li
      className={styles.dayGroup}
      data-agenda-date={group.date}
      data-today={isToday}
    >
      <div
        className={clsx(
          styles.dayHeader,
          isAbsoluteOnly && styles.dayHeaderAbsoluteOnly
        )}
        data-today={isToday}
      >
        <span className={clsx(styles.dayGutter, "dayGutter")} title={timeZone}>
          {formatViewerTimeZoneOffset(dayStart, timeZone, locale)}
        </span>
        <div className={styles.dayCell}>
          {renderDayHeader ? (
            renderDayHeader(group.date)
          ) : (
            <>
              {relativeLabel !== null && (
                <span className={styles.dayRelative} data-agenda-relative-label>
                  {relativeLabel}
                </span>
              )}
              <span className={clsx(styles.dayDate, "dayDate")}>
                {dateLabel}
              </span>
              {group.eventCount > 0 && (
                <span className={styles.dayCount} data-agenda-event-count>
                  {formatAgendaEventCount(group.eventCount, t)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {group.allDayEvents.length > 0 && (
        <div className={clsx(styles.row, "row", styles.rowAllDay)}>
          <div className={clsx(styles.rowGutter, "rowGutter")}>
            {t("calendar.agenda.allDay")}
          </div>
          <div className={styles.rowContent}>
            {group.allDayEvents.map((row) => (
              <AgendaEventButton key={row.key} row={row} />
            ))}
          </div>
        </div>
      )}

      {group.hourRows.map((hourRow, hourIndex) => {
        const isEmpty = hourRow.events.length === 0;

        const nowLine =
          group.nowLine?.hourRowIndex === hourIndex ? group.nowLine : null;

        return (
          <div
            className={clsx(styles.row, "row", isEmpty && styles.rowEmpty)}
            data-agenda-empty-row={
              isEmpty && group.eventCount === 0 && group.date !== todayDate
                ? "true"
                : undefined
            }
            data-agenda-hour-row
            key={`${group.date}:${hourRow.hourStart ?? "all-day"}`}
          >
            <div className={clsx(styles.rowGutter, "rowGutter")}>
              {hourRow.hourStart === null
                ? ""
                : formatAgendaTime(hourRow.hourStart, timeZone, locale)}
            </div>
            <div className={styles.rowContent}>
              {isEmpty && group.eventCount === 0 && (
                <span className={clsx(styles.emptyDay, "emptyDay")}>
                  {t("calendar.agenda.emptyDay")}
                </span>
              )}
              {hourRow.events.map((row) => (
                <AgendaEventButton key={row.key} row={row} />
              ))}
            </div>
            {nowLine !== null && (
              <AgendaNowLine
                currentInstant={currentInstant}
                minutePercent={nowLine.minutePercent}
              />
            )}
          </div>
        );
      })}
    </li>
  );
};

const AgendaViewContent = ({
  className,
  date,
  defaultSelectedEventId,
  events,
  onEventSelect,
  onSelectedEventIdChange,
  renderDayHeader,
  renderEvent,
  selectedEventId,
}: AgendaViewContentProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useAgendaViewController({
    date,
    defaultSelectedEventId,
    events,
    onEventSelect,
    onSelectedEventIdChange,
    selectedEventId,
    timeZone,
  });

  const agendaInteraction = useMemo<AgendaInteractionContextValue>(
    () => ({
      currentInstant: controller.currentInstant,
      focusedRowIndex: controller.focusedRowIndex,
      onFocusRow: controller.announceRow,
      onRowKeyDown: controller.handleRowKeyDown,
      onSelectRow: controller.selectEvent,
      renderEvent,
      selectedEventId: controller.selectedEventId,
      setRowRef: controller.setRowRef,
    }),
    [
      controller.announceRow,
      controller.currentInstant,
      controller.focusedRowIndex,
      controller.handleRowKeyDown,
      controller.selectEvent,
      controller.selectedEventId,
      controller.setRowRef,
      renderEvent,
    ]
  );

  const liveText = buildLiveAnnouncement(
    controller.announcement,
    controller.dayGroups,
    controller.eventRows,
    locale,
    timeZone,
    t
  );

  return (
    <section
      className={clsx(styles.agendaView, "agendaView", className)}
      aria-label={t("calendar.agenda.viewName")}
    >
      <AgendaInteractionContext.Provider value={agendaInteraction}>
        <ul className={clsx(styles.groups, "groups")}>
          {controller.dayGroups.map((group) => (
            <AgendaDayGroup
              group={group}
              key={group.date}
              renderDayHeader={renderDayHeader}
              todayDate={controller.todayDate}
            />
          ))}
        </ul>
      </AgendaInteractionContext.Provider>

      <div
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveText}
      </div>
    </section>
  );
};

export const AgendaView = (props: AgendaViewProps) => (
  <CalendarScope {...props}>
    <AgendaViewContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type AgendaViewContentProps = Omit<AgendaViewProps, keyof CalendarContextProps>;

AgendaView.displayName = "AgendaView";
