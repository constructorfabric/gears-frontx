import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { utcInstant } from "../../../core/model";
import type { CalendarEvent } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { SearchResults } from "../search-results";
import type {
  SearchResultContext,
  SearchResultsProps,
} from "../search-results";

const NOW = utcInstant("2026-08-24T08:00:00.000Z");

const EVENTS: readonly CalendarEvent[] = [
  timedEvent(
    "chemistry",
    "Introduction to Chemistry",
    "2026-08-24",
    "09:00",
    "10:00"
  ),
  timedEvent(
    "biology",
    "Biology Unleashed",
    "2026-08-25",
    "11:00",
    "12:00",
    "Maria Ruben"
  ),
  timedEvent(
    "history",
    "Modern History",
    "2026-08-26",
    "13:00",
    "14:00",
    undefined,
    "Café Wien"
  ),
];

const renderResults = (
  query: string,
  overrides: Partial<SearchResultsProps> = {}
) => {
  const props: SearchResultsProps = {
    direction: "ltr",
    events: EVENTS,
    locale: "en-US",
    now: NOW,
    onDismiss: vi.fn<() => void>(),
    onReveal: vi.fn<() => void>(),
    query,
    t,
    timeZone: UTC,
    ...overrides,
  };

  return { props, ...render(<SearchResults {...props} />) };
};

const settle = (): void => {
  act(() => {
    vi.advanceTimersByTime(250);
  });
};

describe(SearchResults, () => {
  it("renders the too-short state without searching", () => {
    vi.useFakeTimers();
    renderResults("c");
    settle();

    expect(screen.getByText("Type at least 2 characters")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("debounces and keeps previous results visible while the next query settles", () => {
    vi.useFakeTimers();
    const rendered = renderResults("chem");
    settle();

    rendered.rerender(<SearchResults {...rendered.props} query="history" />);
    expect(
      screen.getByRole("button", { name: /Introduction to Chemistry/iu })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Modern History/iu })
    ).toBeNull();

    settle();
    expect(
      screen.queryByRole("button", { name: /Introduction to Chemistry/iu })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Modern History/iu })
    ).toBeVisible();
  });

  it("groups matches by viewer day and announces the live result count", () => {
    vi.useFakeTimers();
    renderResults("chem");
    settle();

    expect(screen.getByRole("status")).toHaveTextContent("1 result");
    expect(screen.getByText("Today")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Introduction to Chemistry/iu })
    ).toBeVisible();
  });

  it("uses absolute headers beyond the relative day labels", () => {
    vi.useFakeTimers();
    renderResults("history");
    settle();

    expect(screen.getByText("Aug 26, 2026")).toBeVisible();
  });

  it("matches organizer and location and folds accents", () => {
    vi.useFakeTimers();

    const { unmount } = renderResults("maria");
    settle();
    expect(
      screen.getByRole("button", { name: /Biology Unleashed/iu })
    ).toBeVisible();

    unmount();
    renderResults("cafe");
    settle();
    expect(
      screen.getByRole("button", { name: /Modern History/iu })
    ).toBeVisible();
  });

  it("renders the ordinary no-result list without rows or alerts", () => {
    vi.useFakeTimers();
    const { unmount } = renderResults("zzzz");
    settle();
    expect(
      screen.queryByRole("button", { name: /Introduction to Chemistry/iu })
    ).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    unmount();
    renderResults("chem");
    settle();
    expect(
      screen.getByRole("button", { name: /Introduction to Chemistry/iu })
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reveals rows from pointer, Enter, and Space and dismisses from Escape", async () => {
    vi.useFakeTimers();
    const { props } = renderResults("chem");
    settle();

    const row = screen.getByRole("button", {
      name: /Introduction to Chemistry/iu,
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(row);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.keyboard("{Escape}");

    expect(props.onReveal).toHaveBeenCalledTimes(3);
    expect(props.onReveal).toHaveBeenCalledWith("chemistry", "2026-08-24");
    expect(props.onDismiss).toHaveBeenCalledOnce();
  });

  it("keeps one roving tab stop and supports Arrow, Home, and End navigation", async () => {
    vi.useFakeTimers();
    renderResults("st");
    settle();

    const rows = screen.getAllByRole("button");
    vi.useRealTimers();
    const user = userEvent.setup();

    expect(rows.map((row) => row.getAttribute("tabindex"))).toStrictEqual([
      "0",
      "-1",
    ]);

    rows[0]?.focus();
    await user.keyboard("{ArrowDown}");

    expect(
      screen.getAllByRole("button").map((row) => row.getAttribute("tabindex"))
    ).toStrictEqual(["-1", "0"]);

    await user.keyboard("{Home}");

    expect(screen.getAllByRole("button")[0]).toHaveFocus();

    await user.keyboard("{End}");

    expect(screen.getAllByRole("button")[1]).toHaveFocus();
  });

  it("renders supplied result and group-header slots", () => {
    vi.useFakeTimers();
    renderResults("chem", {
      renderGroupHeader: (group: string, count: number) => (
        <h3>{`${group}:${count}`}</h3>
      ),
      renderResult: (event: CalendarEvent, context: SearchResultContext) => (
        <p>{`${context.index}:${event.title}`}</p>
      ),
    });
    settle();

    expect(screen.getByText(/:1$/u)).toBeVisible();
    expect(screen.getByText("0:Introduction to Chemistry")).toBeVisible();
  });
});
