import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Avatar,
  AvatarOverflow,
  AvatarStack,
  AvatarStackItem,
} from "../avatar";

describe(Avatar, () => {
  it("shows initials and announces the full name", () => {
    render(<Avatar name="Kristina Todorovic" />);

    expect(screen.getByText("KT")).not.toBeNull();
    expect(screen.getByText("Kristina Todorovic")).not.toBeNull();
  });

  it("uses one initial for one-word names and requested locale", () => {
    const { rerender } = render(<Avatar name="Constructor" />);
    expect(screen.getByText("C")).not.toBeNull();

    rerender(<Avatar name="irem" locale="tr-TR" />);
    expect(screen.getByText("İ")).not.toBeNull();
  });

  it("stays silent when decorative and maps seeded surfaces to classes", () => {
    const { container } = render(
      <>
        <Avatar decorative name="Lena Markovic" />
        <Avatar name="A" seed="one" />
      </>
    );

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("Lena Markovic")).toBeNull();
    expect(screen.getAllByText("A")[0]).toBeVisible();
  });
});

describe(AvatarOverflow, () => {
  it("shows the count and accessible label", () => {
    render(<AvatarOverflow count={3} label="more participants" />);

    expect(screen.getByText("+3")).not.toBeNull();
    expect(screen.getByText("+3 more participants")).not.toBeNull();
  });
});

describe(AvatarStack, () => {
  it("renders its children as list items", () => {
    render(
      <AvatarStack>
        <AvatarStackItem>
          <Avatar name="Kristina Todorovic" />
        </AvatarStackItem>
        <AvatarStackItem>
          <Avatar name="Nikola Stankovic" />
        </AvatarStackItem>
      </AvatarStack>
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
