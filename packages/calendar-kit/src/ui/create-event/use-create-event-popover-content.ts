import {
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import type * as React from "react";

import { validateCreateEventDraft } from "../../core/create-event";
import type { CalendarDate, CreateEventDraft } from "../../core/model";
import { addCalendarDays, weekdayIndex } from "../../core/temporal";
import { parseLocalTime } from "../../core/validation";
import { useCalendarContext } from "../../i18n/calendar-context";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import { useCreateEventController } from "../../react/controllers/use-create-event-controller";
import type { CalendarResourceOption } from "../../react/controllers/use-create-event-controller";
import type { ComboboxOption } from "../primitives/combobox/combobox";
import {
  formatTimeZone,
  parseCustomRepeatState,
  resolveOverlayKind,
  formatRepeatHint,
  serializeCustomRepeat,
  REPEAT_PRESET,
  REPEAT_UNIT,
  WEEKDAY_ORDER,
} from "./create-event-format";
import type {
  CustomRepeatState,
  RepeatPreset,
  RepeatUnit,
} from "./create-event-format";
import type {
  CreateEventPopoverProps,
  ResourceItem,
} from "./create-event-popover";
import {
  createEventErrorMessages,
  firstCreateEventError,
} from "./create-event-validation";

const DEFAULT_START_TIME = parseLocalTime("09:00");
const DEFAULT_END_TIME = parseLocalTime("10:00");

type TimedTimes = Pick<CreateEventDraft, "endDate" | "endTime" | "startTime">;

const rememberTimedTimes = (
  draft: CreateEventDraft,
  timedTimesRef: RefObject<TimedTimes | null>
): void => {
  if (!draft.allDay) {
    timedTimesRef.current = {
      endDate: draft.endDate,
      endTime: draft.endTime,
      startTime: draft.startTime,
    };
  }
};

const filteredResourceItems = (
  items: readonly ResourceItem[],
  query: string
): readonly ResourceItem[] => {
  if (query === "") {
    return items;
  }

  const normalizedQuery = query.toLocaleLowerCase();

  return items.filter((item) =>
    item.label.toLocaleLowerCase().includes(normalizedQuery)
  );
};

const selectedPeopleForDraft = (
  attendeeIds: readonly string[] | undefined,
  people: readonly CalendarResourceOption[]
): readonly string[] | undefined => {
  if (attendeeIds === undefined) {
    return undefined;
  }

  const validPeopleIds = new Set(people.map((person) => person.id));

  return attendeeIds.filter((id) => validPeopleIds.has(id));
};

const resourcesToItems = (
  resources: readonly CalendarResourceOption[]
): readonly ResourceItem[] =>
  resources.map((resource) => ({
    label: resource.label,
    value: resource.id,
  }));

const repeatOptions = (t: CalendarTranslate): readonly ResourceItem[] => [
  {
    label: t("calendar.create_event.repeat.none"),
    value: REPEAT_PRESET.none,
  },
  {
    label: t("calendar.create_event.repeat.daily"),
    value: REPEAT_PRESET.daily,
  },
  {
    label: t("calendar.create_event.repeat.weekly"),
    value: REPEAT_PRESET.weekly,
  },
  {
    label: t("calendar.create_event.repeat.biweekly"),
    value: REPEAT_PRESET.biweekly,
  },
  {
    dividerAfter: true,
    label: t("calendar.create_event.repeat.monthly"),
    value: REPEAT_PRESET.monthly,
  },
  {
    label: t("calendar.create_event.repeat.custom"),
    value: REPEAT_PRESET.custom,
  },
];

const resolveRepeatPresetValue = (value: string): RepeatPreset => {
  if (value === REPEAT_PRESET.daily) {
    return REPEAT_PRESET.daily;
  }
  if (value === REPEAT_PRESET.weekly) {
    return REPEAT_PRESET.weekly;
  }
  if (value === REPEAT_PRESET.biweekly) {
    return REPEAT_PRESET.biweekly;
  }
  if (value === REPEAT_PRESET.monthly) {
    return REPEAT_PRESET.monthly;
  }
  if (value === REPEAT_PRESET.custom) {
    return REPEAT_PRESET.custom;
  }
  return REPEAT_PRESET.none;
};

export const resolveRepeatUnit = (value: string): RepeatUnit => {
  if (value === REPEAT_UNIT.day) {
    return REPEAT_UNIT.day;
  }
  if (value === REPEAT_UNIT.month) {
    return REPEAT_UNIT.month;
  }
  return REPEAT_UNIT.week;
};

const recurrenceForPreset = (preset: RepeatPreset): string | null => {
  if (preset === REPEAT_PRESET.daily) {
    return "FREQ=DAILY";
  }
  if (preset === REPEAT_PRESET.weekly) {
    return "FREQ=WEEKLY";
  }
  if (preset === REPEAT_PRESET.biweekly) {
    return "FREQ=WEEKLY;INTERVAL=2";
  }
  if (preset === REPEAT_PRESET.monthly) {
    return "FREQ=MONTHLY";
  }
  return null;
};

const resolveRepeatPreset = (rule: string | null | undefined): RepeatPreset =>
  Object.values(REPEAT_PRESET).find(
    (preset) =>
      preset !== REPEAT_PRESET.custom &&
      recurrenceForPreset(preset) === (rule === "" ? null : (rule ?? null))
  ) ?? REPEAT_PRESET.custom;

const nextDraftForAllDayChange = (
  draft: CreateEventDraft,
  timedTimes: Pick<CreateEventDraft, "endDate" | "endTime" | "startTime">,
  allDay: boolean
): CreateEventDraft => {
  if (allDay) {
    const endDate =
      draft.endDate !== null && draft.endDate > draft.startDate
        ? draft.endDate
        : addCalendarDays(draft.startDate, 1);

    return {
      ...draft,
      allDay: true,
      endDate,
      endTime: null,
      startTime: null,
    };
  }

  return {
    ...draft,
    allDay: false,
    endDate: timedTimes.endDate,
    endTime: draft.endTime ?? timedTimes.endTime ?? DEFAULT_END_TIME,
    startTime: draft.startTime ?? timedTimes.startTime ?? DEFAULT_START_TIME,
  };
};

const toggleAttendee = (
  selectedIds: readonly string[],
  optionValue: string
): readonly string[] =>
  selectedIds.includes(optionValue)
    ? selectedIds.filter((id) => id !== optionValue)
    : [...selectedIds, optionValue];

interface ShellCloseActions {
  readonly dismissDiscard: () => void;
  readonly closeCustomRepeat: () => void;
  readonly requestCancel: () => void;
}

const closeShell = (
  nextOpen: boolean,
  discardOpen: boolean,
  customRepeatOpen: boolean,
  actions: ShellCloseActions
): void => {
  if (nextOpen) {
    return;
  }

  if (discardOpen) {
    actions.dismissDiscard();

    return;
  }

  if (customRepeatOpen) {
    actions.closeCustomRepeat();

    return;
  }

  actions.requestCancel();
};

export const useCreateEventPopoverContent = (
  props: CreateEventPopoverProps
) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const controller = useCreateEventController({ ...props, timeZone });

  const {
    calendars,
    people,
    locations,
    conferencingProviders,
    anchorRect,
    anchorRef,
    className,
    renderHeader,
    renderFields,
    renderFooter,
    renderError,
    renderCompactShell,
    renderExpandedShell,
  } = props;

  const idPrefix = useId();

  const repeatAnchorRef = useRef<HTMLButtonElement | null>(null);

  const [peopleQuery, setPeopleQuery] = useState("");

  const [locationEditorOpen, setLocationEditorOpen] = useState(() =>
    Boolean(controller.draft.location)
  );

  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>(() =>
    resolveRepeatPreset(controller.draft.recurrenceRule)
  );

  const [customRepeat, setCustomRepeat] = useState<CustomRepeatState>(() =>
    parseCustomRepeatState(controller.draft.recurrenceRule)
  );

  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);

  const timedTimesRef = useRef<TimedTimes>({
    endDate: controller.draft.endDate,
    endTime: controller.draft.endTime,
    startTime: controller.draft.startTime,
  });

  const fieldId = useCallback(
    (name: string): string => `${idPrefix}-${name}`,
    [idPrefix]
  );

  const overlayKind = resolveOverlayKind(
    controller.isDiscardDialogOpen,
    customRepeatOpen
  );
  const fieldMessages = createEventErrorMessages(controller.errors, t);
  const firstError = firstCreateEventError(controller.errors, t);
  const canSubmit = validateCreateEventDraft(controller.draft).valid;
  const timeZoneLabel = formatTimeZone(
    controller.draft.timeZone,
    locale,
    t,
    props.now
  );
  const noOptionsLabel = t("calendar.create_event.no_options");
  const timeZoneFieldLabel = t("calendar.create_event.field.timezone");

  const displayedEndDate: CalendarDate | "" =
    controller.draft.endDate === null ||
    controller.draft.endDate === controller.draft.startDate
      ? ""
      : controller.draft.endDate;

  const deferredPeopleQuery = useDeferredValue(peopleQuery);

  const visiblePeopleItems = useMemo(
    () => filteredResourceItems(resourcesToItems(people), deferredPeopleQuery),
    [deferredPeopleQuery, people]
  );

  const selectedPeopleIds = selectedPeopleForDraft(
    controller.draft.attendeeIds,
    people
  );
  const locationQuery = controller.draft.location ?? "";

  const locationItems = useMemo(() => resourcesToItems(locations), [locations]);

  const conferencingItems = useMemo(
    () => resourcesToItems(conferencingProviders),
    [conferencingProviders]
  );

  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === controller.draft.calendarId
  );

  const repeatItems = useMemo(() => repeatOptions(t), [t]);

  const repeatHint = formatRepeatHint(
    controller.draft.recurrenceRule,
    controller.draft.startDate,
    t,
    locale
  );

  const formId = fieldId("form");

  const setDraft = useCallback(
    (nextDraft: CreateEventDraft): void => {
      rememberTimedTimes(nextDraft, timedTimesRef);
      controller.setDraft(nextDraft);
    },
    [controller]
  );

  const updateLocation = (value: string): void => {
    setDraft({ ...controller.draft, location: value || null });
  };

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void controller.submit();
  };

  const onAllDayChange = (allDay: boolean): void => {
    setDraft(
      nextDraftForAllDayChange(
        controller.draft,
        timedTimesRef.current ?? {
          endDate: controller.draft.endDate,
          endTime: controller.draft.endTime,
          startTime: controller.draft.startTime,
        },
        allDay
      )
    );
  };

  const changeCustomRepeat = (
    update: (current: CustomRepeatState) => CustomRepeatState
  ): void => {
    const next = update(customRepeat);

    setCustomRepeat(next);
    setDraft({
      ...controller.draft,
      recurrenceRule: serializeCustomRepeat(next),
    });
  };

  const onRepeatPresetChange = (value: string): void => {
    const nextPreset = resolveRepeatPresetValue(value);
    setRepeatPreset(nextPreset);

    if (nextPreset === REPEAT_PRESET.custom) {
      changeCustomRepeat((current) =>
        current.byDay.length > 0
          ? current
          : {
              ...current,
              byDay: [
                WEEKDAY_ORDER[weekdayIndex(controller.draft.startDate)] ??
                  "monday",
              ],
            }
      );
      setCustomRepeatOpen(true);

      return;
    }

    setDraft({
      ...controller.draft,
      recurrenceRule: recurrenceForPreset(nextPreset),
    });
  };

  const handleNativeSelectChange = (event: Event): void => {
    const { target } = event;

    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.id === fieldId("repeat")) {
      onRepeatPresetChange(target.value);

      return;
    }

    if (target.id === fieldId("repeat-unit")) {
      changeCustomRepeat((current) => ({
        ...current,
        unit: resolveRepeatUnit(target.value),
      }));
    }
  };

  const closeCustomRepeat = (): void => {
    setCustomRepeatOpen(false);
  };

  const onLocationSelection = (value: string): void => {
    const location = locations.find((candidate) => candidate.id === value);

    if (location !== undefined) {
      updateLocation(location.label);
    }
  };

  const handleShellOpenChange = (nextOpen: boolean): void => {
    closeShell(nextOpen, controller.isDiscardDialogOpen, customRepeatOpen, {
      closeCustomRepeat,
      dismissDiscard: controller.dismissDiscard,
      requestCancel: controller.requestCancel,
    });
  };

  const onPeopleSelect = (option: ComboboxOption): void => {
    const selectedIds = selectedPeopleIds ?? [];
    setDraft({
      ...controller.draft,
      attendeeIds: toggleAttendee(selectedIds, option.value),
    });
  };

  return {
    anchorRect,
    anchorRef,
    calendars,
    canSubmit,
    changeCustomRepeat,
    className,
    closeCustomRepeat,
    conferencingItems,
    controller,
    customRepeat,
    customRepeatOpen,
    direction,
    displayedEndDate,
    expandedContentShell: renderExpandedShell,
    fieldId,
    fieldMessages,
    firstError,
    formId,
    handleNativeSelectChange,
    handleShellOpenChange,
    idPrefix,
    locale,
    locationEditorOpen,
    locationItems,
    locationQuery,
    noOptionsLabel,
    onAllDayChange,
    onLocationSelection,
    onPeopleSelect,
    onRepeatPresetChange,
    onSubmit,
    overlayKind,
    peopleQuery,
    renderCompactShell,
    renderError,
    renderFields,
    renderFooter,
    renderHeader,
    repeatAnchorRef,
    repeatHint,
    repeatItems,
    repeatPreset,
    selectedCalendar,
    selectedPeopleIds,
    setCustomRepeatOpen,
    setDraft,
    setLocationEditorOpen,
    setPeopleQuery,
    submitError: controller.submitError,
    t,
    timeZoneFieldLabel,
    timeZoneLabel,
    updateLocation,
    visiblePeopleItems,
  };
};
