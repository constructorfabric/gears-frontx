import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Radio, RadioGroup } from "../radio";

const getRadios = (): HTMLElement[] => screen.getAllByRole("radio");

const getHiddenInputs = (): HTMLInputElement[] =>
  [...document.querySelectorAll('input[type="radio"]')].map((radio) => {
    if (!(radio instanceof HTMLInputElement)) {
      throw new Error("Expected a radio input");
    }

    return radio;
  });

describe(Radio, () => {
  it("renders box-only without a label and orders the other layouts correctly", () => {
    render(
      <div>
        <Radio
          type="box-only"
          value="only"
          label="Only"
          aria-label="Only radio"
        />
        <Radio type="box-first" value="first" label="First" />
        <Radio type="text-first" value="last" label="Last" />
      </div>
    );

    expect(
      screen.getByRole("radio", { name: "Only radio" }).closest("label")
    ).toBeNull();

    const firstInput = screen.getByRole("radio", { name: "First" });
    const firstText = screen.getByText("First");
    const lastInput = screen.getByRole("radio", { name: "Last" });
    const lastText = screen.getByText("Last");

    expect(firstInput.compareDocumentPosition(firstText)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(lastText.compareDocumentPosition(lastInput)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("wires the visible label to the hidden input id", () => {
    render(<Radio value="daily" label="Daily" />);

    const [hiddenInput] = getHiddenInputs();
    const label = screen.getByText("Daily").closest("label");

    expect(hiddenInput).toBeInstanceOf(HTMLInputElement);
    expect(label).not.toBeNull();
    expect(label?.htmlFor).toBe(hiddenInput?.id);
  });

  it("renders the required marker and associates an invalid message", () => {
    render(
      <Radio
        value="daily"
        label="Daily"
        message="Choose a repeat interval"
        required
        invalid
      />
    );

    const radio = screen.getByRole("radio", { name: "Daily" });
    const [hiddenInput] = getHiddenInputs();
    const message = screen.getByText("Choose a repeat interval");

    expect(hiddenInput).toHaveProperty("required", true);
    expect(radio.getAttribute("aria-invalid")).toBe("true");
    expect(radio.getAttribute("aria-describedby")).toBe(message.id);
    expect(screen.getByText("*").getAttribute("aria-hidden")).toBe("true");
  });

  it("forwards the hidden-input ref through the ui-kit item", () => {
    const objectRef = createRef<HTMLInputElement>();
    const callbackRef = vi.fn<() => void>();

    render(
      <div>
        <Radio value="object" aria-label="Object" ref={objectRef} />
        <Radio value="callback" aria-label="Callback" ref={callbackRef} />
      </div>
    );

    expect(objectRef.current).toBeInstanceOf(HTMLInputElement);
    expect(callbackRef).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });
});

describe(RadioGroup, () => {
  it("delegates group state and accepts radios through fragments", () => {
    render(
      <RadioGroup name="repeat" value="daily" onValueChange={() => {}}>
        ignored
        <Radio value="daily" label="Daily" />
      </RadioGroup>
    );

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radiogroup")).toHaveClass(/group/u);
  });

  it("selects a child and exposes group accessibility metadata", async () => {
    const onValueChange = vi.fn<() => void>();
    render(
      <RadioGroup
        name="repeat"
        value="daily"
        onValueChange={onValueChange}
        aria-label="Repeat"
      >
        <Radio value="daily" label="Daily" />
        <Radio value="weekly" label="Weekly" />
      </RadioGroup>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Weekly" }));

    expect(onValueChange).toHaveBeenCalledWith("weekly");
    expect(screen.getByRole("radiogroup", { name: "Repeat" })).toHaveAttribute(
      "aria-orientation",
      "vertical"
    );
    expect(
      getHiddenInputs().every((radio) => radio.name === "repeat")
    ).toBeTruthy();
  });

  it("keeps only the active enabled radio tabbable", () => {
    const view = render(
      <RadioGroup name="repeat" value="weekly" onValueChange={() => {}}>
        <Radio value="daily" label="Daily" />
        <Radio value="weekly" label="Weekly" />
        <Radio value="monthly" label="Monthly" />
      </RadioGroup>
    );

    let radios = getRadios();
    expect(radios.map((radio) => radio.tabIndex)).toStrictEqual([-1, 0, -1]);

    view.rerender(
      <RadioGroup name="repeat" value="unknown" onValueChange={() => {}}>
        <Radio value="daily" label="Daily" />
        <Radio value="weekly" label="Weekly" />
        <Radio value="monthly" label="Monthly" />
      </RadioGroup>
    );

    radios = getRadios();
    expect(radios.map((radio) => radio.tabIndex)).toStrictEqual([0, -1, -1]);
  });

  it("skips disabled radios and wraps arrow navigation", async () => {
    const calls: string[] = [];

    const view = render(
      <RadioGroup
        name="repeat"
        value="daily"
        onValueChange={(nextValue) => {
          calls.push(nextValue);
        }}
      >
        <Radio value="daily" label="Daily" />
        <Radio value="weekly" label="Weekly" disabled />
        <Radio value="monthly" label="Monthly" />
      </RadioGroup>
    );

    let radios = getRadios();
    const user = userEvent.setup();
    radios[0]?.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(calls).toStrictEqual(["monthly"]);
    });
    expect(calls).not.toContain("weekly");

    view.rerender(
      <RadioGroup
        name="repeat"
        value="monthly"
        onValueChange={(nextValue) => {
          calls.push(nextValue);
        }}
      >
        <Radio value="daily" label="Daily" />
        <Radio value="weekly" label="Weekly" disabled />
        <Radio value="monthly" label="Monthly" />
      </RadioGroup>
    );

    radios = getRadios();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(calls).toStrictEqual(["monthly", "daily"]);
    });

    await user.click(radios[1]);
    expect(calls).toStrictEqual(["monthly", "daily"]);
  });

  it("swaps horizontal arrows in an RTL shadow-root host", async () => {
    const calls: string[] = [];

    const host = document.createElement("div");
    host.setAttribute("dir", "rtl");
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const mountPoint = document.createElement("div");
    shadowRoot.append(mountPoint);

    try {
      render(
        <RadioGroup
          name="repeat"
          value="daily"
          orientation="horizontal"
          onValueChange={(nextValue) => {
            calls.push(nextValue);
          }}
        >
          <Radio value="daily" label="Daily" />
          <Radio value="weekly" label="Weekly" />
          <Radio value="monthly" label="Monthly" />
        </RadioGroup>,
        { container: mountPoint }
      );

      const firstRadio = within(mountPoint).getByRole("radio", {
        name: "Daily",
      });

      if (!(firstRadio instanceof HTMLElement)) {
        throw new Error("Expected a radio root in the shadow root");
      }

      const user = userEvent.setup();
      firstRadio.focus();
      await user.keyboard("{ArrowRight}");
      await waitFor(() => {
        expect(calls).toStrictEqual(["monthly"]);
      });
    } finally {
      host.remove();
    }
  });
});
