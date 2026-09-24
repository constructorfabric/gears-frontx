import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
} from "../../../core/model";
import type {
  CreateEventDraft,
  CreateEventResult,
  TimedCreateEventDraft,
} from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPopover } from "../create-event-popover";
import type { CreateEventPopoverProps } from "../create-event-popover";

import styles from "../create-event.module.css";

const DATE = calendarDate("2026-08-24");

const NEXT_DATE = calendarDate("2026-08-25");

const headerT: CalendarTranslate = (key) => {
  if (key.endsWith(".expand")) {
    return "Expand create event";
  }
  if (key.endsWith(".collapse")) {
    return "Collapse create event";
  }
  if (key.endsWith(".close")) {
    return "Close create event";
  }
  return t(key);
};

const repeatPresetT: CalendarTranslate = (key) => {
  if (key.endsWith(".none")) {
    return "No repeat";
  }
  if (key.endsWith(".daily")) {
    return "Daily";
  }
  if (key.endsWith(".weekly")) {
    return "Weekly";
  }
  if (key.endsWith(".biweekly")) {
    return "Every other week";
  }
  if (key.endsWith(".monthly")) {
    return "Monthly";
  }
  if (key.endsWith(".custom")) {
    return "Custom";
  }
  return t(key);
};

const BASE_DRAFT: TimedCreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const submitSpy = (result: CreateEventResult | null = null) =>
  vi.fn<
    (submittedDraft: CreateEventDraft) => Promise<CreateEventResult> | undefined
  >(
    (
      _submittedDraft: CreateEventDraft
    ): Promise<CreateEventResult> | undefined =>
      result === null ? undefined : Promise.resolve(result)
  );

const popoverProps = (
  overrides: Partial<CreateEventPopoverProps> = {}
): CreateEventPopoverProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [{ id: "meet", label: "Constructor Meet" }],
  defaultDraft: BASE_DRAFT,
  defaultOpen: true,
  direction: "ltr",
  locale: "en-US",
  locations: [
    { id: "room-1", label: "Science Hall 204" },
    { id: "room-2", label: "Virtual room" },
  ],
  onCancel: () => {},
  onSubmit: submitSpy(),
  people: [
    { id: "person-1", label: "Ada Lovelace" },
    { id: "person-2", label: "Grace Hopper" },
  ],
  t,
  timeZone: UTC,
  ...overrides,
});

const renderPopover = (overrides: Partial<CreateEventPopoverProps> = {}) =>
  render(<CreateEventPopover {...popoverProps(overrides)} />);

const getCreateDialog = (): HTMLElement =>
  screen.getByRole("dialog", { name: /create/iu });

const fieldRow = (field: RegExp, scope?: HTMLElement): HTMLElement => {
  let row = (scope === undefined ? screen : within(scope)).getByLabelText(
    field
  ).parentElement;

  while (
    row !== null &&
    row.querySelector('[aria-label^="Open calendar"]') === null
  ) {
    row = row.parentElement;
  }

  if (row === null) {
    throw new Error("Missing date row");
  }

  return row;
};

const openCalendarFor = (field: RegExp, scope?: HTMLElement): void => {
  const row = fieldRow(field, scope);

  act(() => {
    fireEvent.click(
      within(row).getByRole("button", { name: /open calendar/iu })
    );
  });
};

const pickDate = (field: RegExp, day: RegExp, scope?: HTMLElement): void => {
  openCalendarFor(field, scope);

  const calendar = screen.getByRole("dialog", { name: /choose date/iu });

  act(() => {
    fireEvent.click(within(calendar).getByRole("button", { name: day }));
  });
};

const clearDate = (field: RegExp): void => {
  const row = fieldRow(field);

  act(() => {
    fireEvent.click(within(row).getByRole("button", { name: /clear date/iu }));
  });
};

const getSubmitButton = (): HTMLElement =>
  screen.getByRole("button", { name: /create|save|submit/iu });

const setInputValue = async (
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  value: string
): Promise<void> => {
  await user.clear(input);

  if (value !== "") {
    await user.type(input, value);
  }
};

const chooseSelectOption = (
  triggerName: RegExp,
  optionName: string | RegExp,
  triggerIndex = 0
): void => {
  const triggers = screen.getAllByRole("combobox", { name: triggerName });
  const trigger = triggers.find((_, index) => index === triggerIndex);

  if (trigger === undefined) {
    throw new Error(`Missing combobox ${triggerIndex}`);
  }

  act(() => {
    fireEvent.click(trigger);
  });
  const option = screen.getByRole("option", { name: optionName });
  act(() => {
    fireEvent.pointerDown(option);
    fireEvent.click(option);
  });
};

describe("CreateEventPopover public shell", () => {
  it("keeps translated header actions icon-only while preserving accessible names", () => {
    renderPopover({ t: headerT });

    const expand = screen.getByRole("button", { name: "Expand create event" });
    const close = screen.getByRole("button", { name: "Close create event" });

    assert(expand).toHaveAttribute("aria-label", "Expand create event");
    assert(close).toHaveAttribute("aria-label", "Close create event");
    assert(expand.textContent).toBe("");
    assert(close.textContent).toBe("");
  });

  it("renders the translated schedule prefix only in the calendar option", () => {
    renderPopover();

    const trigger = screen.getByRole("combobox", { name: /calendar/iu });
    assert(trigger).toHaveTextContent("Teaching");
    assert(trigger).not.toHaveTextContent("Schedule:");

    fireEvent.click(trigger);

    assert(
      screen.getByRole("option", { name: "Schedule: Teaching" })
    ).toBeInTheDocument();
  });

  it("follows controlled open state and exposes an accessible create dialog", () => {
    const { rerender } = renderPopover({ defaultOpen: undefined, open: true });

    assert(getCreateDialog()).toBeInTheDocument();

    rerender(
      <CreateEventPopover
        {...popoverProps({ defaultOpen: undefined, open: false })}
      />
    );

    assert(screen.queryByRole("dialog", { name: /create/iu })).toBeNull();
  });

  it("renders injected directory resources and a consumer field slot without app adapters", () => {
    renderPopover({
      renderFields: () => <span>Host-specific fields</span>,
      renderFooter: () => <span>Host footer</span>,
      renderHeader: () => <span>Host header</span>,
    });

    assert(screen.getByText("Host header")).toBeInTheDocument();
    assert(screen.getByText("Host-specific fields")).toBeInTheDocument();
    assert(screen.getByText("Host footer")).toBeInTheDocument();

    const people = screen.getByLabelText(/people|attendee/iu);
    fireEvent.focus(people);
    fireEvent.change(people, { target: { value: "Ada" } });

    assert(
      screen.getByRole("option", { name: "Ada Lovelace" })
    ).toBeInTheDocument();
    assert(screen.queryByRole("option", { name: "Grace Hopper" })).toBeNull();

    act(() => {
      fireEvent.change(people, { target: { value: "Grace" } });
    });

    assert(
      screen.getByRole("option", { name: "Grace Hopper" })
    ).toBeInTheDocument();
    assert(screen.queryByRole("option", { name: "Ada Lovelace" })).toBeNull();
  });

  it("uses the compact shell slot and the expanded shell slot for their respective modes", () => {
    const { rerender } = renderPopover({
      renderCompactShell: (content) => (
        <div>
          <span>Compact host shell</span>
          {content}
        </div>
      ),
      renderExpandedShell: (content) => (
        <div>
          <span>Expanded host shell</span>
          {content}
        </div>
      ),
    });

    assert(screen.getByText("Compact host shell")).toBeInTheDocument();
    assert(screen.queryByText("Expanded host shell")).toBeNull();

    rerender(
      <CreateEventPopover
        {...popoverProps({
          expanded: true,
          renderCompactShell: (content) => (
            <div>
              <span>Compact host shell</span>
              {content}
            </div>
          ),
          renderExpandedShell: (content) => (
            <div>
              <span>Expanded host shell</span>
              {content}
            </div>
          ),
        })}
      />
    );

    assert(screen.getByText("Expanded host shell")).toBeInTheDocument();
  });
});

describe("CreateEventPopover date and time row fidelity", () => {
  it("shows the day count for a zero-day range", () => {
    renderPopover();

    assert(screen.getByText("0 days")).toBeInTheDocument();
  });
});

describe("CreateEventPopover draft and validation behaviour", () => {
  it("leaves every field valid until the draft actually fails validation", () => {
    renderPopover();

    for (const label of [/title/iu, /end time/iu, /end date/iu]) {
      assert(screen.getByLabelText(label)).not.toHaveAttribute(
        "aria-invalid",
        "true"
      );
    }

    assert(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("disables Save for an invalid draft and exposes field-level reasons without submitting", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    await setInputValue(user, screen.getByLabelText(/title/iu), " ");
    await setInputValue(user, screen.getByLabelText(/end time/iu), "08:00");

    const save = getSubmitButton();
    assert(save).toBeDisabled();

    await user.click(save);
    assert(onSubmit).not.toHaveBeenCalled();

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");

    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByLabelText(/title/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByLabelText(/end time/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByRole("alert")).toHaveTextContent(/title|required/iu);
    assert(
      screen.getAllByRole("status").map((status) => status.textContent)
    ).toStrictEqual(assert.arrayContaining(["End must be after start"]));
  });

  it("submits an all-day draft with null clocks and an exclusive end date", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    const allDay = screen.getByRole("switch", { name: /all day/iu });
    assert(allDay).toHaveAccessibleName("All day");
    assert(allDay).toHaveAttribute("aria-checked", "false");
    await user.click(allDay);
    assert(allDay).toHaveAttribute("aria-checked", "true");

    assert(screen.getByLabelText(/start time/iu)).toBeDisabled();
    assert(screen.getByLabelText(/end time/iu)).toBeDisabled();

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      allDay: true,
      endDate: NEXT_DATE,
      endTime: null,
      startTime: null,
    });
  });

  it("opens custom repeat as a layered popover, preserves its choices, and serializes the rule", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialogs = screen.getAllByRole("dialog");
    assert(repeatDialogs).toHaveLength(2);
    const repeatView = screen.getByRole("dialog", { name: /repeat/iu });

    const interval =
      within(repeatView).getByLabelText(/^(?:every|interval)$/iu);
    act(() => {
      fireEvent.change(interval, { target: { value: "1" } });
    });

    assert(
      within(repeatView).queryByRole("checkbox", { name: /monday/iu })
    ).toBeNull();
    const monday = within(repeatView).getByRole("button", { name: /monday/iu });
    const wednesday = within(repeatView).getByRole("button", {
      name: /wednesday/iu,
    });
    assert(monday).toHaveAttribute("aria-pressed", "true");
    assert(wednesday).toHaveAttribute("aria-pressed", "false");
    act(() => {
      fireEvent.click(wednesday);
    });
    assert(monday).toHaveAttribute("aria-pressed", "true");
    assert(wednesday).toHaveAttribute("aria-pressed", "true");

    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /back/iu })
      );
    });

    assert(screen.queryByRole("alertdialog")).toBeNull();
    const mainDialog = screen.getByRole("dialog");
    assert(
      within(mainDialog).getByRole("combobox", { name: /repeat/iu })
    ).toHaveTextContent("Custom");

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });
  });

  it("returns from the repeat popover on Escape without closing the create dialog", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialogs = screen.getAllByRole("dialog");
    assert(repeatDialogs).toHaveLength(2);
    const repeatView = screen.getByRole("dialog", { name: /repeat/iu });
    assert(
      within(repeatView).getByRole("button", { name: /back/iu })
    ).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(repeatView, { key: "Escape" });
    });

    assert(screen.queryByRole("alertdialog")).toBeNull();
    const mainDialog = screen.getByRole("dialog");
    assert(mainDialog).toBeInTheDocument();
    assert(
      within(mainDialog).getByRole("combobox", { name: /repeat/iu })
    ).toBeInTheDocument();
    assert(
      within(mainDialog).queryByLabelText(/^(?:every|interval)$/iu)
    ).toBeNull();
  });

  it("keeps the repeat card above the expanded create sheet", () => {
    renderPopover({ defaultExpanded: true });

    chooseSelectOption(/repeat/iu, /^custom/iu);
    const expandedCreateDialog = getCreateDialog();
    const repeatDialog = screen.getByRole("dialog", { name: /repeat/iu });

    assert(expandedCreateDialog).toHaveAttribute("aria-modal", "true");
    assert(expandedCreateDialog).toContainElement(repeatDialog);

    act(() => {
      fireEvent.click(
        within(repeatDialog).getByRole("button", { name: /back/iu })
      );
    });

    assert(screen.queryByRole("dialog", { name: /repeat/iu })).toBeNull();
    assert(getCreateDialog()).toBe(expandedCreateDialog);
  });

  it("opens a draft with a non-preset rule on Custom", () => {
    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
      },
    });

    assert(
      screen.getByRole("combobox", { name: /repeat/iu })
    ).toHaveTextContent("Custom");
  });

  it("applies repeat edits as they are made, so the xmark keeps them", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialog = screen.getByRole("dialog", { name: /repeat/iu });
    act(() => {
      fireEvent.click(
        within(repeatDialog).getByRole("button", { name: /wednesday/iu })
      );
    });

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    assert(repeat).toHaveTextContent("Custom");
    assert(repeat).toHaveAccessibleDescription(
      "Repeats every week on Monday and Wednesday"
    );

    act(() => {
      fireEvent.click(
        within(repeatDialog).getByRole("button", { name: /close/iu })
      );
    });

    assert(screen.queryByRole("dialog", { name: /repeat/iu })).toBeNull();
    assert(getCreateDialog()).toBeInTheDocument();

    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });
  });

  it("describes the chosen repeat below the select", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^weekly$/iu);

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    assert(repeat).toHaveAccessibleDescription("Repeats every week on Monday");
  });
});

describe("CreateEventPopover coverage paths", () => {
  it("commits selected directory resources and removes a cleared location", () => {
    const onSubmit = submitSpy();

    const draft: TimedCreateEventDraft = {
      ...BASE_DRAFT,
      attendeeIds: ["person-1", "missing-person"],
    };

    renderPopover({
      calendars: [
        ...popoverProps().calendars,
        { colorFamily: "orange", id: "calendar-2", name: "Research" },
      ],
      defaultDraft: draft,
      onSubmit,
    });

    assert(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    assert(screen.queryByText("missing-person")).toBeNull();

    chooseSelectOption(/calendar/iu, /Research/u);

    const people = screen.getByRole("combobox", { name: /people/iu });
    act(() => {
      fireEvent.change(people, { target: { value: "Grace" } });
    });
    const personOption = screen.getByRole("option", { name: "Grace Hopper" });
    act(() => {
      fireEvent.pointerDown(personOption);
      fireEvent.click(personOption);
    });
    assert(screen.getByText("Grace Hopper")).toBeInTheDocument();

    const addLocation = screen.getByRole("button", { name: "Add a location" });
    act(() => {
      fireEvent.click(addLocation);
    });
    const location = screen.getByRole("combobox", { name: /location/iu });
    act(() => {
      fireEvent.change(location, { target: { value: "Science" } });
    });
    assert(location).toHaveValue("Science");
    act(() => {
      fireEvent.change(location, { target: { value: "" } });
    });
    assert(location).toHaveValue("");

    chooseSelectOption(/conferencing/iu, "Constructor Meet");
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      attendeeIds: ["person-1", "person-2"],
      calendarId: "calendar-2",
      conferencingProviderId: "meet",
      location: null,
    });
  });

  it("restores timed defaults when an all-day draft is made timed again", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();

    const allDayDraft: CreateEventDraft = {
      ...BASE_DRAFT,
      allDay: true,
      endDate: NEXT_DATE,
      endTime: null,
      startTime: null,
    };

    renderPopover({ defaultDraft: allDayDraft, onSubmit });

    const allDay = screen.getByRole("switch", { name: /all day/iu });
    assert(allDay).toHaveAccessibleName("All day");
    assert(allDay).toHaveAttribute("aria-checked", "true");
    await user.click(allDay);
    assert(allDay).toHaveAttribute("aria-checked", "false");

    assert(screen.getByLabelText(/start time/iu)).toBeEnabled();
    assert(screen.getByLabelText(/end time/iu)).toBeEnabled();
    assert(screen.getByLabelText(/start time/iu)).toHaveValue("09:00");
    assert(screen.getByLabelText(/end time/iu)).toHaveValue("10:00");

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: NEXT_DATE,
    });
  });

  it("updates date and time fields through valid and cleared values", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    pickDate(/start date/iu, /august 25, 2026/iu);
    pickDate(/end date/iu, /august 26, 2026/iu);
    clearDate(/end date/iu);
    pickDate(/end date/iu, /august 26, 2026/iu);
    act(() => {
      fireEvent.change(screen.getByLabelText(/start time/iu), {
        target: { value: "08:30" },
      });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText(/end time/iu), {
        target: { value: "" },
      });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText(/end time/iu), {
        target: { value: "11:30" },
      });
    });

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: calendarDate("2026-08-26"),
      endTime: parseLocalTime("11:30"),
      startDate: calendarDate("2026-08-25"),
      startTime: parseLocalTime("08:30"),
    });
  });

  it("resolves existing recurrence rules to their matching accessible labels", () => {
    const presets = [
      { label: "No repeat", rule: null },
      { label: "No repeat", rule: "" },
      { label: "Daily", rule: "FREQ=DAILY" },
      { label: "Weekly", rule: "FREQ=WEEKLY" },
      { label: "Every other week", rule: "FREQ=WEEKLY;INTERVAL=2" },
      { label: "Monthly", rule: "FREQ=MONTHLY" },
      { label: "Custom", rule: "FREQ=YEARLY" },
    ];

    for (const preset of presets) {
      const view = renderPopover({
        defaultDraft: { ...BASE_DRAFT, recurrenceRule: preset.rule },
        t: repeatPresetT,
      });

      assert(
        screen.getByRole("combobox", { name: "Repeat" })
      ).toHaveTextContent(preset.label);
      view.unmount();
    }
  });

  it("serializes every repeat preset through the accessible Select options", () => {
    const presets = [
      { label: "No repeat", rule: null },
      { label: "Daily", rule: "FREQ=DAILY" },
      { label: "Weekly", rule: "FREQ=WEEKLY" },
      { label: "Every other week", rule: "FREQ=WEEKLY;INTERVAL=2" },
      { label: "Monthly", rule: "FREQ=MONTHLY" },
    ];

    for (const preset of presets) {
      const onSubmit = submitSpy();
      const view = renderPopover({ onSubmit, t: repeatPresetT });

      chooseSelectOption(/repeat/iu, preset.label);
      act(() => {
        fireEvent.click(getSubmitButton());
      });

      assert(onSubmit).toHaveBeenCalledWith({
        ...BASE_DRAFT,
        recurrenceRule: preset.rule,
      });
      view.unmount();
    }
  });

  it("supports custom repeat interval fallback and weekday toggling", () => {
    const onSubmit = submitSpy();

    renderPopover({ onSubmit, t: repeatPresetT });
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialogs = screen.getAllByRole("dialog");
    assert(repeatDialogs).toHaveLength(2);
    const repeatView = screen.getByRole("dialog", { name: /repeat/iu });
    const interval =
      within(repeatView).getByLabelText(/^(?:every|interval)$/iu);
    act(() => {
      fireEvent.change(interval, { target: { value: "not-a-number" } });
    });

    const monday = within(repeatView).getByRole("button", { name: /monday/iu });
    assert(monday).toHaveAttribute("aria-pressed", "true");
    act(() => {
      fireEvent.click(monday);
    });
    assert(monday).toHaveAttribute("aria-pressed", "false");
    act(() => {
      fireEvent.click(monday);
    });
    assert(monday).toHaveAttribute("aria-pressed", "true");

    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /back/iu })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("renders the standalone On label in the custom repeat editor", () => {
    renderPopover();
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatView = screen.getByRole("dialog", { name: /repeat/iu });
    assert(
      repeatView.querySelector('[id$="-repeat-on-label"]')
    ).toHaveTextContent("On");
  });

  it("marks an end-date range error on the date field", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, endDate: calendarDate("2026-08-23") },
      onSubmit,
    });

    const save = getSubmitButton();
    assert(save).toBeDisabled();
    await user.click(save);

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");

    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByLabelText(/end date/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByRole("status")).toHaveTextContent(
      "End must be after start"
    );
  });

  it("shows the default submit error when the host does not provide an error slot", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy({
      error: { kind: "transport", message: "Calendar service unavailable" },
    });

    renderPopover({ onSubmit });
    await user.click(getSubmitButton());

    await waitFor(() => {
      assert(
        screen.getByText("Calendar service unavailable")
      ).toBeInTheDocument();
    });
    assert(getCreateDialog()).toBeInTheDocument();
  });
});

describe("CreateEventPopover discard and submit behaviour", () => {
  it("cancels a clean draft immediately and asks before discarding a dirty draft", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await user.click(screen.getByRole("button", { name: /cancel/iu }));

    assert(onCancel).toHaveBeenCalledOnce();
    assert(screen.queryByRole("alertdialog")).toBeNull();

    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });
    await setInputValue(
      user,
      screen.getByLabelText(/title/iu),
      "Changed before closing"
    );
    await user.click(screen.getByRole("button", { name: /cancel/iu }));

    const discardDialog = screen.getByRole("alertdialog");
    assert(discardDialog).toHaveTextContent(/discard|unsaved|changed/iu);
    assert(onCancel).toHaveBeenCalledOnce();

    await user.click(
      within(discardDialog).getByRole("button", { name: /keep/iu })
    );
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(getCreateDialog()).toBeInTheDocument();
    assert(onCancel).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /cancel/iu }));
    const discardButtons = within(screen.getByRole("alertdialog")).getAllByRole(
      "button"
    );

    const discardButton = discardButtons.at(-1);

    if (discardButton === undefined) {
      throw new Error("Missing discard confirmation button");
    }

    await user.click(discardButton);

    assert(onCancel).toHaveBeenCalledTimes(2);
  });

  it("closes the create popover after confirming discard", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await setInputValue(
      user,
      screen.getByLabelText(/title/iu),
      "Discard this draft"
    );
    await user.click(screen.getByRole("button", { name: /cancel/iu }));

    const createDialog = getCreateDialog();
    const discardDialog = screen.getByRole("alertdialog");
    assert(createDialog).toContainElement(discardDialog);
    assert(createDialog).toContainElement(discardDialog);

    const discardButtons = within(discardDialog).getAllByRole("button");
    const discardButton = discardButtons.at(-1);

    if (discardButton === undefined) {
      throw new Error("Missing discard confirmation button");
    }

    fireEvent.pointerDown(discardButton);
    fireEvent.click(discardButton);

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(screen.queryByRole("dialog", { name: /create/iu })).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps the custom repeat view in a card layered over the create popover", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const createDialog = getCreateDialog();
    const repeatDialog = screen.getByRole("dialog", { name: /repeat/iu });
    assert(repeatDialog).not.toBe(createDialog);
    assert(createDialog).toContainElement(screen.getByLabelText(/title/iu));
    assert(createDialog).toContainElement(repeatDialog);
    assert(repeatDialog).toHaveClass(styles.repeatPopover);
    assert(
      within(repeatDialog).getByRole("heading", { name: /repeat/iu })
    ).toBeInTheDocument();
  });

  it("renders each calendar colour in the selected value and option list", () => {
    renderPopover({
      calendars: [
        { colorFamily: "purple", id: "calendar-1", name: "Teaching" },
        { colorFamily: "turquoise", id: "calendar-2", name: "Research" },
        { colorFamily: "orange", id: "calendar-3", name: "Operations" },
        { colorFamily: "green", id: "calendar-4", name: "Students" },
        { colorFamily: "blue", id: "calendar-5", name: "Clients" },
        { colorFamily: "pink", id: "calendar-6", name: "Personal" },
      ],
    });

    const [calendar] = screen.getAllByRole("combobox");

    if (calendar === null) {
      throw new Error("Missing calendar select");
    }

    assert(calendar).toHaveTextContent("Teaching");

    fireEvent.click(calendar);
    assert(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("picks a start date from the date row calendar", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    const [openCalendar] = screen.getAllByRole("button", {
      name: /open calendar/iu,
    });

    await user.click(openCalendar);

    const calendar = screen.getByRole("dialog", { name: /choose date/iu });

    await user.click(
      within(calendar).getByRole("button", { name: /august 12, 2026/iu })
    );

    assert(screen.getByLabelText(/start date/iu)).toHaveValue("08/12/2026");

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      startDate: calendarDate("2026-08-12"),
    });
  });

  it("keeps the timed end date empty until a date is entered", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    const endDate = screen.getByLabelText(/end date/iu);
    assert(endDate).toHaveValue("mm/dd/yyyy");
    assert(screen.getByText("0 days")).toBeInTheDocument();

    pickDate(/end date/iu, /august 25, 2026/iu);
    assert(screen.getByLabelText(/end date/iu)).toHaveValue("08/25/2026");

    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: calendarDate("2026-08-25"),
    });
  });

  it("shows the timezone offset together with its city group", () => {
    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        timeZone: parseIanaTimeZone("Europe/Berlin"),
      },
    });

    assert(screen.getByLabelText(/time zone/iu).getAttribute("value")).toMatch(
      /GMT.*Berlin, Bratislava, Belgrade/u
    );
  });

  it("offers never and dated custom repeat endings and serializes both policies", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialog = screen.getByRole("dialog", { name: /repeat/iu });
    const repeatView = repeatDialog;

    assert(within(repeatView).getAllByRole("combobox")).toHaveLength(2);
    assert(within(repeatView).getByText("Ends")).toBeInTheDocument();

    const never = within(repeatView).getByRole("radio", { name: /never/iu });
    const on = within(repeatView).getByRole("radio", { name: /^on$/iu });
    assert(never).toBeChecked();
    assert(on).not.toBeChecked();
    assert(within(repeatView).queryByLabelText(/end date/iu)).toBeNull();

    fireEvent.click(on);
    assert(on).toBeChecked();
    assert(within(repeatView).getByLabelText(/end date/iu)).toBeInTheDocument();
    fireEvent.click(never);
    assert(within(repeatView).queryByLabelText(/end date/iu)).toBeNull();

    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /back/iu })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("serializes a dated custom repeat ending as an RRULE UNTIL date", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatView = screen.getByRole("dialog", { name: /repeat/iu });
    fireEvent.click(within(repeatView).getByRole("radio", { name: /^on$/iu }));
    pickDate(/end date/iu, /august 30, 2026/iu, repeatView);
    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /back/iu })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260830",
    });
  });

  it("shows a host-rendered error, stays open, and does not duplicate an async submit", async () => {
    const onSubmit = submitSpy({
      error: { kind: "transport", message: "Calendar service unavailable" },
    });

    renderPopover({
      onSubmit,
      renderError: (error) => <span>Host error: {error.message}</span>,
    });

    act(() => {
      fireEvent.click(getSubmitButton());
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      assert(
        screen.getByText("Host error: Calendar service unavailable")
      ).toBeInTheDocument();
    });
    assert(onSubmit).toHaveBeenCalledOnce();
    assert(getCreateDialog()).toBeInTheDocument();
  });

  it("submits a changed draft exactly once and keeps the callback host-owned", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    await setInputValue(user, screen.getByLabelText(/title/iu), "Exam review");
    await user.click(screen.getByRole("button", { name: "Add a location" }));
    const location = screen.getByRole("combobox", { name: /location/iu });
    act(() => {
      fireEvent.change(location, { target: { value: "Science Hall 204" } });
    });
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      location: "Science Hall 204",
      title: "Exam review",
    });
  });
});

describe("CreateEventPopover compact and expanded draft continuity", () => {
  it("preserves the edited draft when switching from Popover to the docked Sheet", async () => {
    const user = userEvent.setup({ delay: null });
    const onExpandedChange = vi.fn<() => void>();
    renderPopover({ defaultExpanded: false, onExpandedChange });

    await setInputValue(
      user,
      screen.getByLabelText(/title/iu),
      "Draft survives expansion"
    );
    await user.click(screen.getByRole("button", { name: /expand/iu }));

    const expandedDialog = getCreateDialog();
    assert(expandedDialog).toHaveAttribute("aria-modal", "true");
    assert(screen.getByLabelText(/title/iu)).toHaveValue(
      "Draft survives expansion"
    );
    assert(
      screen.getByRole("button", { name: /collapse/iu })
    ).toBeInTheDocument();
    assert(onExpandedChange).toHaveBeenCalledWith(true);
  });
});

describe("CreateEventPopover compact positioning", () => {
  it("positions the dialog from the anchorRect prop", () => {
    renderPopover({ anchorRect: new DOMRect(200, 300, 120, 40) });

    const dialog = getCreateDialog();
    assert(dialog.style.top).toBe("344px");
    assert(dialog.style.left).toBe("200px");
  });

  it("positions the dialog from the live anchorRef when attached", () => {
    const anchorElement = document.createElement("div");
    vi.spyOn(anchorElement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(50, 60, 80, 24)
    );

    renderPopover({ anchorRef: { current: anchorElement } });

    const dialog = getCreateDialog();
    assert(dialog.style.top).toBe("88px");
    assert(dialog.style.left).toBe("50px");
  });

  it("keeps the legacy default position without an anchor", () => {
    renderPopover();

    const dialog = getCreateDialog();
    assert(dialog.style.top).toBe("28px");
    assert(dialog.style.left).toBe("24px");
  });

  it("prefers the live anchorRef position over the static anchorRect", () => {
    const anchorElement = document.createElement("div");
    vi.spyOn(anchorElement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(50, 60, 80, 24)
    );

    renderPopover({
      anchorRect: new DOMRect(200, 300, 120, 40),
      anchorRef: { current: anchorElement },
    });

    const dialog = getCreateDialog();
    assert(dialog.style.top).toBe("88px");
    assert(dialog.style.left).toBe("50px");
  });
});

describe("CreateEventPopover footer separator placement", () => {
  it("renders the footer separator above the Cancel/Save actions row", () => {
    renderPopover();

    const cancel = screen.getByRole("button", { name: /cancel/iu });
    const save = screen.getByRole("button", { name: /create|save|submit/iu });

    const dividers = within(getCreateDialog()).getAllByRole("separator", {
      hidden: true,
    });
    const divider = dividers.at(-1);

    if (divider === undefined) {
      throw new Error("Missing footer separator");
    }

    assert(divider).toHaveAttribute("aria-hidden", "true");
    assert(divider.compareDocumentPosition(cancel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    assert(divider.compareDocumentPosition(save)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});

describe("CreateEventPopover combobox fidelity", () => {
  it("renders both pickers with the form-layer chrome contract", async () => {
    const user = userEvent.setup({ delay: null });
    renderPopover({
      people: [
        { id: "p1", label: "Ada" },
        { id: "p2", label: "Grace" },
      ],
    });

    const peopleInput = screen.getByRole("combobox", { name: /people/iu });
    const peopleControl = peopleInput.closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    if (peopleControl === null) {
      throw new Error("Missing people combobox control");
    }

    assert(peopleControl).toHaveClass(styles.comboboxFieldControl);
    assert(peopleControl).not.toHaveClass(styles.comboboxFieldTags);
    assert(peopleControl).toHaveAttribute(
      "data-calendar-combobox-mode",
      "embedded"
    );
    assert(peopleControl).toHaveAttribute(
      "data-calendar-combobox-state",
      "resting"
    );

    await user.click(screen.getByRole("button", { name: "Add a location" }));
    const locationInput = screen.getByRole("combobox", { name: /location/iu });
    const locationControl = locationInput.closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    if (locationControl === null) {
      throw new Error("Missing location combobox control");
    }

    assert(locationControl).toHaveClass(styles.comboboxFieldControl);
    assert(locationControl).toHaveAttribute(
      "data-calendar-combobox-mode",
      "embedded"
    );
    assert(locationControl).toHaveAttribute(
      "data-calendar-combobox-state",
      "resting"
    );
    assert(
      within(locationControl).getByRole("button", { name: "Toggle options" })
    ).toBeInTheDocument();
  });

  it("pins the people tag chip structure in the create form", () => {
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, attendeeIds: ["person-1"] },
    });

    const peopleInput = screen.getByRole("combobox", { name: /people/iu });
    const peopleControl = peopleInput.closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    if (peopleControl === null) {
      throw new Error("Missing people combobox control");
    }

    const chip = within(peopleControl).getByText("Ada Lovelace");
    assert(peopleControl).toHaveClass(styles.comboboxFieldTags);
    assert(chip).toHaveAttribute("data-calendar-combobox-value", "person-1");
    assert(chip).toHaveTextContent("Ada Lovelace");
    assert(
      within(chip).getByRole("button", {
        name: /remove ada lovelace/iu,
      })
    ).toBeInTheDocument();
  });
});
