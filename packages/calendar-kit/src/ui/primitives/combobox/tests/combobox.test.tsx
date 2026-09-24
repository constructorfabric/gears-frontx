import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { createShadowHost } from "../../../../__test-utils__/setup";
import { Combobox } from "../combobox";
import type { ComboboxOption } from "../combobox";

import comboboxStyles from "../combobox.module.css";

const getCombobox = (): HTMLInputElement => {
  const input = screen.getByRole("combobox");

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected a combobox input");
  }

  return input;
};

const options: readonly ComboboxOption[] = [
  { label: "Alpha", value: "a" },
  { disabled: true, label: "Bravo", value: "b" },
  { label: "Charlie", value: "c" },
];

const EMPTY_SELECTED_VALUES: readonly string[] = [];

const renderCombobox = (props: Partial<Parameters<typeof Combobox>[0]> = {}) =>
  render(
    <Combobox
      id="people"
      aria-label="People"
      value=""
      options={options}
      onValueChange={() => {}}
      onSelect={() => {}}
      {...props}
    />
  );

const StatefulCombobox = ({
  selectedValues = EMPTY_SELECTED_VALUES,
  ...props
}: Partial<Parameters<typeof Combobox>[0]> = {}) => {
  const [value, setValue] = useState("");

  const [selected, setSelected] = useState<readonly string[]>(selectedValues);

  const handleSelect = (option: ComboboxOption): void => {
    setSelected((current) =>
      current.includes(option.value)
        ? current.filter((entry) => entry !== option.value)
        : [...current, option.value]
    );
    props.onSelect?.(option);
  };

  return (
    <Combobox
      id="people"
      aria-label="People"
      value={value}
      options={options}
      selectedValues={selected}
      onValueChange={setValue}
      onSelect={handleSelect}
      {...props}
    />
  );
};

describe(Combobox, () => {
  it("opens on focus and click with fixed listbox and correct aria wiring", async () => {
    renderCombobox();
    const input = screen.getByRole("combobox", { name: "People" });

    const user = userEvent.setup();
    await user.tab();

    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Alpha" }).id
    );

    fireEvent.pointerDown(input);
    await user.click(input);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it.each([false, true])(
    "keeps the first click from blur open (tags: %s)",
    async (tags) => {
      renderCombobox({ tags });
      const input = getCombobox();

      const user = userEvent.setup();
      await user.click(input);

      expect(screen.getByRole("listbox")).not.toBeNull();
    }
  );

  it("exposes the standalone control contract", () => {
    renderCombobox();
    const standaloneControl = getCombobox().closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    expect(standaloneControl).not.toBeNull();
    expect(standaloneControl).toHaveClass(
      comboboxStyles.controlStandalone,
      comboboxStyles.controlSizeL,
      comboboxStyles.controlResting
    );
    expect(standaloneControl).toHaveAttribute(
      "data-calendar-combobox-mode",
      "standalone"
    );
    expect(standaloneControl).toHaveAttribute(
      "data-calendar-combobox-state",
      "resting"
    );
  });

  it("merges the consumer class into the embedded control contract", () => {
    renderCombobox({ controlClassName: "form-control", embedded: true });
    const embeddedControl = getCombobox().closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    expect(embeddedControl).toHaveClass(
      comboboxStyles.controlEmbedded,
      "form-control"
    );
    expect(embeddedControl).toHaveAttribute(
      "data-calendar-combobox-mode",
      "embedded"
    );
    expect(embeddedControl).toHaveAttribute(
      "data-calendar-combobox-state",
      "resting"
    );
  });

  it("pins the tag chip structure and stable chip metadata", () => {
    renderCombobox({ closeOnSelect: false, selectedValues: ["a"], tags: true });

    const chip = screen.getByText("Alpha", {
      selector: `.${comboboxStyles.tag}`,
    });
    expect(chip).toHaveAttribute("data-calendar-combobox-chip", "");
    expect(chip).toHaveAttribute("data-calendar-combobox-value", "a");
    expect(
      within(chip).getByRole("button", { name: "Remove Alpha" })
    ).toBeInTheDocument();
    expect(chip.closest(`.${comboboxStyles.chips}`)).not.toBeNull();
  });

  it("puts the tag trigger in the shared trailing lane", () => {
    renderCombobox({ showChevron: true, tags: true });

    expect(screen.getByRole("button", { name: "Toggle options" })).toHaveClass(
      comboboxStyles.tagTrigger
    );
  });

  it("skips disabled options while arrowing and honours Home and End", async () => {
    renderCombobox();
    const input = screen.getByRole("combobox");

    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Charlie" }).id
    );

    await user.keyboard("{Home}");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Alpha" }).id
    );
    await user.keyboard("{End}");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Charlie" }).id
    );
  });

  it("commits the active option with Enter and closes the listbox", async () => {
    const onSelect = vi.fn<() => void>();
    renderCombobox({ onSelect });
    const input = screen.getByRole("combobox");

    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(options[2]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("opens with Space and closes with Escape and Tab without selecting", async () => {
    const onSelect = vi.fn<() => void>();
    renderCombobox({ onSelect });
    const input = screen.getByRole("combobox");

    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{Space}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).not.toBeNull();

    await user.tab();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(input);

    await user.tab();
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("calls onSearchChange while typing and preserves controlled value updates", async () => {
    const onSearchChange = vi.fn<() => void>();
    const onValueChange = vi.fn<() => void>();
    renderCombobox({ onSearchChange, onValueChange });
    const input = getCombobox();

    const user = userEvent.setup();
    await user.click(input);
    await user.paste("al");

    expect(onSearchChange).toHaveBeenCalledWith("al");
    expect(onValueChange).toHaveBeenCalledWith("al");
    expect(input.value).toBe("");
  });

  it("preserves spaces while typing multi-word queries", async () => {
    render(<StatefulCombobox />);
    const input = getCombobox();

    const user = userEvent.setup();
    await user.click(input);
    await user.paste("Lena Markovic");

    expect(input.value).toBe("Lena Markovic");
  });

  it("opens from a click without a prior focus event", async () => {
    renderCombobox();

    const user = userEvent.setup();
    await user.click(getCombobox());

    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("forwards search changes while read-only or disabled without mutating", () => {
    const onChange = vi.fn<() => void>();
    const onValueChange = vi.fn<() => void>();

    renderCombobox({ onChange, onValueChange, readOnly: true });
    fireEvent.change(getCombobox(), { target: { value: "blocked" } });

    expect(onChange).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();

    renderCombobox({ disabled: true, onChange, onValueChange });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "blocked" },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("does not open read-only controls but keeps them focusable", async () => {
    renderCombobox({ readOnly: true });
    const input = screen.getByRole("combobox");

    const user = userEvent.setup();
    await user.tab();
    await user.click(input);
    await user.keyboard("{ArrowDown}");

    expect(input.getAttribute("readonly")).toBe("");
    expect(input.getAttribute("aria-readonly")).toBe("true");
    expect(input.getAttribute("disabled")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open when disabled", async () => {
    renderCombobox({ disabled: true });
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    const user = userEvent.setup();
    await user.click(input);
    await user.keyboard("{ArrowDown}");

    expect(input.getAttribute("disabled")).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("wires label, message, invalid state, and left icon", () => {
    renderCombobox({
      "aria-label": undefined,
      iconLeft: <span>P</span>,
      invalid: true,
      label: "People label",
      message: "Enter a person",
    });

    const input = screen.getByRole("combobox", { name: "People label" });
    const message = screen.getByText("Enter a person");

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
    screen.getByText("P");
  });

  it("renders loading and empty states inside the shared panel", async () => {
    renderCombobox({ loading: true, loadingMessage: "Finding people…" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));

    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Finding people…");

    renderCombobox({ emptyMessage: "No people found", options: [] });
    await user.click(screen.getAllByRole("combobox")[1]);
    screen.getByText(/No people found/u);
  });

  it("collapses the option list while it is empty so the empty message stays centred", async () => {
    renderCombobox({ emptyMessage: "No people found", options: [] });
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));

    const list = screen.getByRole("listbox");

    expect(list.childElementCount).toBe(0);
    expect(list.classList.contains(comboboxStyles.panelList)).toBeTruthy();
  });

  it("marks selected values, renders custom options, and keeps open for multi-select", async () => {
    const onSelect = vi.fn<() => void>();
    renderCombobox({
      closeOnSelect: false,
      onSelect,
      renderOption: (option) => <strong>{option.label}</strong>,
      selectedValues: ["c"],
    });
    const user = userEvent.setup();
    await user.tab();

    const charlie = screen.getByRole("option", { name: "Charlie" });
    fireEvent.pointerDown(charlie);

    expect(onSelect).toHaveBeenCalledWith(options[2]);
    expect(
      screen
        .getByRole("option", { name: "Charlie" })
        .getAttribute("aria-selected")
    ).toBe("true");
    expect(
      screen
        .getByRole("option", { name: "Charlie" })
        .querySelector("svg.lucide-check")
    ).not.toBeNull();
    expect(screen.getByRole("option", { name: "Charlie" }).className).toContain(
      "itemNoCheck"
    );

    await user.keyboard("{End}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(options[2]);
    screen.getByRole("listbox");
  });

  it("shows the trailing check on selected rows only when asked", async () => {
    renderCombobox({ selectedValues: ["c"], showSelectedCheck: true });

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));

    expect(
      screen
        .getByRole("option", { name: "Charlie" })
        .querySelector("svg.lucide-check")
    ).toBeTruthy();
    expect(
      screen
        .getByRole("option", { name: "Alpha" })
        .querySelector("svg.lucide-check")
    ).toBeNull();
  });

  it("supports an explicit tag removal callback", async () => {
    const onTagRemove = vi.fn<() => void>();
    renderCombobox({ onTagRemove, selectedValues: ["a"], tags: true });

    const remove = screen.getByRole("button", { name: "Remove Alpha" });
    fireEvent.pointerDown(remove);
    const user = userEvent.setup();
    await user.click(remove);

    expect(onTagRemove).toHaveBeenCalledWith("a");
  });

  it("renders removable tags and sends removed option through onSelect", async () => {
    const onSelect = vi.fn<() => void>();
    renderCombobox({ onSelect, selectedValues: ["a", "c"], tags: true });

    screen.getByText("Alpha");
    screen.getByText("Charlie");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove Alpha" }));
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it("keeps the popup in the calendar shadow root", async () => {
    const { host, root: shadowRoot } = createShadowHost();
    const mount = document.createElement("div");
    shadowRoot.append(mount);

    const { unmount } = render(
      <Combobox
        id="shadow-people"
        aria-label="People"
        value=""
        options={options}
        onValueChange={() => {}}
        onSelect={() => {}}
      />,
      { container: mount }
    );

    const input = within(mount).getByRole("combobox");
    const user = userEvent.setup();
    await user.click(input);

    const shadowListbox = shadowRoot.querySelector('[role="listbox"]');

    if (shadowListbox === null) {
      throw new Error("Expected a listbox in the shadow root");
    }

    expect(shadowListbox.getRootNode()).toBe(shadowRoot);
    expect(screen.queryByRole("listbox")).toBeNull();

    unmount();
    host.remove();
  });

  it("closes on outside pointer-down and ancestor scroll", async () => {
    render(<StatefulCombobox />);
    const input = screen.getByRole("combobox");

    const user = userEvent.setup();
    await user.click(input);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(input);
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
