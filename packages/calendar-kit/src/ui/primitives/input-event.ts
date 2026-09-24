import type { ChangeEvent } from "react";

export const isInputChangeEvent = (
  event: unknown
): event is ChangeEvent<HTMLInputElement> =>
  event instanceof Event && event.target instanceof HTMLInputElement;
