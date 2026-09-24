import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import type { CalendarAttendee } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { EventDetailPanel } from "../event-detail-panel";
import type { EventDetailPanelProps } from "../event-detail-panel";

const attendee = (
  id: string,
  response: CalendarAttendee["response"]
): CalendarAttendee => ({ displayName: `Person ${id}`, id, response });

const renderPreview = (overrides: Partial<EventDetailPanelProps> = {}) => {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const onClose = vi.fn<() => void>();

  render(
    <EventDetailPanel
      anchorElement={anchor}
      direction="ltr"
      event={timedEvent({
        attendees: [attendee("a", "accepted"), attendee("b", "declined")],
        description: "Weekly sync",
        id: "sync",
        joinUrl: "https://meet.example.com/sync",
        location: "BG-Istanbul",
        organizer: "Vitaly Panteleev",
        organizerEmail: "vitaly@example.com",
        rsvp: { awaiting: 0, invited: 2, maybe: 0, no: 1, yes: 1 },
        startDate: "2026-09-23",
        title: "1:1 sync",
      })}
      locale="en-US"
      onClose={onClose}
      onDelete={() => {}}
      onEdit={() => {}}
      open
      t={t}
      timeZone={UTC}
      {...overrides}
    />
  );

  return { anchor, onClose };
};

const detail = (): HTMLElement =>
  screen.getByRole("dialog", { name: "1:1 sync" });

describe("EventDetailPanel anchored preview", () => {
  it("opens beside the anchor as a non-modal popover with every detail section", () => {
    renderPreview();

    const preview = detail();

    assert(preview).not.toHaveAttribute("aria-modal");

    for (const label of [
      "Date & time",
      "Location",
      "Organizer",
      "Conferencing",
      "Participants",
      "Time zone",
      "Description",
    ]) {
      assert(
        within(preview).getByRole("heading", { name: label })
      ).toBeInTheDocument();
    }

    assert(within(preview).getByText("vitaly@example.com")).toBeInTheDocument();
    assert(within(preview).getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "https://meet.example.com/sync"
    );
    assert(within(preview).getByText("1 yes")).toBeInTheDocument();
    assert(
      within(preview).getByText("GMT+0 UTC, 09:00 - 10:00")
    ).toBeInTheDocument();
    assert(
      within(preview).getByRole("button", { name: "Edit" })
    ).toBeInTheDocument();
    assert(
      within(preview).getByRole("button", { name: "Delete" })
    ).toBeInTheDocument();
  });

  it("expands into a larger dialog and collapses back to the preview", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Expand" }));
    assert(detail()).toHaveAttribute("aria-modal", "true");
    assert(within(detail()).getByRole("complementary")).toHaveTextContent(
      "Person b"
    );

    await user.click(screen.getByRole("button", { name: "Collapse" }));
    assert(detail()).not.toHaveAttribute("aria-modal");
  });

  it("stays open when another event card is pressed, so that card can take over", () => {
    const { onClose } = renderPreview();
    const otherCard = document.createElement("button");
    otherCard.dataset.eventId = "other";
    document.body.append(otherCard);

    fireEvent.pointerDown(otherCard);

    assert(onClose).not.toHaveBeenCalled();
    assert(detail()).toBeInTheDocument();
  });

  it("closes on an outside press elsewhere", () => {
    const { onClose } = renderPreview();

    fireEvent.pointerDown(document.body);

    assert(onClose).toHaveBeenCalledOnce();
  });

  it("opens as the larger dialog without an anchor", () => {
    renderPreview({ anchorElement: null });

    assert(detail()).toHaveAttribute("aria-modal", "true");
    assert(screen.queryByRole("button", { name: "Expand" })).toBeNull();
  });
});
