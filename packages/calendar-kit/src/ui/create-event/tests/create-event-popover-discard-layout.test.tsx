import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type {
  CreateEventDraft,
  TimedCreateEventDraft,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPopover } from "../create-event-popover";
import type { CreateEventPopoverProps } from "../create-event-popover";

const DATE = calendarDate("2026-08-24");
const NEXT_DATE = calendarDate("2026-08-25");

const DRAFT: TimedCreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const popoverProps = (
  overrides: Partial<CreateEventPopoverProps> = {}
): CreateEventPopoverProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [],
  defaultDraft: DRAFT,
  defaultOpen: true,
  direction: "ltr",
  locale: "en-US",
  locations: [],
  onCancel: vi.fn<() => undefined>(),
  onSubmit: vi.fn<() => undefined>(),
  people: [],
  t,
  timeZone: UTC,
  ...overrides,
});

const renderPopover = (overrides: Partial<CreateEventPopoverProps> = {}) =>
  render(<CreateEventPopover {...popoverProps(overrides)} />);

const getCreateDialog = (): HTMLElement =>
  screen.getByRole("dialog", { name: /create/iu });

const changeTitle = async (
  user: ReturnType<typeof userEvent.setup>,
  value: string
): Promise<void> => {
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, value);
};

describe("CreateEventPopover discard layout", () => {
  it("closes a pristine draft immediately on outside interaction without mounting confirmation", () => {
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    assert(getCreateDialog()).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    assert(screen.queryByRole("dialog", { name: /create/iu })).toBeNull();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();
  });

  it("closes a pristine draft immediately on Escape without mounting confirmation", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await user.keyboard("{Escape}");

    assert(screen.queryByRole("dialog", { name: /create/iu })).toBeNull();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();
  });

  it("does not treat a pristine repeat-select interaction as a cancel request", () => {
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    act(() => {
      fireEvent.click(repeat);
    });
    const custom = screen.getByRole("option", { name: /custom/iu });
    act(() => {
      fireEvent.pointerDown(custom);
      fireEvent.click(custom);
    });

    assert(
      screen.getByRole("dialog", { name: /repeat/iu })
    ).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("keeps a dirty shell when the portaled repeat select opens its custom card", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await changeTitle(user, "Changed before opening repeat");

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    act(() => {
      fireEvent.click(repeat);
    });
    const custom = screen.getByRole("option", { name: /custom/iu });
    act(() => {
      fireEvent.pointerDown(custom);
      fireEvent.click(custom);
    });

    assert(
      screen.getByRole("dialog", { name: /repeat/iu })
    ).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("keeps the discard confirmation for a dirty draft on outside interaction", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });
    await changeTitle(user, "Changed before closing");

    fireEvent.pointerDown(document.body);

    const discardDialog = screen.getByRole("alertdialog");

    assert(discardDialog).toBeInTheDocument();
    assert(
      within(discardDialog).getByRole("button", { name: /keep/iu })
    ).toBeInTheDocument();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("keeps the discard confirmation for a dirty draft on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });
    await changeTitle(user, "Changed before closing");

    await user.keyboard("{Escape}");

    assert(screen.getByRole("alertdialog")).toBeInTheDocument();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("rebases a controlled draft when reopened after the host changes it while closed", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();

    const draftB: TimedCreateEventDraft = {
      ...DRAFT,
      endDate: NEXT_DATE,
      endTime: parseLocalTime("12:00"),
      startDate: NEXT_DATE,
      startTime: parseLocalTime("11:00"),
    };

    const view = renderPopover({
      defaultDraft: undefined,
      defaultOpen: undefined,
      draft: DRAFT,
      onCancel: () => {
        onCancel();
      },
      open: true,
    });

    fireEvent.pointerDown(document.body);

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();

    view.rerender(
      <CreateEventPopover
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          open: false,
        })}
      />
    );
    view.rerender(
      <CreateEventPopover
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          open: true,
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledTimes(2);
  });

  it("uses the controlled at-open baseline when discarding edits after a reopen", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    const onDraftChange = vi.fn<(draft: CreateEventDraft) => void>();

    const draftB: TimedCreateEventDraft = {
      ...DRAFT,
      endDate: NEXT_DATE,
      endTime: parseLocalTime("12:00"),
      startDate: NEXT_DATE,
      startTime: parseLocalTime("11:00"),
    };

    const view = renderPopover({
      defaultDraft: undefined,
      defaultOpen: undefined,
      draft: DRAFT,
      onCancel: () => {
        onCancel();
      },
      onDraftChange: (draft) => {
        onDraftChange(draft);
      },
      open: true,
    });

    view.rerender(
      <CreateEventPopover
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          onDraftChange: (draft) => {
            onDraftChange(draft);
          },
          open: false,
        })}
      />
    );
    view.rerender(
      <CreateEventPopover
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          onDraftChange: (draft) => {
            onDraftChange(draft);
          },
          open: true,
        })}
      />
    );

    await changeTitle(user, "Changed after reopen");

    const editedDraft: TimedCreateEventDraft = {
      ...draftB,
      title: "Changed after reopen",
    };
    view.rerender(
      <CreateEventPopover
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: editedDraft,
          onCancel: () => {
            onCancel();
          },
          onDraftChange: (draft) => {
            onDraftChange(draft);
          },
          open: true,
        })}
      />
    );
    await user.keyboard("{Escape}");

    const discardDialog = screen.getByRole("alertdialog");

    assert(discardDialog).toBeInTheDocument();
    assert(onCancel).not.toHaveBeenCalled();

    await user.click(
      within(discardDialog).getByRole("button", { name: /keep/iu })
    );

    assert(getCreateDialog()).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    const reopenedDiscardDialog = screen.getByRole("alertdialog");
    await user.click(
      within(reopenedDiscardDialog).getByRole("button", { name: /discard/iu })
    );

    assert(onDraftChange).toHaveBeenCalledWith(draftB);
    assert(onCancel).toHaveBeenCalledOnce();
    assert(screen.queryByRole("alertdialog")).toBeNull();
  });
});
