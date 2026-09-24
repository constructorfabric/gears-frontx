import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, useRef, useState } from "react";
import type { Ref } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent } from "../../dialog/dialog";
import { Listbox } from "../../listbox-internals";
import type { ListboxOption, ListboxProps } from "../../listbox-internals";
import { Select } from "../select";
import type { SelectOption } from "../select";

import selectStyles from "../select.module.css";

const activeOption = () =>
  screen
    .getAllByRole("option")
    .find((option) => Object.hasOwn(option.dataset, "calendarActive"));

const getShadowListbox = (root: ShadowRoot): HTMLElement => {
  const listboxes = root.querySelectorAll<HTMLElement>('[role="listbox"]');

  if (listboxes.length !== 1) {
    throw new Error(
      `Expected one shadow-root listbox, found ${listboxes.length}`
    );
  }

  const listbox = listboxes.item(0);

  if (listbox === null) {
    throw new Error("Expected a shadow-root listbox");
  }
  return listbox;
};

const options: readonly SelectOption[] = [
  { label: "Alpha", value: "a" },
  { disabled: true, label: "Bravo", value: "b" },
  { label: "Charlie", value: "c" },
];

const renderSelect = (props: Partial<Parameters<typeof Select>[0]> = {}) =>
  render(
    <Select
      id="calendar"
      aria-label="Calendar"
      options={options}
      value="a"
      onValueChange={() => {}}
      {...props}
    />
  );

type InternalListboxProps = Omit<ListboxProps, "anchorRef" | "ref"> & {
  readonly listboxRef?: Ref<HTMLDivElement>;
};

const InternalListbox = ({ listboxRef, ...props }: InternalListboxProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);

  return <Listbox {...props} ref={listboxRef} anchorRef={anchorRef} />;
};

const StatefulSelect = (props: Partial<Parameters<typeof Select>[0]> = {}) => {
  const { value: initialValue, ...selectProps } = props;

  const [value, setValue] = useState(initialValue);

  return (
    <Select
      id="calendar"
      aria-label="Calendar"
      options={selectProps.options ?? options}
      value={value}
      onValueChange={(nextValue) => {
        setValue(nextValue);
      }}
      {...selectProps}
    />
  );
};

describe(Select, () => {
  it("renders a combobox trigger with selected text and closed aria state", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox", { name: "Calendar" });

    expect(trigger.textContent).toContain("Alpha");
    expect(trigger.getAttribute("aria-controls")).toBeNull();
    expect(trigger.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("opens and closes by click with matching listbox controls", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox");

    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(listbox.id);

    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the popup composition on the ui-kit Base UI nodes", () => {
    renderSelect({
      options: [
        {
          dividerAfter: true,
          icon: <span>Avatar</span>,
          label: "Alpha",
          value: "a",
        },
        { label: "Charlie", value: "c" },
      ],
      showSelectedCheck: true,
    });
    fireEvent.click(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    const popup = listbox.closest<HTMLElement>(`.${selectStyles.popup}`);
    const selected = screen.getByRole("option", { name: "Alpha" });
    const itemText = selected.querySelector(":scope > div");
    const leadingIcon = itemText?.querySelector(
      `:scope > .${selectStyles.optionIcon}`
    );
    const indicator = selected.querySelector(":scope > span:last-child");

    const separator = screen.getByRole("separator");
    expect({
      indentClass: itemText?.firstElementChild?.classList.contains(
        selectStyles.optionIndent
      ),
      indicatorHidden: indicator?.getAttribute("aria-hidden"),
      itemTextExists: itemText !== null,
      leadingIconExists: leadingIcon !== null,
      leadingIconText: leadingIcon?.textContent,
      listboxRole: listbox.getAttribute("role"),
      popupClass: popup?.classList.contains(selectStyles.popup),
      popupContainsListbox: popup?.contains(listbox),
      selectedClass: selected.classList.contains(selectStyles.item),
      selectedData: selected.dataset.selected,
      separatorClass: separator.classList.contains(selectStyles.separator),
      separatorListbox: separator.parentElement?.parentElement === listbox,
      separatorParentRole: separator.parentElement?.getAttribute("role"),
      separatorPrevious: separator.previousElementSibling === selected,
    }).toStrictEqual({
      indentClass: true,
      indicatorHidden: "true",
      itemTextExists: true,
      leadingIconExists: true,
      leadingIconText: "Avatar",
      listboxRole: "listbox",
      popupClass: true,
      popupContainsListbox: true,
      selectedClass: true,
      selectedData: "",
      separatorClass: true,
      separatorListbox: true,
      separatorParentRole: "group",
      separatorPrevious: true,
    });
  });

  it("keeps no-icon labels on the 8px indent slot", () => {
    renderSelect({
      options: [
        { label: "Alpha", value: "a" },
        { icon: <span>Avatar</span>, label: "Charlie", value: "c" },
      ],
    });
    fireEvent.click(screen.getByRole("combobox"));

    const plainItem = screen.getByRole("option", { name: "Alpha" });
    const iconItem = screen.getByRole("option", { name: "Charlie" });
    const plainText = plainItem.querySelector(":scope > div");
    const iconText = iconItem.querySelector(":scope > div");

    expect(plainText?.firstElementChild).toHaveClass(selectStyles.optionIndent);
    expect(iconText?.firstElementChild).toHaveClass(selectStyles.optionIndent);
    expect(
      iconText?.querySelector(`:scope > .${selectStyles.optionIcon}`)
    ).not.toBeNull();
  });

  it("opens from keyboard, skips disabled options, and handles Home/End wrapping", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");

    const activeNames = [activeOption()?.textContent];

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    activeNames.push(activeOption()?.textContent);

    fireEvent.keyDown(listbox, { key: "End" });
    activeNames.push(activeOption()?.textContent);

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    activeNames.push(activeOption()?.textContent);

    fireEvent.keyDown(listbox, { key: "Home" });
    activeNames.push(activeOption()?.textContent);

    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    activeNames.push(activeOption()?.textContent);

    expect(activeNames).toStrictEqual([
      "Alpha",
      "Charlie",
      "Charlie",
      "Alpha",
      "Alpha",
      "Charlie",
    ]);
  });

  it("uses typeahead and updates the active option on hover", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox");

    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "c" });

    expect(activeOption()).toBe(
      screen.getByRole("option", { name: "Charlie" })
    );

    fireEvent.mouseEnter(screen.getByRole("option", { name: "Alpha" }));
    expect(activeOption()).toBe(screen.getByRole("option", { name: "Alpha" }));

    fireEvent.keyDown(listbox, { key: "Escape" });
    fireEvent.keyDown(trigger, { key: "Escape" });
  });

  it("selects with Enter and Space, then closes and restores focus", () => {
    const onValueChange = vi.fn<() => void>();
    renderSelect({ onValueChange });
    const trigger = screen.getByRole("combobox");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: " " });
    expect(onValueChange).toHaveBeenCalledWith("a");
  });

  it("closes with Escape or Tab and restores focus only for Escape", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox");

    fireEvent.keyDown(trigger, { key: "Enter" });
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes from outside pointer-down and ancestor scroll without selecting", () => {
    const onValueChange = vi.fn<() => void>();
    renderSelect({ onValueChange });
    const trigger = screen.getByRole("combobox");

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("stays open while its own list scrolls", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox");

    fireEvent.click(trigger);
    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });

  it("wires labels, messages, invalid state, placeholder, and left icon", () => {
    renderSelect({
      "aria-label": undefined,
      iconLeft: <span>C</span>,
      invalid: true,
      label: "Calendar label",
      message: "Choose a calendar",
      placeholder: "Choose calendar",
      value: undefined,
    });
    const message = screen.getByText("Choose a calendar");
    const trigger = screen.getByRole("combobox", { name: "Calendar label" });
    expect(trigger.id).toBe("calendar");

    expect(trigger.textContent).toContain("Choose calendar");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(trigger.getAttribute("aria-describedby")).toBe(message.id);
    screen.getByText("C");
  });

  it("does not open when disabled and marks disabled options", () => {
    renderSelect({ disabled: true });
    const trigger = screen.getByRole("combobox");

    expect(trigger.getAttribute("disabled")).toBe("");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();

    renderSelect();
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    expect(
      screen
        .getByRole("option", { name: "Bravo" })
        .getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("handles a list with no enabled options", () => {
    renderSelect({
      options: [{ disabled: true, label: "Blocked", value: "blocked" }],
    });

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "End" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });

    expect(listbox.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("keeps a popup portaled out of its dialog owned by that dialog", () => {
    const onOpenChange = vi.fn<() => void>();
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const mount = document.createElement("div");
    shadowRoot.append(mount);
    document.body.append(host);

    const { unmount } = render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent container={shadowRoot} label="Event">
          <Select
            id="dialog-select"
            aria-label="Repeat unit"
            options={options}
            value="a"
            onValueChange={() => {}}
          />
        </DialogContent>
      </Dialog>,
      { container: mount }
    );

    try {
      const panel = shadowRoot.querySelector<HTMLElement>(
        '[role="dialog"][aria-label="Event"]'
      );

      if (panel === null) {
        throw new Error("Expected the dialog panel");
      }

      fireEvent.click(within(panel).getByRole("combobox"));

      const listbox = getShadowListbox(shadowRoot);

      expect(panel.contains(listbox)).toBeFalsy();

      fireEvent.focusIn(listbox);
      fireEvent.pointerDown(listbox);

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(getShadowListbox(shadowRoot)).toBe(listbox);
    } finally {
      unmount();
      host.remove();
    }
  });

  it("keeps the popup in the calendar shadow root", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const mount = document.createElement("div");
    shadowRoot.append(mount);
    document.body.append(host);

    const { unmount } = render(
      <Select
        id="shadow-calendar"
        aria-label="Calendar"
        options={options}
        value="a"
        onValueChange={() => {}}
      />,
      { container: mount }
    );

    const trigger = within(mount).getByRole("combobox");
    fireEvent.click(trigger);

    const shadowListbox = getShadowListbox(shadowRoot);
    expect(shadowListbox.getRootNode()).toBe(shadowRoot);
    expect(screen.queryByRole("listbox")).toBeNull();

    unmount();
    host.remove();
  });

  it("renders the internal listbox options and forwards refs", () => {
    const onOptionSelect = vi.fn<(option: ListboxOption) => void>();
    const onActiveIndexChange = vi.fn<(index: number) => void>();
    const objectRef = createRef<HTMLDivElement>();

    const internalOptions: readonly ListboxOption[] = [
      {
        checked: true,
        divider: true,
        label: <span>Alpha</span>,
        leftIcon: <span>Left</span>,
        rightIcon: <span>Right</span>,
        selected: true,
        subtitle: "Subtitle",
        support: "Support",
        value: "alpha",
      },
      { disabled: true, label: "Bravo", value: "bravo" },
      { label: "Charlie", value: "charlie" },
    ];

    render(
      <InternalListbox
        id="internal-listbox"
        listboxRef={objectRef}
        options={internalOptions}
        activeIndex={0}
        onActiveIndexChange={(nextIndex) => {
          onActiveIndexChange(nextIndex);
        }}
        onOptionSelect={(option) => {
          onOptionSelect(option);
        }}
      />
    );

    const listbox = screen.getByRole("listbox");
    fireEvent.pointerDown(screen.getByRole("option", { name: /Alpha/u }));
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Charlie" }));

    expect({
      activeIndex: onActiveIndexChange.mock.calls[0]?.[0],
      listboxRef: objectRef.current === listbox,
      option: onOptionSelect.mock.calls[0]?.[0],
      subtitle: screen.queryByText("Subtitle") !== null,
      support: screen.queryByText("Support") !== null,
    }).toStrictEqual({
      activeIndex: 2,
      listboxRef: true,
      option: internalOptions[0],
      subtitle: true,
      support: true,
    });

    const callbackRef = vi.fn<(node: HTMLDivElement | null) => void>();

    const { rerender } = render(
      <InternalListbox
        listboxRef={callbackRef}
        options={internalOptions}
        onOptionSelect={(option) => {
          onOptionSelect(option);
        }}
      />
    );

    rerender(
      <InternalListbox
        listboxRef={callbackRef}
        open={false}
        options={internalOptions}
        onOptionSelect={(option) => {
          onOptionSelect(option);
        }}
      />
    );

    expect({
      callbackRef: callbackRef.mock.calls.some(
        ([node]) => node instanceof HTMLDivElement
      ),
      listboxCount: screen.getAllByRole("listbox").length,
    }).toStrictEqual({ callbackRef: true, listboxCount: 1 });
  });

  it("does not render an empty internal listbox without content", () => {
    render(
      <InternalListbox
        options={[]}
        emptyContent=" "
        onOptionSelect={() => {}}
      />
    );

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("updates displayed value when consumer applies the selection", () => {
    render(<StatefulSelect value="a" />);
    const trigger = screen.getByRole("combobox");

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("option", { name: "Charlie" }));

    expect(trigger.textContent).toContain("Charlie");
  });
});
