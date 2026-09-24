"use client";

import { clsx } from "clsx";
import {
  ChevronLeftIcon,
  ArrowRightIcon,
  Clock3Icon,
  Globe2Icon,
  Link2Icon,
  MapPinIcon,
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import type * as React from "react";
import { createPortal } from "react-dom";

import type {
  CalendarColorFamily,
  CalendarDate,
  CalendarRef,
  CreateEventDraft,
  UtcInstant,
  Weekday,
} from "../../core/model";
import { addCalendarDays } from "../../core/temporal";
import { parseLocalTime } from "../../core/validation";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import type {
  CalendarResourceOption,
  CreateEventSubmitError,
  UseCreateEventControllerOptions,
  useCreateEventController,
} from "../../react/controllers/use-create-event-controller";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../primitives/alert-dialog/alert-dialog";
import { Button } from "../primitives/button/button";
import { Combobox } from "../primitives/combobox/combobox";
import type { ComboboxOption } from "../primitives/combobox/combobox";
import { DateField as KitDateField } from "../primitives/date-field/date-field";
import { Dialog, DialogContent } from "../primitives/dialog/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../primitives/field/field";
import { noopCleanup } from "../primitives/global-event-listener";
import { Input } from "../primitives/input/input";
import { Popover } from "../primitives/popover/popover";
import { Radio, RadioGroup } from "../primitives/radio/radio";
import { Select } from "../primitives/select/select";
import { Separator } from "../primitives/separator/separator";
import { Textarea } from "../primitives/textarea/textarea";
import { Toggle } from "../primitives/toggle/toggle";
import {
  createDefaultAnchorRect,
  dateRangeDayCount,
  weekdayLabel,
  REPEAT_UNIT,
} from "./create-event-format";
import type {
  CustomRepeatState,
  RepeatEndKind,
  RepeatPreset,
  RepeatUnit,
} from "./create-event-format";
import type { createEventErrorMessages } from "./create-event-validation";
import {
  resolveRepeatUnit,
  useCreateEventPopoverContent,
} from "./use-create-event-popover-content";

import styles from "./create-event.module.css";

const WHITESPACE_PATTERN = /\s+/u;
const SUBMIT_ERROR_ID = "calendar.create_event.submitError";

export type { CalendarResourceOption } from "../../react/controllers/use-create-event-controller";

export interface CreateEventPopoverProps
  extends
    CalendarContextProps,
    Omit<UseCreateEventControllerOptions, "timeZone"> {
  /** Class added to the component root. */
  readonly className?: string;
  /** Calendars offered in the schedule field. */
  readonly calendars: readonly CalendarRef[];
  /** Reference instant for the time-zone offset label. */
  readonly now?: UtcInstant;
  /** People offered in the people combobox. */
  readonly people: readonly CalendarResourceOption[];
  /** Locations offered in the location combobox. */
  readonly locations: readonly CalendarResourceOption[];
  /** Conferencing providers offered in the conferencing select. */
  readonly conferencingProviders: readonly CalendarResourceOption[];
  /** Content added below the header row. */
  readonly renderHeader?: () => ReactNode;
  /** Extra host fields rendered after the kit's fields. */
  readonly renderFields?: () => ReactNode;
  /** Content added above the Cancel/Save row. */
  readonly renderFooter?: () => ReactNode;
  /** Screen rectangle to place the compact popover beside, for example the quick-create cell. */
  readonly anchorRect?: DOMRect;
  /** Element to place the compact popover beside. Wins over `anchorRect`. */
  readonly anchorRef?: RefObject<HTMLElement | null>;
  /** Replaces how a submit error is shown. */
  readonly renderError?: (error: CreateEventSubmitError) => ReactNode;
  /** Wraps the compact form content in a host-owned shell instead of the kit popover. */
  readonly renderCompactShell?: (content: ReactNode) => ReactNode;
  /** Wraps the expanded form content in a host-owned shell instead of the kit dialog. */
  readonly renderExpandedShell?: (content: ReactNode) => ReactNode;
}

export interface ResourceItem {
  readonly value: string;
  readonly label: string;
  readonly dividerAfter?: boolean;
}

interface CustomRepeatViewProps {
  readonly idPrefix: string;
  readonly state: CustomRepeatState;
  readonly onChangeInterval: (value: string) => void;
  readonly onChangeUnit: (unit: RepeatUnit) => void;
  readonly onChangeEndKind: (kind: RepeatEndKind) => void;
  readonly onChangeEndDate: (value: CalendarDate | "") => void;
  readonly onToggleWeekday: (weekday: Weekday) => void;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onClose: () => void;
  readonly onApply: () => void;
}

interface DraftChangeProps {
  readonly draft: CreateEventDraft;
  readonly setDraft: (draft: CreateEventDraft) => void;
}

interface FormHeaderProps {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly renderHeader?: () => ReactNode;
  readonly titleId: string;
}

interface FormFooterProps {
  readonly formId: string;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
  readonly onCancel: () => void;
  readonly renderFooter?: () => ReactNode;
}

interface DateFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: CalendarDate | "";
  readonly disabled: boolean;
  readonly invalid?: boolean;
  readonly errorId?: string;
  readonly errorMessage?: string | null;
  readonly className?: string;
  readonly defaultMonthDate?: CalendarDate;
  readonly clearable?: boolean;
  readonly compact?: boolean;
  readonly onChange: (value: CalendarDate | "") => void;
}

interface TimeFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly invalid?: boolean;
  readonly errorId?: string;
  readonly errorMessage?: string | null;
  readonly className?: string;
  readonly onChange: (value: string) => void;
}

interface DiscardDialogProps {
  readonly container: Element | DocumentFragment;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

const REPEAT_DISPLAY_WEEKDAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const resolvePortalContainer = (
  element: HTMLSpanElement
): Element | DocumentFragment | null => {
  const root = element.getRootNode();

  // The shadow root is the stacking context; the anchor's parent would clip the panel.
  if (root instanceof ShadowRoot) {
    return root;
  }

  return element.parentElement;
};

const CALENDAR_COLOR_CLASSES: ReadonlyMap<string, string> = new Map([
  ["turquoise", styles.calendarColorTurquoise],
  ["purple", styles.calendarColorPurple],
  ["magenta", styles.calendarColorPurple],
  ["orange", styles.calendarColorOrange],
  ["green", styles.calendarColorGreen],
  ["blue", styles.calendarColorBlue],
  ["pink", styles.calendarColorPink],
]);

const calendarColorClass = (
  colorFamily: CalendarColorFamily
): string | undefined => CALENDAR_COLOR_CLASSES.get(colorFamily);

const resolveAnchorRect = (
  anchorRef: CreateEventPopoverProps["anchorRef"],
  anchorRect: DOMRect | undefined
): DOMRect =>
  anchorRef?.current?.getBoundingClientRect() ??
  anchorRect ??
  createDefaultAnchorRect();

const REPEAT_INTERVAL_OPTIONS: readonly ResourceItem[] = Array.from(
  { length: 30 },
  (_, index) => {
    const value = String(index + 1);

    return { label: value, value };
  }
);

const resolveRepeatEndKind = (value: string): RepeatEndKind =>
  value === "on" ? "on" : "never";

const repeatUnitOptions = (t: CalendarTranslate): readonly ResourceItem[] => [
  {
    label: t("calendar.create_event.repeat.unit.day"),
    value: REPEAT_UNIT.day,
  },
  {
    label: t("calendar.create_event.repeat.unit.week"),
    value: REPEAT_UNIT.week,
  },
  {
    label: t("calendar.create_event.repeat.unit.month"),
    value: REPEAT_UNIT.month,
  },
];

const updateDateField = (
  field: "startDate" | "endDate",
  value: CalendarDate | "",
  { draft, setDraft }: DraftChangeProps
): void => {
  if (value === "") {
    if (field === "endDate") {
      setDraft({ ...draft, endDate: null });
    }

    return;
  }

  setDraft(
    field === "startDate"
      ? { ...draft, startDate: value }
      : { ...draft, endDate: value }
  );
};

const updateTimeField = (
  field: "startTime" | "endTime",
  value: string,
  { draft, setDraft }: DraftChangeProps
): void => {
  if (draft.allDay) {
    return;
  }

  if (value === "") {
    if (field === "endTime") {
      setDraft({ ...draft, endTime: null });
    }

    return;
  }

  try {
    const time = parseLocalTime(value);

    setDraft(
      field === "startTime"
        ? { ...draft, startTime: time }
        : { ...draft, endTime: time }
    );
  } catch {
    // Wait for the next valid edit.
  }
};

const getActiveElement = (element: Element | null): HTMLElement | null => {
  if (element === null) {
    return null;
  }

  const root = element.getRootNode();

  const active =
    root instanceof ShadowRoot ? root.activeElement : document.activeElement;

  return active instanceof HTMLElement ? active : null;
};

const FormHeader = ({
  expanded,
  onToggle,
  onClose,
  renderHeader,
  titleId,
}: FormHeaderProps) => {
  const { t } = useCalendarLocalization();
  const titleKey = "calendar.event.type.default";
  const title = t(titleKey);

  const actions = (
    <div className={styles.headerActions}>
      <Button
        aria-label={
          expanded
            ? t("calendar.create_event.collapse")
            : t("calendar.create_event.expand")
        }
        leftIcon={
          expanded ? (
            <Minimize2Icon aria-hidden="true" />
          ) : (
            <Maximize2Icon aria-hidden="true" />
          )
        }
        onlyIcon
        size="m"
        type="button"
        variant="ghost"
        onClick={onToggle}
      />
      <Button
        aria-label={t("calendar.create_event.close")}
        leftIcon={<XIcon aria-hidden="true" />}
        onlyIcon
        size="m"
        type="button"
        variant="ghost"
        onClick={onClose}
      />
    </div>
  );

  return (
    <div className={styles.header}>
      <div className={styles.heading}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {renderHeader?.()}
        {actions}
      </div>
      <Separator decorative className={styles.headerDivider} />
    </div>
  );
};

const FormFooter = ({
  formId,
  isSubmitting,
  canSubmit,
  onCancel,
  renderFooter,
}: FormFooterProps) => {
  const { t } = useCalendarLocalization();

  return (
    <div className={styles.footer}>
      <Separator decorative className={styles.footerDivider} />
      <div className={styles.footerActions}>
        {renderFooter?.()}
        <Button
          type="button"
          variant="secondary"
          size="l"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t("calendar.create_event.cancel")}
        </Button>
        <Button
          type="submit"
          size="l"
          form={formId}
          loading={isSubmitting}
          disabled={!canSubmit}
        >
          {isSubmitting
            ? t("calendar.create_event.saving")
            : t("calendar.create_event.save")}
        </Button>
      </div>
    </div>
  );
};

const DateField = ({
  id,
  label,
  value,
  disabled,
  invalid = false,
  errorId,
  errorMessage,
  className,
  defaultMonthDate,
  clearable = false,
  compact = false,
  onChange,
}: DateFieldProps) => {
  const { locale } = useCalendarLocalization();

  return (
    <Field className={clsx(styles.field, className)}>
      <FieldLabel htmlFor={id} className={styles.visuallyHidden}>
        {label}
      </FieldLabel>
      <KitDateField
        id={id}
        locale={locale}
        value={value}
        disabled={disabled}
        invalid={invalid}
        size={compact ? "m" : "xl"}
        defaultMonthDate={defaultMonthDate}
        clearable={clearable}
        aria-describedby={errorId}
        className={styles.control}
        onValueChange={onChange}
      />
      {invalid && errorId !== undefined ? (
        <FieldError id={errorId} role="status">
          {errorMessage}
        </FieldError>
      ) : null}
    </Field>
  );
};

const TimeField = ({
  id,
  label,
  value,
  disabled,
  invalid = false,
  errorId,
  errorMessage,
  className,
  onChange,
}: TimeFieldProps) => (
  <Field className={clsx(styles.field, className)}>
    <FieldLabel htmlFor={id} className={styles.visuallyHidden}>
      {label}
    </FieldLabel>
    <Input
      id={id}
      type="time"
      size="xl"
      value={value}
      placeholder={label}
      disabled={disabled}
      invalid={invalid}
      aria-describedby={errorId}
      className={styles.control}
      iconLeft={<Clock3Icon aria-hidden="true" />}
      onValueChange={onChange}
    />
    {invalid && errorId !== undefined ? (
      <FieldError id={errorId} role="status">
        {errorMessage}
      </FieldError>
    ) : null}
  </Field>
);

const CustomRepeatView = ({
  idPrefix,
  state,
  onChangeInterval,
  onChangeUnit,
  onChangeEndKind,
  onChangeEndDate,
  onToggleWeekday,
  expanded,
  onToggleExpanded,
  onClose,
  onApply,
}: CustomRepeatViewProps) => {
  const { t } = useCalendarLocalization();
  const intervalId = `${idPrefix}-repeat-interval`;
  const unitId = `${idPrefix}-repeat-unit`;
  const endGroupName = `${idPrefix}-repeat-end`;
  const unitItems = repeatUnitOptions(t);
  const endsLabel = t("calendar.create_event.repeat.ends");
  const neverLabel = t("calendar.create_event.repeat.never");
  const onLabel = t("calendar.create_event.repeat.on_date");

  return (
    <div className={styles.repeatView} data-testid="create-event-repeat-view">
      <div className={styles.repeatHeader}>
        <Button
          aria-label={t("calendar.create_event.back")}
          leftIcon={<ChevronLeftIcon aria-hidden="true" />}
          onlyIcon
          round
          size="m"
          type="button"
          variant="ghost"
          onClick={onApply}
        />
        <h2 className={styles.repeatTitle}>
          {t("calendar.create_event.field.repeat")}
        </h2>
        <div className={styles.headerActions}>
          <Button
            aria-label={t(
              expanded
                ? "calendar.create_event.collapse"
                : "calendar.create_event.expand"
            )}
            leftIcon={
              expanded ? (
                <Minimize2Icon aria-hidden="true" />
              ) : (
                <Maximize2Icon aria-hidden="true" />
              )
            }
            onlyIcon
            size="m"
            type="button"
            variant="ghost"
            onClick={onToggleExpanded}
          />
          <Button
            aria-label={t("calendar.create_event.close")}
            leftIcon={<XIcon aria-hidden="true" />}
            onlyIcon
            size="m"
            type="button"
            variant="ghost"
            onClick={onClose}
          />
        </div>
      </div>
      <Separator decorative className={styles.headerDivider} />
      <FieldGroup className={styles.customBody}>
        <div className={styles.repeatIntervalRow}>
          <span className={styles.repeatInlineLabel}>
            {t("calendar.create_event.repeat.every")}
          </span>
          <Select
            id={intervalId}
            aria-label={t("calendar.create_event.repeat.every")}
            options={REPEAT_INTERVAL_OPTIONS}
            value={String(state.interval)}
            size="m"
            showSelectedCheck
            className={styles.repeatInterval}
            onValueChange={onChangeInterval}
          />
          <Select
            id={unitId}
            aria-label={t("calendar.create_event.repeat.unit_label", {
              count: state.interval,
              unit: t(`calendar.create_event.repeat.unit.${state.unit}`),
            })}
            options={unitItems}
            value={state.unit}
            size="m"
            showSelectedCheck
            className={styles.repeatUnit}
            onValueChange={(value) => {
              onChangeUnit(resolveRepeatUnit(value));
            }}
          />
        </div>
        {/* A legend cannot flex, so this span labels the group. */}
        <div
          className={styles.weekdays}
          role="group"
          aria-labelledby={`${idPrefix}-repeat-on-label`}
        >
          <span
            className={styles.repeatInlineLabel}
            id={`${idPrefix}-repeat-on-label`}
          >
            {t("calendar.create_event.repeat.onWeekdays")}
          </span>
          <div className={styles.weekdayButtons}>
            {REPEAT_DISPLAY_WEEKDAYS.map((weekday) => {
              const label = weekdayLabel(weekday, t);
              const shortLabel = label.slice(0, 2);
              const selected = state.byDay.includes(weekday);

              return (
                <Button
                  key={weekday}
                  type="button"
                  variant="tertiary"
                  size="s"
                  selected={selected}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => {
                    onToggleWeekday(weekday);
                  }}
                >
                  {shortLabel}
                </Button>
              );
            })}
          </div>
        </div>
        <FieldSet className={styles.ends}>
          <FieldLegend>{endsLabel}</FieldLegend>
          <RadioGroup
            aria-label={endsLabel}
            className={styles.endOptions}
            name={endGroupName}
            value={state.endKind}
            onValueChange={(value) => {
              onChangeEndKind(resolveRepeatEndKind(value));
            }}
          >
            <Radio value="never" label={neverLabel} />
            <Radio value="on" label={onLabel} />
          </RadioGroup>
          {state.endKind === "on" ? (
            <DateField
              id={`${idPrefix}-repeat-end-date`}
              label={t("calendar.create_event.field.end_date")}
              value={state.endDate ?? ""}
              disabled={false}
              className={styles.repeatEndDate}
              compact
              onChange={onChangeEndDate}
            />
          ) : null}
        </FieldSet>
      </FieldGroup>
    </div>
  );
};

const DiscardDialog = ({
  container,
  open,
  onClose,
  onConfirm,
}: DiscardDialogProps) => {
  const { t } = useCalendarLocalization();

  return (
    <>
      {open
        ? createPortal(
            <div aria-hidden="true" className={styles.discardBackdrop} />,
            container
          )
        : null}
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
      >
        <AlertDialogContent
          container={container}
          showBackdrop={false}
          className={styles.discardDialog}
        >
          <AlertDialogHeader className={styles.discardHeader}>
            <AlertDialogTitle className={styles.discardTitle}>
              {t("calendar.create_event.discard.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className={styles.discardDescription}>
              {t("calendar.create_event.discard.message")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={styles.discardFooter}>
            <AlertDialogCancel
              className={styles.discardCancel}
              onClick={onClose}
            >
              {t("calendar.create_event.discard.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={styles.discardAction}
              onClick={onConfirm}
            >
              {t("calendar.create_event.discard.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

interface CalendarColorDotProps {
  readonly colorFamily: CalendarColorFamily;
  readonly testId?: string;
}

const CalendarColorDot = ({ colorFamily, testId }: CalendarColorDotProps) => (
  <span
    aria-hidden="true"
    data-calendar-color={colorFamily}
    data-testid={testId}
    className={clsx(styles.calendarColorDot, calendarColorClass(colorFamily))}
  />
);

interface SubmitErrorProps {
  readonly error: CreateEventSubmitError | null;
  readonly errorId: string;
  readonly renderError: CreateEventPopoverProps["renderError"];
}

const SubmitError = ({
  error,
  errorId,
  renderError,
}: SubmitErrorProps): ReactNode => {
  const { t } = useCalendarLocalization();

  if (error === null) {
    return null;
  }

  const errorMessage = error.message ?? t(SUBMIT_ERROR_ID);

  return renderError ? (
    renderError(error)
  ) : (
    <FieldError id={errorId}>{errorMessage}</FieldError>
  );
};

const fieldErrorId = (
  message: string | null | undefined,
  id: string
): string | undefined => ((message ?? null) === null ? undefined : id);

const belongsToCreatePopover = (
  target: EventTarget,
  panel: HTMLElement
): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const popup = target.closest<HTMLElement>('[role="listbox"]');

  if (popup === null || popup.id === "") {
    return false;
  }

  return [...panel.querySelectorAll<HTMLElement>("[aria-controls]")].some(
    (control) =>
      control
        .getAttribute("aria-controls")
        ?.split(WHITESPACE_PATTERN)
        .includes(popup.id) === true
  );
};

interface PopoverFocusRefs {
  readonly lastFocusedRef: RefObject<HTMLElement | null>;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

const usePopoverFocus = (
  isOpen: boolean,
  portalAnchorRef: RefObject<HTMLSpanElement | null>
): PopoverFocusRefs => {
  const previousOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const anchor = portalAnchorRef.current;

    if (anchor === null) {
      return noopCleanup;
    }

    const root = anchor.getRootNode();

    const handleFocusIn = (event: Event): void => {
      const target = event
        .composedPath()
        .find((node): node is HTMLElement => node instanceof HTMLElement);

      if (target !== undefined) {
        lastFocusedRef.current = target;
      }
    };

    root.addEventListener("focusin", handleFocusIn, true);

    return () => {
      root.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [portalAnchorRef]);

  useLayoutEffect(() => {
    if (isOpen && !previousOpenRef.current) {
      returnFocusRef.current =
        getActiveElement(portalAnchorRef.current) ?? lastFocusedRef.current;
    }

    if (!isOpen && previousOpenRef.current) {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }

    previousOpenRef.current = isOpen;
  }, [isOpen, portalAnchorRef]);

  return { lastFocusedRef, returnFocusRef };
};

interface CreateEventPopoverOverlayProps {
  readonly anchorRect?: DOMRect;
  readonly anchorRef?: CreateEventPopoverProps["anchorRef"];
  readonly className?: string;
  readonly compactContent: ReactNode;
  readonly controller: ReturnType<typeof useCreateEventController>;
  readonly customRepeatOpen: boolean;
  readonly expandedContent: ReactNode;
  readonly handleNativeSelectChange: (event: Event) => void;
  readonly handleShellOpenChange: (nextOpen: boolean) => void;
  readonly onCloseCustomRepeat: () => void;
  readonly repeatContent: ReactNode;
}

const CreateEventPopoverOverlay = ({
  anchorRect,
  anchorRef,
  className,
  compactContent,
  controller,
  customRepeatOpen,
  expandedContent,
  handleNativeSelectChange,
  handleShellOpenChange,
  onCloseCustomRepeat,
  repeatContent,
}: CreateEventPopoverOverlayProps) => {
  const { direction, t } = useCalendarLocalization();

  const portalAnchorRef = useRef<HTMLSpanElement | null>(null);
  const overlayRef = useRef<HTMLElement | null>(null);

  const [portalContainer, setPortalContainer] = useState<
    Element | DocumentFragment | null
  >(null);

  const [layerContainer, setLayerContainer] = useState<HTMLElement | null>(
    null
  );

  const nativeSelectChangeRef = useRef(handleNativeSelectChange);

  usePopoverFocus(controller.isOpen, portalAnchorRef);

  useEffect(() => {
    nativeSelectChangeRef.current = handleNativeSelectChange;
  }, [handleNativeSelectChange]);

  const stableNativeSelectChange = useCallback((event: Event): void => {
    nativeSelectChangeRef.current(event);
  }, []);

  useEffect(() => {
    if (!controller.isOpen || portalContainer === null) {
      return noopCleanup;
    }

    portalContainer.addEventListener("change", stableNativeSelectChange, true);

    return () => {
      portalContainer.removeEventListener(
        "change",
        stableNativeSelectChange,
        true
      );
    };
  }, [controller.isOpen, portalContainer, stableNativeSelectChange]);

  const getAnchorRect = useCallback(
    (): DOMRect => resolveAnchorRect(anchorRef, anchorRect),
    [anchorRect, anchorRef]
  );

  // Stable callback ref: runs on attach, not every commit.
  const setPortalAnchor = useCallback((element: HTMLSpanElement | null) => {
    portalAnchorRef.current = element;

    const container = element === null ? null : resolvePortalContainer(element);

    setPortalContainer((current) =>
      current === container ? current : container
    );
  }, []);

  const setOverlayRef = useCallback((element: HTMLElement | null): void => {
    if (element === null || overlayRef.current === element) {
      return;
    }

    overlayRef.current = element;
    setLayerContainer((current) => (current === element ? current : element));
  }, []);

  const nestedLayerContainer = layerContainer ?? portalContainer;

  return (
    <span ref={setPortalAnchor} dir={direction} className={styles.portalAnchor}>
      {portalContainer !== null &&
        controller.isOpen &&
        !controller.isExpanded && (
          <Popover
            open
            onOpenChange={handleShellOpenChange}
            anchorRect={anchorRect ?? createDefaultAnchorRect()}
            anchorRectProvider={getAnchorRect}
            container={portalContainer}
            belongsTo={belongsToCreatePopover}
            label={t("calendar.create_event.create_dialog")}
            ref={setOverlayRef}
            className={clsx(styles.dialog, styles.compact, className)}
          >
            {compactContent}
          </Popover>
        )}
      {portalContainer !== null &&
        controller.isOpen &&
        controller.isExpanded && (
          <Dialog open onOpenChange={handleShellOpenChange}>
            <DialogContent
              container={portalContainer}
              label={t("calendar.create_event.create_dialog")}
              ref={setOverlayRef}
              showBackdrop={false}
              showCloseButton={false}
              className={clsx(styles.dialog, styles.expanded, className)}
            >
              {expandedContent}
            </DialogContent>
          </Dialog>
        )}
      {nestedLayerContainer !== null &&
      controller.isOpen &&
      customRepeatOpen ? (
        <>
          {createPortal(
            <div aria-hidden="true" className={styles.repeatBackdrop} />,
            nestedLayerContainer
          )}
          <Dialog
            open
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                onCloseCustomRepeat();
              }
            }}
          >
            <DialogContent
              container={nestedLayerContainer}
              showBackdrop={false}
              showCloseButton={false}
              label={t("calendar.create_event.field.repeat")}
              className={styles.repeatPopover}
            >
              {repeatContent}
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      {nestedLayerContainer !== null && (
        <DiscardDialog
          container={nestedLayerContainer}
          open={controller.isDiscardDialogOpen}
          onClose={() => {
            controller.dismissDiscard();
          }}
          onConfirm={() => {
            controller.confirmDiscard();
          }}
        />
      )}
    </span>
  );
};

interface CreateEventFormProps {
  readonly calendarItems: readonly {
    readonly icon: ReactNode;
    readonly label: ReactNode;
    readonly value: string;
  }[];
  readonly canSubmit: boolean;
  readonly conferencingItems: readonly ResourceItem[];
  readonly controller: ReturnType<typeof useCreateEventController>;
  readonly displayedEndDate: CalendarDate | "";
  readonly fieldId: (name: string) => string;
  readonly fieldMessages: ReturnType<typeof createEventErrorMessages>;
  readonly firstError: string | null;
  readonly formId: string;
  readonly onAllDayChange: (allDay: boolean) => void;
  readonly onLocationSelection: (value: string) => void;
  readonly onPeopleSelect: (option: ComboboxOption) => void;
  readonly onRepeatPresetChange: (value: string) => void;
  readonly onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  readonly locationEditorOpen: boolean;
  readonly locationItems: readonly ResourceItem[];
  readonly locationQuery: string;
  readonly noOptionsLabel: string;
  readonly peopleQuery: string;
  readonly overlayKind: "discard" | "custom-repeat" | "none";
  readonly renderFields?: () => ReactNode;
  readonly renderFooter?: () => ReactNode;
  readonly renderHeader?: () => ReactNode;
  readonly repeatAnchorRef: RefObject<HTMLButtonElement | null>;
  readonly repeatHint: string | undefined;
  readonly repeatItems: readonly ResourceItem[];
  readonly repeatPreset: RepeatPreset;
  readonly selectedCalendar: CalendarRef | undefined;
  readonly selectedPeopleIds: readonly string[] | undefined;
  readonly setPeopleQuery: (query: string) => void;
  readonly setDraft: (draft: CreateEventDraft) => void;
  readonly setLocationEditorOpen: (open: boolean) => void;
  readonly submitErrorContent: ReactNode;
  readonly timeZoneFieldLabel: string;
  readonly timeZoneLabel: string;
  readonly updateLocation: (value: string) => void;
  readonly visiblePeopleItems: readonly ResourceItem[];
}

type CreateEventAdditionalFieldsProps = Pick<
  CreateEventFormProps,
  | "controller"
  | "fieldId"
  | "onLocationSelection"
  | "locationEditorOpen"
  | "locationItems"
  | "locationQuery"
  | "setDraft"
  | "setLocationEditorOpen"
  | "updateLocation"
>;

const CreateEventAdditionalFields = (
  props: CreateEventAdditionalFieldsProps
) => {
  const {
    controller,
    fieldId,
    onLocationSelection,
    locationEditorOpen,
    locationItems,
    locationQuery,
    setDraft,
    setLocationEditorOpen,
    updateLocation,
  } = props;

  const { t } = useCalendarLocalization();

  const changeDescription = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ): void => {
    setDraft({ ...controller.draft, description: event.target.value });
  };

  return (
    <>
      {locationEditorOpen ? (
        <Field className={styles.field}>
          <Combobox
            id={fieldId("location")}
            aria-label={t("calendar.create_event.field.location")}
            value={locationQuery}
            selectedValues={locationQuery === "" ? [] : [locationQuery]}
            options={locationItems}
            embedded
            showChevron
            showSelectedCheck
            size="l"
            iconLeft={<MapPinIcon aria-hidden="true" />}
            className={clsx(styles.control, styles.comboboxField)}
            controlClassName={styles.comboboxFieldControl}
            disabled={controller.isSubmitting}
            placeholder={t("calendar.create_event.placeholder.location")}
            emptyMessage={t("calendar.create_event.location.no_results")}
            onValueChange={updateLocation}
            onSelect={(option) => {
              onLocationSelection(option.value);
            }}
          />
        </Field>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="xl"
          leftIcon={<MapPinIcon aria-hidden="true" />}
          className={styles.locationButton}
          onClick={() => {
            setLocationEditorOpen(true);
          }}
        >
          {t("calendar.create_event.placeholder.location")}
        </Button>
      )}

      <Field className={styles.field}>
        <FieldLabel htmlFor={fieldId("description")}>
          {t("calendar.create_event.field.description")}
        </FieldLabel>
        <Textarea
          id={fieldId("description")}
          value={controller.draft.description ?? ""}
          disabled={controller.isSubmitting}
          className={styles.control}
          onChange={changeDescription}
        />
      </Field>
    </>
  );
};

type CreateEventFieldsProps = Omit<
  CreateEventFormProps,
  | "canSubmit"
  | "formId"
  | "onSubmit"
  | "overlayKind"
  | "renderFooter"
  | "renderHeader"
>;

type CreateEventPeopleFieldProps = Pick<
  CreateEventFieldsProps,
  | "controller"
  | "fieldId"
  | "onPeopleSelect"
  | "peopleQuery"
  | "selectedPeopleIds"
  | "setDraft"
  | "setPeopleQuery"
  | "visiblePeopleItems"
>;

const CreateEventPeopleField = ({
  controller,
  fieldId,
  onPeopleSelect,
  peopleQuery,
  selectedPeopleIds,
  setDraft,
  setPeopleQuery,
  visiblePeopleItems,
}: CreateEventPeopleFieldProps) => {
  const { t } = useCalendarLocalization();

  return (
    <Field className={styles.field}>
      <Combobox
        id={fieldId("people")}
        aria-label={t("calendar.create_event.field.people")}
        value={peopleQuery}
        options={visiblePeopleItems}
        selectedValues={selectedPeopleIds}
        tags
        embedded
        showChevron
        showSelectedCheck
        size="l"
        iconLeft={<UsersIcon aria-hidden="true" />}
        className={clsx(styles.control, styles.comboboxField)}
        controlClassName={clsx(
          styles.comboboxFieldControl,
          selectedPeopleIds !== undefined && selectedPeopleIds.length > 0
            ? styles.comboboxFieldTags
            : undefined
        )}
        disabled={controller.isSubmitting}
        placeholder={t("calendar.create_event.placeholder.people")}
        emptyMessage={t("calendar.create_event.people.no_results")}
        onValueChange={setPeopleQuery}
        onSelect={onPeopleSelect}
        onTagRemove={(value) => {
          onPeopleSelect({ label: value, value });
        }}
        onClearTags={() => {
          setDraft({ ...controller.draft, attendeeIds: [] });
        }}
      />
    </Field>
  );
};

const CreateEventFields = (props: CreateEventFieldsProps) => {
  const {
    calendarItems,
    conferencingItems,
    controller,
    displayedEndDate,
    fieldId,
    fieldMessages,
    firstError,
    onAllDayChange,
    onPeopleSelect,
    onRepeatPresetChange,
    noOptionsLabel,
    peopleQuery,
    onLocationSelection,
    locationEditorOpen,
    locationItems,
    locationQuery,
    renderFields,
    repeatAnchorRef,
    repeatHint,
    repeatItems,
    repeatPreset,
    selectedCalendar,
    selectedPeopleIds,
    setPeopleQuery,
    setDraft,
    setLocationEditorOpen,
    submitErrorContent,
    timeZoneFieldLabel,
    timeZoneLabel,
    updateLocation,
    visiblePeopleItems,
  } = props;

  const { t } = useCalendarLocalization();
  const expanded = controller.isExpanded;

  const dayCount = dateRangeDayCount(
    controller.draft.startDate,
    displayedEndDate === "" ? null : displayedEndDate
  );

  const fieldUpdateContext = { draft: controller.draft, setDraft };

  const changeStartTime = (value: string): void => {
    updateTimeField("startTime", value, fieldUpdateContext);
  };

  const changeEndTime = (value: string): void => {
    updateTimeField("endTime", value, fieldUpdateContext);
  };

  const changeStartDate = (value: CalendarDate | ""): void => {
    updateDateField("startDate", value, fieldUpdateContext);
  };

  const changeEndDate = (value: CalendarDate | ""): void => {
    updateDateField("endDate", value, fieldUpdateContext);
  };

  const changeConferencingProvider = (value: string): void => {
    setDraft({ ...controller.draft, conferencingProviderId: value });
  };

  const peopleField = (
    <CreateEventPeopleField
      controller={controller}
      fieldId={fieldId}
      onPeopleSelect={onPeopleSelect}
      peopleQuery={peopleQuery}
      selectedPeopleIds={selectedPeopleIds}
      setDraft={setDraft}
      setPeopleQuery={setPeopleQuery}
      visiblePeopleItems={visiblePeopleItems}
    />
  );

  const fields = (
    <>
      <Field className={styles.field}>
        <Select
          id={fieldId("calendar")}
          aria-label={t("calendar.create_event.field.calendar")}
          emptyMessage={noOptionsLabel}
          options={calendarItems}
          value={controller.draft.calendarId ?? ""}
          size="xl"
          showSelectedCheck
          iconLeft={
            selectedCalendar === undefined ? undefined : (
              <CalendarColorDot colorFamily={selectedCalendar.colorFamily} />
            )
          }
          disabled={controller.isSubmitting}
          placeholder={t("calendar.create_event.placeholder.calendar")}
          onValueChange={(value) => {
            setDraft({ ...controller.draft, calendarId: value });
          }}
        />
      </Field>

      <div className={styles.timeRow}>
        <TimeField
          id={fieldId("start-time")}
          label={t("calendar.create_event.field.start_time")}
          value={controller.draft.startTime ?? ""}
          disabled={controller.isSubmitting || controller.draft.allDay}
          className={styles.rowField}
          onChange={changeStartTime}
        />
        <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} />
        <TimeField
          id={fieldId("end-time")}
          label={t("calendar.create_event.field.end_time")}
          value={controller.draft.endTime ?? ""}
          invalid={fieldMessages.endTime !== null}
          errorId={fieldErrorId(
            fieldMessages.endTime,
            fieldId("end-time-error")
          )}
          errorMessage={fieldMessages.endTime}
          disabled={controller.isSubmitting || controller.draft.allDay}
          className={styles.rowField}
          onChange={changeEndTime}
        />
        <Toggle
          checked={controller.draft.allDay}
          disabled={controller.isSubmitting}
          label={t("calendar.create_event.all_day")}
          size="m"
          type="toggle-first"
          onCheckedChange={onAllDayChange}
        />
      </div>

      <div className={styles.dateRow}>
        <DateField
          id={fieldId("start-date")}
          label={t("calendar.create_event.field.start_date")}
          value={controller.draft.startDate}
          disabled={controller.isSubmitting}
          className={styles.rowField}
          onChange={changeStartDate}
        />
        <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} />
        <DateField
          id={fieldId("end-date")}
          label={t("calendar.create_event.field.end_date")}
          value={displayedEndDate}
          invalid={fieldMessages.endDate !== null}
          errorId={fieldErrorId(
            fieldMessages.endDate,
            fieldId("end-date-error")
          )}
          errorMessage={fieldMessages.endDate}
          disabled={controller.isSubmitting}
          defaultMonthDate={controller.draft.startDate}
          clearable
          className={styles.rowField}
          onChange={changeEndDate}
        />
        {/* Always rendered to hold the four columns. */}
        <span className={styles.dayCount}>
          {t("calendar.create_event.dayCount", { count: dayCount })}
        </span>
      </div>

      <Field className={styles.field}>
        <Select
          ref={repeatAnchorRef}
          id={fieldId("repeat")}
          aria-label={t("calendar.create_event.field.repeat")}
          options={repeatItems}
          value={repeatPreset}
          size="xl"
          showSelectedCheck
          iconLeft={<RefreshCwIcon aria-hidden="true" />}
          disabled={controller.isSubmitting}
          placeholder={t("calendar.create_event.repeat.none")}
          onValueChange={onRepeatPresetChange}
          aria-describedby={
            repeatHint === undefined ? undefined : fieldId("repeat-hint")
          }
        />
        {repeatHint === undefined ? null : (
          <p id={fieldId("repeat-hint")} className={styles.repeatHint}>
            {repeatHint}
          </p>
        )}
        {fieldMessages.recurrenceRule === null ? null : (
          <FieldError id={fieldId("repeat-error")} role="status">
            {fieldMessages.recurrenceRule}
          </FieldError>
        )}
      </Field>

      <Field className={styles.field}>
        <Input
          id={fieldId("timezone")}
          aria-label={timeZoneFieldLabel}
          value={timeZoneLabel}
          size="xl"
          readOnly
          iconLeft={<Globe2Icon aria-hidden="true" />}
        />
      </Field>
      {expanded ? null : peopleField}

      <Field className={styles.field}>
        <Select
          id={fieldId("conferencing")}
          aria-label={t("calendar.create_event.field.conferencing")}
          emptyMessage={noOptionsLabel}
          options={conferencingItems}
          value={controller.draft.conferencingProviderId ?? ""}
          size="xl"
          showSelectedCheck
          iconLeft={<Link2Icon aria-hidden="true" />}
          disabled={controller.isSubmitting}
          placeholder={t("calendar.create_event.placeholder.conferencing")}
          onValueChange={changeConferencingProvider}
        />
      </Field>

      <Separator decorative className={styles.separator} />

      <CreateEventAdditionalFields
        controller={controller}
        fieldId={fieldId}
        onLocationSelection={onLocationSelection}
        locationEditorOpen={locationEditorOpen}
        locationItems={locationItems}
        locationQuery={locationQuery}
        setDraft={setDraft}
        setLocationEditorOpen={setLocationEditorOpen}
        updateLocation={updateLocation}
      />

      {firstError === null ? null : (
        <FieldError id={fieldId("form-error")}>{firstError}</FieldError>
      )}
      {submitErrorContent}
      {renderFields?.()}
    </>
  );

  return (
    <FieldGroup className={styles.body}>
      <Field className={styles.field}>
        <Input
          id={fieldId("title")}
          aria-label={t("calendar.create_event.field.title")}
          placeholder={t("calendar.create_event.field.title")}
          value={controller.draft.title}
          size="xl"
          invalid={fieldMessages.title !== null}
          aria-describedby={fieldErrorId(
            fieldMessages.title,
            fieldId("title-error")
          )}
          disabled={controller.isSubmitting}
          onValueChange={(value) => {
            setDraft({ ...controller.draft, title: value });
          }}
        />
        {fieldMessages.title === null ? null : (
          <FieldError id={fieldId("title-error")} role="status">
            {fieldMessages.title}
          </FieldError>
        )}
      </Field>
      {expanded ? (
        <div className={styles.columns}>
          <div className={styles.mainColumn}>{fields}</div>
          <div className={styles.sideColumn}>{peopleField}</div>
        </div>
      ) : (
        fields
      )}
    </FieldGroup>
  );
};

const CreateEventForm = ({
  canSubmit,
  formId,
  onSubmit,
  overlayKind,
  renderFooter,
  renderHeader,
  ...fieldProps
}: CreateEventFormProps) => {
  const { controller, fieldId } = fieldProps;

  return (
    <>
      <FormHeader
        expanded={controller.isExpanded}
        onToggle={() => {
          controller.setExpanded(!controller.isExpanded);
        }}
        onClose={() => {
          controller.requestCancel();
        }}
        renderHeader={renderHeader}
        titleId={fieldId("title-heading")}
      />
      <form
        id={formId}
        className={styles.form}
        onSubmit={onSubmit}
        inert={overlayKind !== "none"}
      >
        <CreateEventFields {...fieldProps} />
      </form>
      <FormFooter
        formId={formId}
        isSubmitting={controller.isSubmitting}
        canSubmit={canSubmit}
        onCancel={() => {
          controller.requestCancel();
        }}
        renderFooter={renderFooter}
      />
    </>
  );
};

const CreateEventPopoverContent = (props: CreateEventPopoverProps) => {
  const view = useCreateEventPopoverContent(props);

  const {
    anchorRect,
    anchorRef,
    changeCustomRepeat,
    closeCustomRepeat,
    calendars,
    canSubmit,
    className,
    conferencingItems,
    controller,
    customRepeat,
    customRepeatOpen,
    displayedEndDate,
    expandedContentShell,
    fieldId,
    fieldMessages,
    firstError,
    formId,
    handleNativeSelectChange,
    handleShellOpenChange,
    idPrefix,
    locationEditorOpen,
    locationItems,
    locationQuery,
    noOptionsLabel,
    overlayKind,
    onAllDayChange,
    onLocationSelection,
    onPeopleSelect,
    onRepeatPresetChange,
    onSubmit,
    peopleQuery,
    repeatAnchorRef,
    repeatHint,
    repeatItems,
    repeatPreset,
    renderCompactShell,
    renderError,
    renderFields,
    renderFooter,
    renderHeader,
    selectedCalendar,
    selectedPeopleIds,
    setDraft,
    setLocationEditorOpen,
    setPeopleQuery,
    submitError,
    timeZoneFieldLabel,
    timeZoneLabel,
    updateLocation,
    visiblePeopleItems,
  } = view;

  const { t } = useCalendarLocalization();

  const calendarItems = useMemo(
    () =>
      calendars.map((calendar) => ({
        icon: (
          <CalendarColorDot
            colorFamily={calendar.colorFamily}
            testId={`calendar-color-${calendar.id}`}
          />
        ),
        label: (
          <>
            <span>{t("calendar.create_event.calendarSchedule")}</span>{" "}
            {calendar.name}
          </>
        ),
        value: calendar.id,
      })),
    [calendars, t]
  );

  const submitErrorContent = (
    <SubmitError
      error={submitError}
      errorId={fieldId("submit-error")}
      renderError={renderError}
    />
  );

  const formContent = (
    <CreateEventForm
      calendarItems={calendarItems}
      canSubmit={canSubmit}
      conferencingItems={conferencingItems}
      controller={controller}
      displayedEndDate={displayedEndDate}
      fieldId={fieldId}
      fieldMessages={fieldMessages}
      firstError={firstError ?? null}
      formId={formId}
      onAllDayChange={onAllDayChange}
      onLocationSelection={onLocationSelection}
      onPeopleSelect={onPeopleSelect}
      onRepeatPresetChange={onRepeatPresetChange}
      onSubmit={onSubmit}
      locationEditorOpen={locationEditorOpen}
      locationItems={locationItems}
      locationQuery={locationQuery}
      noOptionsLabel={noOptionsLabel}
      peopleQuery={peopleQuery}
      overlayKind={overlayKind}
      renderFields={renderFields}
      renderFooter={renderFooter}
      renderHeader={renderHeader}
      repeatAnchorRef={repeatAnchorRef}
      repeatHint={repeatHint}
      repeatItems={repeatItems}
      repeatPreset={repeatPreset}
      selectedCalendar={selectedCalendar}
      selectedPeopleIds={selectedPeopleIds}
      setPeopleQuery={setPeopleQuery}
      setDraft={setDraft}
      setLocationEditorOpen={setLocationEditorOpen}
      submitErrorContent={submitErrorContent}
      timeZoneFieldLabel={timeZoneFieldLabel}
      timeZoneLabel={timeZoneLabel}
      updateLocation={updateLocation}
      visiblePeopleItems={visiblePeopleItems}
    />
  );

  const changeRepeatInterval = (value: string): void => {
    const parsed = Math.trunc(Number(value));

    changeCustomRepeat((current) => ({
      ...current,
      interval: Number.isFinite(parsed) ? Math.max(1, parsed) : 1,
    }));
  };

  const changeRepeatUnit = (unit: RepeatUnit): void => {
    changeCustomRepeat((current) => ({ ...current, unit }));
  };

  const changeRepeatEndKind = (endKind: RepeatEndKind): void => {
    changeCustomRepeat((current) => ({
      ...current,
      endDate:
        endKind === "on" && current.endDate === null
          ? addCalendarDays(controller.draft.startDate, 1)
          : current.endDate,
      endKind,
    }));
  };

  const changeRepeatEndDate = (value: CalendarDate | ""): void => {
    if (value === "") {
      changeCustomRepeat((current) => ({ ...current, endDate: null }));

      return;
    }

    changeCustomRepeat((current) => ({ ...current, endDate: value }));
  };

  const toggleRepeatWeekday = (weekday: Weekday): void => {
    changeCustomRepeat((current) => ({
      ...current,
      byDay: current.byDay.includes(weekday)
        ? current.byDay.filter((candidate) => candidate !== weekday)
        : [...current.byDay, weekday],
    }));
  };

  const repeatContent = (
    <CustomRepeatView
      idPrefix={idPrefix}
      state={customRepeat}
      onChangeInterval={changeRepeatInterval}
      onChangeUnit={changeRepeatUnit}
      onChangeEndKind={changeRepeatEndKind}
      onChangeEndDate={changeRepeatEndDate}
      onToggleWeekday={toggleRepeatWeekday}
      expanded={controller.isExpanded}
      onToggleExpanded={() => {
        controller.setExpanded(!controller.isExpanded);
      }}
      onClose={closeCustomRepeat}
      onApply={closeCustomRepeat}
    />
  );

  const compactContent = renderCompactShell?.(formContent) ?? formContent;
  const expandedContent = expandedContentShell?.(formContent) ?? formContent;

  return (
    <CreateEventPopoverOverlay
      anchorRect={anchorRect}
      anchorRef={anchorRef}
      className={className}
      compactContent={compactContent}
      controller={controller}
      customRepeatOpen={customRepeatOpen}
      expandedContent={expandedContent}
      handleNativeSelectChange={handleNativeSelectChange}
      handleShellOpenChange={handleShellOpenChange}
      onCloseCustomRepeat={closeCustomRepeat}
      repeatContent={repeatContent}
    />
  );
};

export const CreateEventPopover = (props: CreateEventPopoverProps) => (
  <CalendarScope {...props}>
    <CreateEventPopoverContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
