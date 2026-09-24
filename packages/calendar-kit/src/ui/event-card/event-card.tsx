"use client";
// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-slots:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-keyboard:p1

import { clsx } from "clsx";
import {
  ClockIcon,
  MapPinIcon,
  RefreshCwIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { useId } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";

import type {
  CalendarColorFamily,
  CalendarConflict,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
  IanaTimeZone,
} from "../../core/model";
import { toUtcRange } from "../../core/temporal";
import { formatTimeOfDay } from "../../core/time-input";
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
import type { CalendarEventKeyDownHandler } from "../../react/slots";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import { conflictIndicatorItemClassesContext } from "../conflict-indicator/conflict-indicator-context";
import { Button } from "../primitives/button/button";
import { buildEventPresentation } from "./event-presentation";

import styles from "./event-card.module.css";

// Shipped through the event-card entry.
export type { CalendarEventKeyDownHandler } from "../../react/slots";

export interface EventCardProps<
  Payload = unknown,
> extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** The event to show. */
  readonly event: CalendarEvent<Payload>;
  /** The day segment the grid laid out. Derived from the event when omitted. */
  readonly segment?: CalendarEventSegment;
  /** Placement and size. The height also picks the card's density tier. */
  readonly geometry?: CalendarEventGeometry;
  /** Apply `geometry` inline; `false` when a host wrapper positions the card. Default `true`. */
  readonly positioned?: boolean;
  /** Extra inline styles on the card root. */
  readonly style?: CSSProperties;
  /** Roving tab index set by the owning grid. */
  readonly tabIndex?: number;
  /** Set by the owning grid for spanning all-day events. */
  readonly "aria-colspan"?: number;
  /** Set by the owning grid. */
  readonly "aria-rowindex"?: number;
  /** Set by the owning grid for host CSS. */
  readonly "data-color-family"?: string;
  /** Marks a segment that continues from the previous day. */
  readonly "data-continues-before"?: "true";
  /** Marks a segment that continues to the next day. */
  readonly "data-continues-after"?: "true";
  /** Selected state, exposed as `aria-pressed`. */
  readonly selected?: boolean;
  /** Override for `event.available`. */
  readonly available?: boolean;
  /** Past state: muted surface, named in the accessible description. */
  readonly past?: boolean;
  /** Read-only state, named in the accessible description. The card stays selectable. */
  readonly readOnly?: boolean;
  /** Conflicts to show. Default `event.conflicts`. */
  readonly conflicts?: readonly CalendarConflict[];
  /** Replaces the title. */
  readonly renderTitle?: (
    context: CalendarEventRenderContext<Payload>
  ) => ReactNode;
  /** Replaces the time row, clock icon included. */
  readonly renderTime?: (
    context: CalendarEventRenderContext<Payload>
  ) => ReactNode;
  /** Replaces the location, organizer and type rows. Never hidden by compact density. */
  readonly renderMetadata?: (
    context: CalendarEventRenderContext<Payload>
  ) => ReactNode;
  /** Replaces how each conflict renders. */
  readonly renderConflict?: (
    conflict: CalendarConflict,
    context: CalendarEventRenderContext<Payload>
  ) => ReactNode;
  /** `anchor` is the card element, so a host can open a preview beside it. */
  readonly onSelect?: (
    event: CalendarEvent<Payload>,
    context: CalendarEventRenderContext<Payload>,
    anchor: HTMLElement
  ) => void;
  /** Called before the card's own Enter/Space handling. */
  readonly onKeyDown?: CalendarEventKeyDownHandler<Payload>;
}

const CONFLICT_ITEM_CLASSES = {
  error: styles.error,
  warning: styles.warning,
} as const;

const SEGMENT_CLASS = {
  end: styles.segmentEnd,
  middle: styles.segmentMiddle,
  start: styles.segmentStart,
} as const;

const METADATA_MIN_BLOCK_SIZE = 88;
// Host CSS relies on this `data-event-card-compact` cutoff.
const COMPACT_MIN_BLOCK_SIZE = 110;
const SINGLE_MIN_BLOCK_SIZE = 21;
const TITLE_LINE_HEIGHT = 16;
const META_LINE_HEIGHT = 16;
const CARD_BLOCK_INSET = 4;
const STACKED_MIN_BLOCK_SIZE =
  TITLE_LINE_HEIGHT + META_LINE_HEIGHT + CARD_BLOCK_INSET * 2;

export type EventCardLayout = "full" | "stacked" | "single" | "title";

const resolveEventCardLayout = (
  height: number | undefined
): EventCardLayout => {
  if (height === undefined || height >= METADATA_MIN_BLOCK_SIZE) {
    return "full";
  }
  if (height >= STACKED_MIN_BLOCK_SIZE) {
    return "stacked";
  }
  if (height >= SINGLE_MIN_BLOCK_SIZE) {
    return "single";
  }
  return "title";
};

const resolveSegmentClassName = (
  segment: CalendarEventSegment["segment"]
): string | undefined =>
  segment === null ? undefined : SEGMENT_CLASS[segment];

const COLOR_FAMILY_CLASSES: ReadonlyMap<string, string> = new Map([
  ["turquoise", styles.colorTurquoise],
  ["purple", styles.colorPurple],
  ["orange", styles.colorOrange],
]);

const resolveColorFamilyClassName = (
  colorFamily: CalendarColorFamily
): string | undefined => COLOR_FAMILY_CLASSES.get(colorFamily);

const buildFallbackSegment = <Payload,>(
  event: CalendarEvent<Payload>
): CalendarEventSegment => {
  if (event.allDay) {
    const range = toUtcRange({
      endExclusive: event.endDate,
      start: event.startDate,
      timeZone: event.timeZone,
    });

    return {
      date: event.startDate,
      end: range.end,
      event,
      segment: null,
      start: range.start,
    };
  }

  return {
    date: event.startDate,
    end: event.end,
    event,
    segment: null,
    start: event.start,
  };
};

const defaultTimeText = (
  event: CalendarEvent,
  locale: string,
  t: CalendarTranslate
): string | undefined => {
  if (event.allDay) {
    return t("calendar.eventCard.allDay");
  }

  const start = formatTimeOfDay(event.startTime, locale);

  if (event.endTime === null) {
    return start;
  }

  return `${start} – ${formatTimeOfDay(event.endTime, locale)}`;
};

const geometryToStyle = (geometry: CalendarEventGeometry): CSSProperties => ({
  height: `${geometry.height}px`,
  inlineSize: `${geometry.inlineSize}px`,
  insetInlineStart: `${geometry.insetInlineStart}px`,
  top: `${geometry.top}px`,
  zIndex: geometry.zIndex,
});

const hasEventValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim() !== "";

interface DefaultEventMetadataProps {
  readonly event: CalendarEvent;
}

const METADATA_FIELDS = [
  { Icon: MapPinIcon, field: "location", name: "location" },
  { Icon: UserIcon, field: "organizer", name: "organizer" },
  { Icon: TagIcon, field: "type", name: "eventType" },
] as const;

const DefaultEventMetadata = ({ event }: DefaultEventMetadataProps) => {
  const rows = METADATA_FIELDS.flatMap(({ field, Icon, name }) => {
    const value = event[name];

    return hasEventValue(value) ? [{ Icon, field, value }] : [];
  });

  if (rows.length === 0) {
    return null;
  }

  return (
    <span
      className={clsx(styles.metadata, styles.defaultMetadata)}
      data-event-metadata="true"
    >
      {rows.map(({ field, Icon, value }) => (
        <span
          className={styles.metadataRow}
          data-event-metadata-field={field}
          key={field}
        >
          <Icon className={styles.metadataIcon} aria-hidden="true" />
          <span>{value}</span>
        </span>
      ))}
    </span>
  );
};

const isSet = <T,>(value: T | null | undefined): value is NonNullable<T> =>
  (value ?? null) !== null;

const booleanAttribute = (value: boolean): "true" | "false" =>
  value ? "true" : "false";

type SlotRenderer<Payload> = (
  context: CalendarEventRenderContext<Payload>
) => ReactNode;

type SlotSelectionHandler<Payload> = (
  event: CalendarEvent<Payload>,
  context: CalendarEventRenderContext<Payload>,
  anchor: HTMLElement
) => void;

interface EventCardActivation<Payload> {
  readonly event: CalendarEvent<Payload>;
  readonly isAvailable: boolean;
  readonly onKeyDown?: CalendarEventKeyDownHandler<Payload>;
  readonly onSelect?: SlotSelectionHandler<Payload>;
}

const activateEventCard = <Payload,>(
  activation: EventCardActivation<Payload>,
  context: CalendarEventRenderContext<Payload>,
  anchor: HTMLElement
): void => {
  if (!activation.isAvailable) {
    return;
  }

  activation.onSelect?.(activation.event, context, anchor);
};

const handleEventCardKeyDown = <Payload,>(
  keyboardEvent: ReactKeyboardEvent<HTMLButtonElement>,
  activation: EventCardActivation<Payload>,
  context: CalendarEventRenderContext<Payload>
): void => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
  if (keyboardEvent.repeat) {
    return;
  }

  activation.onKeyDown?.(keyboardEvent, context);

  if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
    return;
  }

  keyboardEvent.preventDefault();
  activateEventCard(activation, context, keyboardEvent.currentTarget);
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
};

const buildConflictSlot = <Payload,>(
  renderConflict:
    | ((
        conflict: CalendarConflict,
        context: CalendarEventRenderContext<Payload>
      ) => ReactNode)
    | undefined,
  context: CalendarEventRenderContext<Payload>
): ((conflict: CalendarConflict) => ReactNode) | undefined =>
  isSet(renderConflict)
    ? (conflict: CalendarConflict): ReactNode =>
        renderConflict(conflict, context)
    : undefined;

interface CardClassNameInput {
  readonly className: string | undefined;
  readonly event: CalendarEvent;
  readonly isAvailable: boolean;
  readonly past: boolean;
  readonly readOnly: boolean;
  readonly resolvedSegment: CalendarEventSegment;
  readonly selected: boolean;
}

const resolveCardClassName = ({
  className,
  event,
  isAvailable,
  past,
  readOnly,
  resolvedSegment,
  selected,
}: CardClassNameInput): string =>
  clsx(
    styles.card,
    resolveSegmentClassName(resolvedSegment.segment),
    resolveColorFamilyClassName(event.colorFamily),
    event.allDay && styles.allDay,
    hasEventValue(event.recurrenceRule) && styles.recurring,
    selected && styles.selected,
    past && styles.past,
    readOnly && styles.readOnly,
    !isAvailable && styles.unavailable,
    className
  );

interface EventCardTimeRowProps<Payload> {
  readonly context: CalendarEventRenderContext<Payload>;
  readonly event: CalendarEvent<Payload>;
  readonly layout: EventCardLayout;
  readonly locale: string;
  readonly renderTime?: SlotRenderer<Payload>;
  readonly timeText: string | undefined;
}

const EventCardTimeRow = <Payload,>({
  context,
  event,
  layout,
  locale,
  renderTime,
  timeText,
}: EventCardTimeRowProps<Payload>) => {
  if (!isSet(timeText)) {
    return null;
  }

  const hasRenderTime = isSet(renderTime);

  const compactTimeText =
    layout === "single" && !hasRenderTime && !event.allDay
      ? formatTimeOfDay(event.startTime, locale)
      : timeText;

  return (
    <span
      className={clsx(
        styles.time,
        !hasRenderTime &&
          !event.allDay &&
          layout !== "single" &&
          styles.timedRow
      )}
      data-event-card-time="true"
    >
      {hasRenderTime ? (
        renderTime(context)
      ) : (
        <>
          {layout !== "single" && !event.allDay && (
            <ClockIcon className={styles.timeIcon} aria-hidden="true" />
          )}
          {compactTimeText}
        </>
      )}
    </span>
  );
};

interface EventCardTitleProps<Payload> {
  readonly context: CalendarEventRenderContext<Payload>;
  readonly renderTitle?: SlotRenderer<Payload>;
  readonly titleText: string;
}

const EventCardTitle = <Payload,>({
  context,
  renderTitle,
  titleText,
}: EventCardTitleProps<Payload>) => (
  <span className={styles.title} data-event-card-title="true">
    {isSet(renderTitle) ? renderTitle(context) : titleText}
  </span>
);

const recurrenceIndicatorIcon = (
  <RefreshCwIcon className={styles.recurrenceIcon} aria-hidden="true" />
);

interface EventCardSingleBodyProps<Payload> {
  readonly context: CalendarEventRenderContext<Payload>;
  readonly event: CalendarEvent<Payload>;
  readonly layout: EventCardLayout;
  readonly locale: string;
  readonly renderTime?: SlotRenderer<Payload>;
  readonly renderTitle?: SlotRenderer<Payload>;
  readonly timeText: string | undefined;
  readonly titleText: string;
}

const EventCardSingleBody = <Payload,>({
  context,
  event,
  layout,
  locale,
  renderTime,
  renderTitle,
  timeText,
  titleText,
}: EventCardSingleBodyProps<Payload>) => (
  <>
    <span className={styles.singleLine} data-event-card-single-line="true">
      <EventCardTitle
        context={context}
        renderTitle={renderTitle}
        titleText={titleText}
      />
      {(!event.allDay || isSet(renderTime)) && (
        <EventCardTimeRow
          context={context}
          event={event}
          layout={layout}
          locale={locale}
          renderTime={renderTime}
          timeText={timeText}
        />
      )}
    </span>
    {hasEventValue(event.recurrenceRule) && recurrenceIndicatorIcon}
  </>
);

interface EventCardStackedBodyProps<Payload> {
  readonly context: CalendarEventRenderContext<Payload>;
  readonly event: CalendarEvent<Payload>;
  readonly layout: EventCardLayout;
  readonly locale: string;
  readonly renderTime?: SlotRenderer<Payload>;
  readonly renderTitle?: SlotRenderer<Payload>;
  readonly timeText: string | undefined;
  readonly titleText: string;
}

const EventCardStackedBody = <Payload,>({
  context,
  event,
  layout,
  locale,
  renderTime,
  renderTitle,
  timeText,
  titleText,
}: EventCardStackedBodyProps<Payload>) => (
  <>
    <EventCardTitle
      context={context}
      renderTitle={renderTitle}
      titleText={titleText}
    />
    {hasEventValue(event.recurrenceRule) && recurrenceIndicatorIcon}
    {layout !== "title" && (
      <EventCardTimeRow
        context={context}
        event={event}
        layout={layout}
        locale={locale}
        renderTime={renderTime}
        timeText={timeText}
      />
    )}
  </>
);

interface EventCardExtrasProps<Payload> {
  readonly conflictList: readonly CalendarConflict[];
  readonly context: CalendarEventRenderContext<Payload>;
  readonly description: string | undefined;
  readonly descriptionId: string;
  readonly event: CalendarEvent<Payload>;
  readonly hasDescription: boolean;
  readonly layout: EventCardLayout;
  readonly renderConflictSlot?: (conflict: CalendarConflict) => ReactNode;
  readonly renderMetadata?: SlotRenderer<Payload>;
}

const EventCardExtras = <Payload,>({
  conflictList,
  context,
  description,
  descriptionId,
  event,
  hasDescription,
  layout,
  renderConflictSlot,
  renderMetadata,
}: EventCardExtrasProps<Payload>) => {
  const hasMetadata = isSet(renderMetadata);

  return (
    <>
      {hasMetadata && (
        <span className={styles.metadata}>{renderMetadata(context)}</span>
      )}
      {!hasMetadata && !event.allDay && layout === "full" && (
        <DefaultEventMetadata event={event} />
      )}
      {hasDescription && description !== undefined && (
        <span id={descriptionId} className={styles.srOnly}>
          {description}
        </span>
      )}
      {conflictList.length > 0 && (
        <conflictIndicatorItemClassesContext.Provider
          value={CONFLICT_ITEM_CLASSES}
        >
          <ConflictIndicator
            conflicts={conflictList}
            renderConflict={renderConflictSlot}
          />
        </conflictIndicatorItemClassesContext.Provider>
      )}
    </>
  );
};

interface EventCardViewModel<Payload> {
  readonly context: CalendarEventRenderContext<Payload>;
  readonly conflicts: readonly CalendarConflict[];
  readonly description: string | undefined;
  readonly geometryIsCompact: boolean;
  readonly geometryStyle: CSSProperties | undefined;
  readonly isAvailable: boolean;
  readonly isPast: boolean;
  readonly layout: EventCardLayout;
  readonly resolvedSegment: CalendarEventSegment;
  readonly timeText: string | undefined;
  readonly titleText: string;
}

interface EventCardViewModelInput<Payload> {
  readonly available?: boolean;
  readonly conflicts?: readonly CalendarConflict[];
  readonly event: CalendarEvent<Payload>;
  readonly geometry?: CalendarEventGeometry;
  readonly locale: string;
  readonly positioned: boolean;
  readonly past: boolean;
  readonly readOnly: boolean;
  readonly segment?: CalendarEventSegment;
  readonly selected: boolean;
  readonly style?: CSSProperties;
  readonly t: CalendarTranslate;
  readonly timeZone: IanaTimeZone;
}

const buildEventCardViewModel = <Payload,>({
  available,
  conflicts,
  event,
  geometry,
  locale,
  positioned,
  past,
  readOnly,
  segment,
  selected,
  style,
  t,
  timeZone,
}: EventCardViewModelInput<Payload>): EventCardViewModel<Payload> => {
  const hasGeometry = geometry !== undefined;
  const geometryIsCompact =
    hasGeometry && geometry.height < COMPACT_MIN_BLOCK_SIZE;
  const layout = resolveEventCardLayout(geometry?.height);
  const resolvedSegment = segment ?? buildFallbackSegment(event);
  const presentation = buildEventPresentation({
    availableOverride: available,
    conflicts,
    event,
    geometry,
    locale,
    pastOverride: past,
    readOnly,
    segment: resolvedSegment,
    selected,
    timeZone,
    translate: t,
  });

  const geometryStyle =
    positioned && hasGeometry
      ? { ...geometryToStyle(geometry), ...style }
      : style;

  const titleText =
    event.title.trim() === "" ? t("calendar.eventCard.unnamed") : event.title;

  return {
    conflicts: presentation.conflicts,
    context: presentation.context,
    description: presentation.description,
    geometryIsCompact,
    geometryStyle,
    isAvailable: presentation.isAvailable,
    isPast: presentation.isPast,
    layout,
    resolvedSegment,
    timeText: defaultTimeText(event, locale, t),
    titleText,
  };
};

const EventCardContent = <Payload = unknown,>(
  props: EventCardContentProps<Payload>
) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
  const {
    event,
    segment,
    geometry,
    positioned = true,
    selected = false,
    available,
    past = false,
    readOnly = false,
    conflicts,
    renderTitle,
    renderTime,
    renderMetadata,
    renderConflict,
    onSelect,
    onKeyDown,
    className,
    style,
    tabIndex,
    "aria-colspan": ariaColspan,
    "aria-rowindex": ariaRowIndex,
    "data-color-family": dataColorFamily,
    "data-continues-before": dataContinuesBefore,
    "data-continues-after": dataContinuesAfter,
  } = props;

  const descriptionId = useId();
  const viewModel = buildEventCardViewModel({
    available,
    conflicts,
    event,
    geometry,
    locale,
    past,
    positioned,
    readOnly,
    segment,
    selected,
    style,
    t,
    timeZone,
  });

  const {
    context,
    conflicts: conflictList,
    description,
    geometryIsCompact,
    geometryStyle,
    isAvailable,
    isPast,
    layout,
    resolvedSegment,
    timeText,
    titleText,
  } = viewModel;

  const hasDescription = description !== undefined;

  const activation: EventCardActivation<Payload> = {
    event,
    isAvailable,
    onKeyDown,
    onSelect,
  };

  const renderConflictSlot = buildConflictSlot(renderConflict, context);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={resolveCardClassName({
        className,
        event,
        isAvailable,
        past: isPast,
        readOnly,
        resolvedSegment,
        selected,
      })}
      data-event-card-compact={booleanAttribute(geometryIsCompact)}
      data-event-card-layout={layout}
      style={geometryStyle}
      tabIndex={tabIndex}
      data-color-family={dataColorFamily}
      data-continues-before={dataContinuesBefore}
      data-continues-after={dataContinuesAfter}
      aria-colspan={ariaColspan}
      aria-rowindex={ariaRowIndex}
      data-event-id={event.id}
      aria-pressed={booleanAttribute(selected)}
      aria-describedby={hasDescription ? descriptionId : undefined}
      disabled={!isAvailable}
      focusableWhenDisabled
      onClick={(clickEvent) => {
        activateEventCard(activation, context, clickEvent.currentTarget);
      }}
      onKeyDown={(keyboardEvent: ReactKeyboardEvent<HTMLButtonElement>) => {
        handleEventCardKeyDown(keyboardEvent, activation, context);
      }}
    >
      {!event.allDay && (
        <span
          className={styles.colorBar}
          data-event-card-bar="true"
          aria-hidden="true"
        />
      )}
      <span className={styles.body}>
        {layout === "single" ? (
          <EventCardSingleBody
            context={context}
            event={event}
            layout={layout}
            locale={locale}
            renderTime={renderTime}
            renderTitle={renderTitle}
            timeText={timeText}
            titleText={titleText}
          />
        ) : (
          <EventCardStackedBody
            context={context}
            event={event}
            layout={layout}
            locale={locale}
            renderTime={renderTime}
            renderTitle={renderTitle}
            timeText={timeText}
            titleText={titleText}
          />
        )}
        <EventCardExtras
          conflictList={conflictList}
          context={context}
          description={description}
          descriptionId={descriptionId}
          event={event}
          hasDescription={hasDescription}
          layout={layout}
          renderConflictSlot={renderConflictSlot}
          renderMetadata={renderMetadata}
        />
      </span>
    </Button>
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

export const EventCard = <Payload = unknown,>(
  props: EventCardProps<Payload>
) => {
  const content = (
    <EventCardContent<Payload> {...omitCalendarContextProps(props)} />
  );

  const hasContextOverrides =
    props.locale !== undefined ||
    props.timeZone !== undefined ||
    props.direction !== undefined ||
    props.t !== undefined ||
    props.translations !== undefined;

  return hasContextOverrides ? (
    <CalendarScope {...props}>{content}</CalendarScope>
  ) : (
    content
  );
};

type EventCardContentProps<Payload> = Omit<
  EventCardProps<Payload>,
  keyof CalendarContextProps
>;
