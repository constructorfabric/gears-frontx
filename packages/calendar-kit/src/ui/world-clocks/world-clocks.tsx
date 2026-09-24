"use client";

import { clsx } from "clsx";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilLineIcon,
  XIcon,
} from "lucide-react";
import { Activity } from "react";
import type { ReactNode } from "react";

import type {
  CalendarWorldClock,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import {
  CLOCK_MOVE,
  useWorldClocksController,
} from "../../react/controllers/use-world-clocks-controller";
import type { ClockMove } from "../../react/controllers/use-world-clocks-controller";
import { useControlledValue } from "../../react/hooks/use-controlled-value";
import { Button } from "../primitives/button/button";
import { Select } from "../primitives/select/select";
import { Tag } from "../primitives/tag/tag";
import { commitAddPickerValue, timeZoneLabel } from "./time-zone-labels";

import styles from "./world-clocks.module.css";

export interface WorldClocksProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Controlled ordered clock zones. */
  readonly timeZoneIds?: readonly IanaTimeZone[];
  /** Initial clock zones when uncontrolled. */
  readonly defaultTimeZoneIds?: readonly IanaTimeZone[];
  /** Zones the add picker offers. */
  readonly availableTimeZoneIds: readonly IanaTimeZone[];
  /** Pins every clock to one instant. Omit and the clocks tick each minute. */
  readonly now?: UtcInstant;
  /** Called with the full ordered list after an add, remove or move. */
  readonly onChange: (timeZoneIds: readonly IanaTimeZone[]) => void;
  /** Replaces a clock row's content. */
  readonly renderClock?: (clock: CalendarWorldClock) => ReactNode;
  /** Replaces the edit controls. */
  readonly renderEditor?: (
    available: readonly IanaTimeZone[],
    selected: readonly IanaTimeZone[]
  ) => ReactNode;
}

const ClockEditControls = ({
  clock,
  isFirst,
  isLast,
  onMove,
  onRemove,
}: ClockEditControlsProps) => {
  const { t } = useCalendarLocalization();

  return (
    <span className={styles.controls}>
      <Button
        aria-label={`${t("calendar.panel.worldClocksMoveUp")} ${clock.city}`}
        className={styles.control}
        disabled={isFirst}
        leftIcon={<ChevronUpIcon aria-hidden="true" />}
        onlyIcon
        size="sm"
        variant="ghost"
        onClick={() => {
          onMove(clock.timeZoneId, CLOCK_MOVE.earlier);
        }}
      />
      <Button
        aria-label={`${t("calendar.panel.worldClocksMoveDown")} ${clock.city}`}
        className={styles.control}
        disabled={isLast}
        leftIcon={<ChevronDownIcon aria-hidden="true" />}
        onlyIcon
        size="sm"
        variant="ghost"
        onClick={() => {
          onMove(clock.timeZoneId, CLOCK_MOVE.later);
        }}
      />
      <Button
        aria-label={`${t("calendar.panel.worldClocksRemove")} ${clock.city}`}
        className={styles.control}
        leftIcon={<XIcon aria-hidden="true" />}
        onlyIcon
        size="sm"
        variant="ghost"
        onClick={() => {
          onRemove(clock.timeZoneId);
        }}
      />
    </span>
  );
};

const WorldClocksContent = ({
  availableTimeZoneIds,
  className,
  defaultTimeZoneIds,
  now,
  onChange,
  renderClock,
  renderEditor,
  timeZoneIds,
}: WorldClocksContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const selected = useControlledValue<readonly IanaTimeZone[]>({
    defaultValue: defaultTimeZoneIds ?? [],
    onChange,
    value: timeZoneIds,
  });

  const controller = useWorldClocksController({
    availableTimeZoneIds,
    locale,
    now,
    onChange: selected.setValue,
    timeZoneIds: selected.value,
  });

  const selectedIds = controller.clocks.map((clock) => clock.timeZoneId);
  const showCustomEditor = controller.editing && !!renderEditor;
  const addableIds = new Set(controller.addableTimeZoneIds);

  const handleAddValue = (value: string): void => {
    commitAddPickerValue(
      value,
      controller.addableTimeZoneIds,
      controller.addClock
    );
  };

  return (
    <section
      aria-label={t("calendar.panel.worldClocks")}
      className={clsx(styles.root, className)}
      dir={direction}
    >
      <header className={styles.header}>
        <h3 className={styles.heading}>{t("calendar.panel.worldClocks")}</h3>
        <Button
          aria-label={t(
            controller.editing
              ? "calendar.panel.worldClocksDone"
              : "calendar.panel.worldClocksEdit"
          )}
          aria-pressed={controller.editing}
          className={styles.edit}
          leftIcon={
            controller.editing ? (
              <CheckIcon aria-hidden="true" />
            ) : (
              <PencilLineIcon aria-hidden="true" />
            )
          }
          onlyIcon
          size="sm"
          variant="ghost"
          onClick={() => {
            controller.toggleEditing();
          }}
        />
      </header>
      <Activity mode={showCustomEditor ? "visible" : "hidden"}>
        {renderEditor?.(controller.availableTimeZoneIds, selectedIds)}
      </Activity>
      <Activity mode={showCustomEditor ? "hidden" : "visible"}>
        {controller.clocks.length > 0 && (
          <ul className={styles.list}>
            {controller.clocks.map((clock, index) => (
              <li className={styles.row} key={clock.timeZoneId}>
                <span className={styles.clockContent}>
                  {renderClock === undefined ? (
                    <>
                      <span className={styles.city}>{clock.city}</span>
                      {!controller.editing && (
                        <Tag className={styles.value} color="neutral" size="m">
                          {`${clock.time} ${clock.offset}`}
                        </Tag>
                      )}
                    </>
                  ) : (
                    renderClock(clock)
                  )}
                </span>
                {controller.editing && (
                  <ClockEditControls
                    clock={clock}
                    isFirst={index === 0}
                    isLast={index === controller.clocks.length - 1}
                    onMove={(timeZoneId, move) => {
                      controller.moveClock(timeZoneId, move);
                    }}
                    onRemove={(timeZoneId) => {
                      controller.removeClock(timeZoneId);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {controller.editing && controller.addableTimeZoneIds.length > 0 && (
          <Select
            aria-label={t("calendar.panel.worldClocksAdd")}
            className={styles.addSelect}
            options={controller.availableTimeZoneIds.map((timeZoneId) => ({
              disabled: !addableIds.has(timeZoneId),
              label: timeZoneLabel(timeZoneId, t),
              value: timeZoneId,
            }))}
            placeholder={t("calendar.panel.worldClocksAdd")}
            onValueChange={handleAddValue}
          />
        )}
      </Activity>
    </section>
  );
};

export const WorldClocks = (props: WorldClocksProps) => (
  <CalendarScope {...props}>
    <WorldClocksContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type WorldClocksContentProps = Omit<
  WorldClocksProps,
  keyof CalendarContextProps
>;

interface ClockEditControlsProps {
  readonly clock: CalendarWorldClock;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onMove: (timeZoneId: IanaTimeZone, move: ClockMove) => void;
  readonly onRemove: (timeZoneId: IanaTimeZone) => void;
}
