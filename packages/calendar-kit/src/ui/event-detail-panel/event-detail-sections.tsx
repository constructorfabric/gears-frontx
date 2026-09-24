"use client";

import { CopyIcon } from "lucide-react";
import { useState } from "react";

import type {
  CalendarAttendee,
  CalendarConflict,
  CalendarEvent,
  IanaTimeZone,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import { Avatar } from "../primitives/avatar/avatar";
import { Button } from "../primitives/button/button";
import { activationKeyDown } from "./event-detail-activation";
import {
  buildRsvpSegments,
  formatEventRange,
  formatRecurrenceSummary,
  formatRsvpSegment,
  formatZoneLine,
} from "./event-detail-panel-format";

import styles from "./event-detail-panel.module.css";

export const RestrictedSection = ({
  event,
}: {
  readonly event: CalendarEvent;
}) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  return (
    <section className={styles.section} role="note">
      <h3 className={styles.sectionLabel}>{t("calendar.detail.dateTime")}</h3>
      <p className={styles.mutedText}>
        {formatEventRange(event, timeZone, locale)}
      </p>
      <p className={styles.mutedText}>{t("calendar.detail.restricted")}</p>
    </section>
  );
};

const OrganizerSection = ({ event }: { readonly event: CalendarEvent }) => {
  const { t } = useCalendarLocalization();
  const organizer = event.organizer ?? "";
  const email = event.organizerEmail ?? "";

  if (organizer === "") {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>{t("calendar.detail.organizer")}</h3>
      <div className={styles.person}>
        <Avatar
          className={styles.organizerAvatar}
          decorative
          name={organizer}
        />
        <div className={styles.personText}>
          <p className={styles.text}>{organizer}</p>
          {email === "" ? null : <p className={styles.caption}>{email}</p>}
        </div>
      </div>
    </section>
  );
};

interface ConferencingSectionProps {
  readonly canCopyJoinLink: boolean;
  readonly copyLink: () => void;
  readonly joinUrl: string;
}

const ConferencingSection = ({
  canCopyJoinLink,
  copyLink,
  joinUrl,
}: ConferencingSectionProps) => {
  const { t } = useCalendarLocalization();

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>
        {t("calendar.detail.conferencing")}
      </h3>
      {canCopyJoinLink ? (
        <div className={styles.conferencingRow}>
          <a
            className={styles.joinButton}
            href={joinUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("calendar.detail.join")}
          </a>
          <Button
            variant="tertiary"
            size="l"
            leftIcon={<CopyIcon />}
            onClick={copyLink}
            onKeyDown={activationKeyDown(copyLink)}
          >
            {t("calendar.detail.copy.link")}
          </Button>
        </div>
      ) : (
        <p className={styles.mutedText}>{joinUrl}</p>
      )}
    </section>
  );
};

interface ParticipantsSectionProps {
  readonly attendees: readonly CalendarAttendee[];
  readonly event: CalendarEvent;
  readonly participantOverflowCount: number;
  readonly visibleParticipants: readonly CalendarAttendee[];
}

const ParticipantsSection = ({
  attendees,
  event,
  participantOverflowCount,
  visibleParticipants,
}: ParticipantsSectionProps) => {
  const { t } = useCalendarLocalization();

  const [showAll, setShowAll] = useState(false);

  const rsvpSegments = buildRsvpSegments(event);

  const participants = showAll ? attendees : visibleParticipants;

  const handleShowAll = (): void => {
    setShowAll(true);
  };

  if (attendees.length === 0 && rsvpSegments.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>
        {t("calendar.detail.participants")}
      </h3>
      {participants.length > 0 && (
        <ul className={styles.avatarStack}>
          {participants.map((participant) => (
            <li key={participant.id} title={participant.displayName}>
              <Avatar
                className={styles.stackAvatar}
                name={participant.displayName}
              />
            </li>
          ))}
          {!showAll && participantOverflowCount > 0 && (
            <li>
              <button
                type="button"
                className={styles.stackOverflow}
                aria-label={`+${participantOverflowCount} ${t("calendar.detail.participants.more")}`}
                onClick={handleShowAll}
              >
                +{participantOverflowCount}
              </button>
            </li>
          )}
        </ul>
      )}
      {rsvpSegments.length > 0 && (
        <p className={styles.rsvp}>
          {rsvpSegments.map((segment, index) => (
            <span key={segment.labelKey} className={styles.rsvpSegment}>
              {index > 0 && (
                <span aria-hidden="true" className={styles.rsvpSeparator}>
                  ●
                </span>
              )}
              {formatRsvpSegment(segment, t)}
            </span>
          ))}
        </p>
      )}
    </section>
  );
};

const TimeZoneSection = ({
  comparisonTimeZone,
  event,
}: {
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly event: CalendarEvent;
}) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  if (event.allDay) {
    return null;
  }

  const zones =
    comparisonTimeZone === null || comparisonTimeZone === timeZone
      ? [timeZone]
      : [timeZone, comparisonTimeZone];

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>{t("calendar.detail.timeZone")}</h3>
      {zones.map((zone) => (
        <p key={zone} className={styles.mutedText}>
          {formatZoneLine(event, zone, locale)}
        </p>
      ))}
    </section>
  );
};

type ResponseGroup = "yes" | "maybe" | "no" | "awaiting";

const RESPONSE_GROUPS: readonly ResponseGroup[] = [
  "yes",
  "maybe",
  "no",
  "awaiting",
];

const responseGroup = (attendee: CalendarAttendee): ResponseGroup => {
  switch (attendee.response) {
    case "accepted": {
      return "yes";
    }
    case "tentative": {
      return "maybe";
    }
    case "declined": {
      return "no";
    }
    case "needs-action":
    case null:
    case undefined: {
      return "awaiting";
    }
    default: {
      return "awaiting";
    }
  }
};

const InviteeList = ({ event }: { readonly event: CalendarEvent }) => {
  const { t } = useCalendarLocalization();
  const attendees = event.attendees ?? [];
  const rsvpSegments = buildRsvpSegments(event);

  if (attendees.length === 0 && rsvpSegments.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>
        {t("calendar.detail.participants")}
      </h3>
      {attendees.length === 0 && (
        <p className={styles.rsvp}>
          {rsvpSegments
            .map((segment) => formatRsvpSegment(segment, t))
            .join(" · ")}
        </p>
      )}
      {RESPONSE_GROUPS.map((group) => {
        const members = attendees.filter(
          (attendee) => responseGroup(attendee) === group
        );

        if (members.length === 0) {
          return null;
        }

        return (
          <div key={group} className={styles.inviteeGroup}>
            <p className={styles.caption}>
              {formatRsvpSegment(
                {
                  count: members.length,
                  labelKey: `calendar.detail.rsvp.${group}`,
                },
                t
              )}
            </p>
            <ul className={styles.invitees}>
              {members.map((attendee) => (
                <li key={attendee.id} className={styles.person}>
                  <Avatar
                    className={styles.stackAvatar}
                    decorative
                    name={attendee.displayName}
                  />
                  <div className={styles.personText}>
                    <p className={styles.text}>{attendee.displayName}</p>
                    {(attendee.email ?? "") === "" ? null : (
                      <p className={styles.caption}>{attendee.email}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
};

const renderConflictDetail = (conflict: CalendarConflict) => (
  <>
    <span className={styles.conflictDimension}>{conflict.dimension}</span>
    <span className={styles.conflictLabel}>{conflict.label}</span>
    {typeof conflict.message === "string" && (
      <span className={styles.conflictMessage}>{conflict.message}</span>
    )}
  </>
);

export interface DefaultDetailProps {
  readonly canCopyJoinLink: boolean;
  /** Two columns: details on the start side, the full invitee list on the end side. */
  readonly expanded: boolean;
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly copyLink: () => void;
  readonly event: CalendarEvent;
  readonly joinUrl: string | undefined;
  readonly participantOverflowCount: number;
  readonly visibleParticipants: readonly CalendarAttendee[];
}

const DetailSections = ({
  canCopyJoinLink,
  comparisonTimeZone,
  copyLink,
  event,
  expanded,
  joinUrl,
  participantOverflowCount,
  visibleParticipants,
}: DefaultDetailProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const recurrenceSummary = formatRecurrenceSummary(event, t);
  const conflicts = event.conflicts ?? [];
  const location = event.location ?? "";
  const description = event.description ?? "";

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>{t("calendar.detail.dateTime")}</h3>
        <p className={styles.mutedText}>
          {formatEventRange(event, timeZone, locale)}
        </p>
        {recurrenceSummary !== undefined && (
          <p className={styles.mutedText}>{recurrenceSummary}</p>
        )}
      </section>
      {location !== "" && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>
            {t("calendar.detail.location")}
          </h3>
          <p className={styles.mutedText}>{location}</p>
        </section>
      )}
      <OrganizerSection event={event} />
      {joinUrl !== undefined && (
        <ConferencingSection
          canCopyJoinLink={canCopyJoinLink}
          copyLink={copyLink}
          joinUrl={joinUrl}
        />
      )}
      {expanded ? null : (
        <ParticipantsSection
          key={event.id}
          attendees={event.attendees ?? []}
          event={event}
          participantOverflowCount={participantOverflowCount}
          visibleParticipants={visibleParticipants}
        />
      )}
      {conflicts.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>
            {t("calendar.detail.conflicts")}
          </h3>
          <ConflictIndicator
            className={styles.conflicts}
            conflicts={conflicts}
            renderConflict={renderConflictDetail}
          />
        </section>
      )}
      <hr className={styles.divider} />
      <TimeZoneSection comparisonTimeZone={comparisonTimeZone} event={event} />
      {description !== "" && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>
            {t("calendar.detail.description")}
          </h3>
          <p className={styles.mutedText}>{description}</p>
        </section>
      )}
    </>
  );
};

export const DefaultDetail = (props: DefaultDetailProps) => {
  if (!props.expanded) {
    return <DetailSections {...props} />;
  }

  return (
    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        <DetailSections {...props} />
      </div>
      <aside className={styles.sideColumn}>
        <InviteeList event={props.event} />
      </aside>
    </div>
  );
};
