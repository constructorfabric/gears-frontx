import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { List, ListBadge, ListHeader, ListItem, ListTag } from "../list";

import styles from "../list.module.css";

describe(List, () => {
  it("exposes the list and its items to assistive tech", () => {
    render(
      <List aria-label="Options">
        <ListItem label="Option 1" />
        <ListItem label="Option 2" />
      </List>
    );

    expect(screen.getByRole("list", { name: "Options" })).not.toBeNull();
    expect(screen.getByText("Option 1")).not.toBeNull();
    expect(screen.getByText("Option 2")).not.toBeNull();
  });

  it("marks the selected option for assistive tech only when it is an option", () => {
    render(
      <List role="listbox" aria-label="Options">
        <ListItem aria-selected role="option" label="Option 1" selected />
        <ListItem aria-selected={false} role="option" label="Option 2" />
      </List>
    );

    const [first, second] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("aria-selected", "false");
  });

  it("uses classes rather than data attributes for row state", () => {
    render(<ListItem label="Plain" selected disabled dragging />);

    const row = screen.getByText("Plain").closest(`.${styles.item}`);
    expect(row).toHaveClass(styles.selected, styles.disabled, styles.dragging);
  });

  it("blocks interaction when disabled", () => {
    render(<ListItem label="Disabled" disabled />);

    expect(
      screen.getByText("Disabled").closest(`.${styles.item}`)
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("runs the row action without also triggering the row", async () => {
    const events: string[] = [];

    render(
      <ListItem
        label="Item"
        onClick={() => {
          events.push("row");
        }}
        onAction={() => {
          events.push("action");
        }}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(events).toStrictEqual(["action"]);
  });

  it("renders the trailing more control with an accessible name", async () => {
    const events: string[] = [];

    render(
      <ListItem
        label="Item"
        moreLabel="Row menu"
        onMore={() => {
          events.push("more");
        }}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Row menu" }));

    expect(events).toStrictEqual(["more"]);
  });

  it("renders subtitle, support, tag and badge content", () => {
    render(
      <ListItem
        label="Judith Rodriguez"
        subtitle="j.jones@outlook.com"
        support="10"
        tag={<ListTag>Text</ListTag>}
        badge={<ListBadge>1</ListBadge>}
      />
    );

    expect(screen.getByText("j.jones@outlook.com")).not.toBeNull();
    expect(screen.getByText("10")).not.toBeNull();
    expect(screen.getByText("Text")).not.toBeNull();
    expect(screen.getByText("1")).not.toBeNull();
  });

  it("renders a group header above its items", () => {
    render(
      <List>
        <ListHeader>Basic block</ListHeader>
        <ListItem label="Text" />
      </List>
    );

    expect(screen.getByText("Basic block")).not.toBeNull();
  });
});
