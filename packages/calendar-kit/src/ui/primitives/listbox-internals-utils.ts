import type { Ref } from "react";

import type { ListboxOption } from "./listbox-internals";

export const assignRef = <T>(
  ref: Ref<T> | undefined,
  value: T | null
): void => {
  if (!ref) {
    return;
  }

  if ("current" in ref) {
    ref.current = value;
    return;
  }

  ref(value);
};

export const getListboxOptionId = (
  optionIdPrefix: string,
  value: string
): string => `${optionIdPrefix}-${value}`;

export const isEnabled = <Value extends string>(
  option: ListboxOption<Value> | undefined
): option is ListboxOption<Value> =>
  option !== undefined && option.disabled !== true;

export const firstEnabledIndex = <Value extends string>(
  options: readonly ListboxOption<Value>[]
): number => options.findIndex((option) => isEnabled(option));

export const lastEnabledIndex = <Value extends string>(
  options: readonly ListboxOption<Value>[]
): number => {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (isEnabled(options[index])) {
      return index;
    }
  }

  return -1;
};

export const resolveActiveIndex = <Value extends string>(
  options: readonly ListboxOption<Value>[],
  preferredIndex: number | undefined
): number => {
  if (preferredIndex !== undefined && isEnabled(options[preferredIndex])) {
    return preferredIndex;
  }

  return firstEnabledIndex(options);
};

export const moveToEnabledIndex = <Value extends string>(
  options: readonly ListboxOption<Value>[],
  currentIndex: number,
  delta: number
): number => {
  if (!options.some((option) => isEnabled(option))) {
    return -1;
  }

  let nextIndex = currentIndex;
  let attempts = 0;

  while (attempts < options.length) {
    attempts += 1;
    nextIndex = (nextIndex + delta + options.length) % options.length;

    if (isEnabled(options[nextIndex])) {
      return nextIndex;
    }
  }

  return currentIndex;
};

export const resolveActiveOptionId = <Value extends string>(
  option: ListboxOption<Value> | undefined,
  optionIdPrefix: string
): string | undefined => {
  if (!isEnabled(option)) {
    return undefined;
  }

  return option.id ?? getListboxOptionId(optionIdPrefix, option.value);
};
