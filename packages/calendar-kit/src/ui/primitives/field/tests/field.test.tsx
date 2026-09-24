import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../field";

import styles from "../field.module.css";

describe(FieldLabel, () => {
  it("renders its text", () => {
    render(<FieldLabel>Title</FieldLabel>);

    expect(screen.getByText("Title").tagName).toBe("LABEL");
  });

  it("associates with an input through htmlFor", () => {
    render(
      <>
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <input id="title" />
      </>
    );

    expect(screen.getByLabelText("Title")).toBeInstanceOf(HTMLInputElement);
  });

  it("renders a required marker when required", () => {
    render(
      <>
        <FieldLabel htmlFor="title" required>
          Title
        </FieldLabel>
        <input id="title" />
      </>
    );

    const marker = screen.getByText("*");

    expect(marker?.textContent).toBe("*");
  });

  it("omits the marker by default", () => {
    render(<FieldLabel>Title</FieldLabel>);

    expect(screen.queryByText("*")).toBeNull();
  });

  it("delegates the label root and ref while preserving calendar required wiring", () => {
    const ref = createRef<HTMLLabelElement>();

    render(
      <FieldLabel ref={ref} required className="consumer" htmlFor="title">
        Title
      </FieldLabel>
    );

    const label = screen.getByText("Title").closest("label");
    expect(label).toHaveProperty("tagName", "LABEL");
    expect(label).toHaveClass(styles.label, "consumer");
    expect(ref.current).toBe(label);
  });

  it("provides a group wrapper for composed controls", () => {
    render(
      <Field orientation="horizontal">
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <input id="title" />
      </Field>
    );

    expect(screen.getByRole("group")).toHaveClass(styles.horizontal);
  });
});

describe(Field, () => {
  it("delegates the field root contract and its ref to ui-kit", () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <Field ref={ref} orientation="responsive" className="consumer">
        content
      </Field>
    );

    const field = screen.getByRole("group");
    expect(field).toHaveProperty("tagName", "DIV");
    expect(field).toHaveAttribute("role", "group");
    expect(field).toHaveAttribute("data-orientation", "responsive");
    expect(field).toHaveClass(styles.field, styles.responsive, "consumer");
    expect(field.className.split(" ").length).toBeGreaterThan(3);
  });

  it("forwards the field root ref to the rendered element", () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <Field ref={ref} orientation="responsive" className="consumer">
        content
      </Field>
    );

    expect(ref.current).toBe(screen.getByRole("group"));
  });
});

describe(FieldError, () => {
  it("renders the message with alert semantics", () => {
    render(<FieldError id="title-error">Required</FieldError>);

    const message = screen.getByRole("alert");

    expect(message.textContent).toBe("Required");
    expect(message.id).toBe("title-error");
    expect(message.tagName).toBe("P");
  });

  it("renders nothing when empty", () => {
    const { container } = render(<FieldError id="title-error" />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a blank string", () => {
    const { container } = render(<FieldError id="title-error"> </FieldError>);

    expect(container.firstChild).toBeNull();
  });

  it("preserves an explicit error role and delegates the field-part ref contract", () => {
    const ref = createRef<HTMLParagraphElement>();

    render(
      <FieldError ref={ref} role="status" className="consumer">
        Saved
      </FieldError>
    );

    const message = screen.getByRole("status");
    expect(message).toHaveTextContent("Saved");
    expect(message).toHaveClass(styles.error, "consumer");
    expect(ref.current).toBe(message);
  });
});

describe("Field layout companions", () => {
  it("delegates description, group, set, and legend elements", () => {
    const descriptionRef = createRef<HTMLParagraphElement>();

    render(
      <FieldGroup className="group-consumer">
        <FieldSet>
          <FieldLegend>Repeat</FieldLegend>
          <FieldDescription ref={descriptionRef}>Choose one</FieldDescription>
        </FieldSet>
      </FieldGroup>
    );

    const description = screen.getByText("Choose one");
    expect(screen.getByText("Repeat").tagName).toBe("LEGEND");
    expect(description.tagName).toBe("P");
    expect(description.closest("fieldset")).not.toBeNull();
    expect(description.closest("div")).not.toBeNull();
    expect(description.closest("div")).toHaveClass("group-consumer");
  });

  it("forwards the description ref to the rendered paragraph", () => {
    const descriptionRef = createRef<HTMLParagraphElement>();

    render(
      <FieldGroup className="group-consumer">
        <FieldSet>
          <FieldLegend>Repeat</FieldLegend>
          <FieldDescription ref={descriptionRef}>Choose one</FieldDescription>
        </FieldSet>
      </FieldGroup>
    );

    expect(descriptionRef.current).toBe(screen.getByText("Choose one"));
  });
});
