"use client";
// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-slots:p1

import { clsx } from "clsx";
import {
  Maximize2Icon,
  Minimize2Icon,
  PencilLineIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import type { CalendarEvent, IanaTimeZone } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useEventDetailPanelController } from "../../react/controllers/use-event-detail-panel-controller";
import { Button } from "../primitives/button/button";
import { Dialog, DialogContent } from "../primitives/dialog/dialog";
import { Popover } from "../primitives/popover/popover";
import { activationKeyDown } from "./event-detail-activation";
import { resolveCopyAnnouncement } from "./event-detail-panel-format";
import { DefaultDetail, RestrictedSection } from "./event-detail-sections";

import styles from "./event-detail-panel.module.css";

export interface EventDetailPanelProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Controlled open state. */
  readonly open?: boolean;
  /** Initial open state when uncontrolled. */
  readonly defaultOpen?: boolean;
  /** Called when the panel opens or closes. */
  readonly onOpenChange?: (open: boolean) => void;
  /** The event to show. */
  readonly event?: CalendarEvent | null;
  /** Id of the selected event, for host bookkeeping. */
  readonly selectedEventId?: string | null;
  /** Called by the close button, Escape and an outside press. */
  readonly onClose: () => void;
  /** Shows the edit button. Hidden when `readOnly` or the event is busy. */
  readonly onEdit?: (event: CalendarEvent) => void;
  /** Shows the delete button. Hidden when `readOnly` or the event is busy. */
  readonly onDelete?: (event: CalendarEvent) => void;
  /** Adds a second line with the event time in this zone. */
  readonly comparisonTimeZone?: IanaTimeZone | null;
  /** Hides edit and delete. */
  readonly readOnly?: boolean;
  /** Portal target for the popover or dialog, for example a node inside a shadow root. */
  readonly container?: Element | DocumentFragment;
  /** Opens the detail as a popover beside this element, usually the card from `onEventSelect`. */
  readonly anchorElement?: HTMLElement | null;
  /** Avatars shown before the `+N` control. Default `6`. */
  readonly maxVisibleParticipants?: number;
  /** Content below the header row. */
  readonly renderHeader?: (event: CalendarEvent | null) => ReactNode;
  /** Replaces the whole default body. */
  readonly renderBody?: (event: CalendarEvent) => ReactNode;
  /** Host rows appended to the body. */
  readonly renderMetadata?: (event: CalendarEvent) => ReactNode;
  /** Replaces the edit and delete buttons. */
  readonly renderActions?: (event: CalendarEvent) => ReactNode;
  /** Content below the body, for example RSVP controls. */
  readonly renderFooter?: (event: CalendarEvent) => ReactNode;
}

const isSet = <T,>(value: T | null | undefined): value is NonNullable<T> =>
  (value ?? null) !== null;

// Another card switches the preview instead of dismissing it.
const isEventCard = (target: EventTarget): boolean =>
  target instanceof HTMLElement && target.dataset.eventId !== undefined;

interface EventDetailPanelHeaderProps {
  readonly canDelete: boolean;
  readonly canEdit: boolean;
  readonly event: CalendarEvent | null;
  readonly expanded: boolean;
  readonly onClose: () => void;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
  readonly onToggleExpanded: (() => void) | null;
  readonly renderActions?: (event: CalendarEvent) => ReactNode;
  readonly title: string;
}

const EventDetailPanelHeader = ({
  canDelete,
  canEdit,
  event,
  expanded,
  onClose,
  onDelete,
  onEdit,
  onToggleExpanded,
  renderActions,
  title,
}: EventDetailPanelHeaderProps) => {
  const { t } = useCalendarLocalization();

  const hostActions =
    event !== null && isSet(renderActions) ? renderActions(event) : null;

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.headerActions}>
        {hostActions}
        {hostActions === null && canEdit && (
          <Button
            onlyIcon
            variant="secondary"
            size="l"
            leftIcon={<PencilLineIcon />}
            aria-label={t("calendar.detail.edit")}
            onClick={onEdit}
            onKeyDown={activationKeyDown(onEdit)}
          />
        )}
        {hostActions === null && canDelete && (
          <Button
            onlyIcon
            variant="danger"
            size="l"
            leftIcon={<Trash2Icon />}
            aria-label={t("calendar.detail.delete")}
            onClick={onDelete}
            onKeyDown={activationKeyDown(onDelete)}
          />
        )}
        {onToggleExpanded !== null && (
          <Button
            onlyIcon
            variant="ghost"
            size="l"
            leftIcon={expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            aria-label={t(
              expanded ? "calendar.detail.collapse" : "calendar.detail.expand"
            )}
            onClick={onToggleExpanded}
          />
        )}
        <Button
          onlyIcon
          variant="ghost"
          size="l"
          leftIcon={<XIcon />}
          aria-label={t("calendar.detail.close")}
          onClick={onClose}
          onKeyDown={activationKeyDown(onClose)}
        />
      </div>
    </div>
  );
};

type EventDetailPanelController = ReturnType<
  typeof useEventDetailPanelController
>;

interface EventDetailPanelBodyProps {
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly controller: EventDetailPanelController;
  readonly event: CalendarEvent;
  readonly expanded: boolean;
  readonly renderBody?: (event: CalendarEvent) => ReactNode;
  readonly renderMetadata?: (event: CalendarEvent) => ReactNode;
}

const EventDetailPanelBody = ({
  comparisonTimeZone,
  controller,
  event,
  expanded,
  renderBody,
  renderMetadata,
}: EventDetailPanelBodyProps) => {
  if (controller.isRestricted) {
    return (
      <div className={styles.body}>
        <RestrictedSection event={event} />
      </div>
    );
  }

  return (
    <div className={styles.body}>
      {isSet(renderBody) ? (
        <div className={styles.slot}>{renderBody(event)}</div>
      ) : (
        <DefaultDetail
          canCopyJoinLink={controller.canCopyJoinLink}
          comparisonTimeZone={comparisonTimeZone}
          copyLink={controller.copyLink}
          event={event}
          expanded={expanded}
          joinUrl={event.joinUrl ?? undefined}
          participantOverflowCount={controller.participantOverflowCount}
          visibleParticipants={controller.visibleParticipants}
        />
      )}
      {isSet(renderMetadata) && (
        <div className={styles.slot}>{renderMetadata(event)}</div>
      )}
    </div>
  );
};

const CopyStatus = ({
  announcement,
  failed,
}: {
  readonly announcement: string;
  readonly failed: boolean;
}) =>
  announcement === "" ? null : (
    <p
      role="status"
      aria-label={announcement}
      className={clsx(styles.copyStatus, failed && styles.copyStatusError)}
    >
      {announcement}
    </p>
  );

type EventDetailPanelContentProps = Omit<
  EventDetailPanelProps,
  keyof CalendarContextProps
>;

const EventDetailPanelContent = (props: EventDetailPanelContentProps) => {
  const { direction, t } = useCalendarLocalization();

  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
  const controller = useEventDetailPanelController(props);

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const {
    event,
    comparisonTimeZone = null,
    anchorElement = null,
    className,
    container,
    renderHeader,
    renderBody,
    renderMetadata,
    renderActions,
    renderFooter,
  } = props;

  const eventValue = event ?? null;
  const eventId = eventValue?.id ?? null;

  if (!controller.isOpen) {
    return null;
  }

  const title =
    eventValue !== null && eventValue.title.trim() !== ""
      ? eventValue.title
      : t("calendar.detail.title");

  const copyAnnouncement = resolveCopyAnnouncement(controller.copyStatus, t);
  const expanded = anchorElement === null || expandedEventId === eventId;

  const close = (): void => {
    controller.close();
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      controller.close();
    }
  };

  const content = (
    <div dir={direction} className={styles.content}>
      <EventDetailPanelHeader
        canDelete={controller.canDelete}
        canEdit={controller.canEdit}
        event={eventValue}
        expanded={expanded}
        onClose={close}
        onDelete={controller.handleDelete}
        onEdit={controller.handleEdit}
        onToggleExpanded={
          anchorElement === null
            ? null
            : () => {
                setExpandedEventId(expanded ? null : eventId);
              }
        }
        renderActions={controller.isRestricted ? undefined : renderActions}
        title={title}
      />
      {isSet(renderHeader) && (
        <div className={styles.headerSlot}>{renderHeader(eventValue)}</div>
      )}
      {eventValue !== null && (
        <EventDetailPanelBody
          comparisonTimeZone={comparisonTimeZone}
          controller={controller}
          event={eventValue}
          expanded={expanded}
          renderBody={renderBody}
          renderMetadata={renderMetadata}
        />
      )}
      {eventValue !== null && isSet(renderFooter) && (
        <div className={styles.footerSlot}>{renderFooter(eventValue)}</div>
      )}
      <CopyStatus
        announcement={copyAnnouncement}
        failed={controller.copyStatus === "error"}
      />
    </div>
  );

  if (!expanded && anchorElement !== null) {
    return (
      <Popover
        open
        onOpenChange={handleOpenChange}
        anchorRect={anchorElement.getBoundingClientRect()}
        anchorRectProvider={() => anchorElement.getBoundingClientRect()}
        anchorElement={anchorElement}
        belongsTo={isEventCard}
        placement="inline"
        label={title}
        container={container}
        className={clsx(styles.popover, className)}
      >
        {content}
      </Popover>
    );
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        container={container}
        dir={direction}
        label={title}
        showBackdrop={false}
        showCloseButton={false}
        className={clsx(styles.expanded, className)}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

export const EventDetailPanel = (props: EventDetailPanelProps) => (
  <CalendarScope {...props}>
    <EventDetailPanelContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
