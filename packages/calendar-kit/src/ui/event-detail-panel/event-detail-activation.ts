import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const activationKeyDown = (activate: () => void) =>
  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    activate();
  };
