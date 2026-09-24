export const arrayAt = <T>(
  items: readonly T[],
  index: number
): T | undefined => {
  const resolvedIndex = index < 0 ? items.length + index : index;

  return resolvedIndex < 0 || resolvedIndex >= items.length
    ? undefined
    : items[resolvedIndex];
};

export const sortCopy = <T>(
  values: readonly T[],
  compareFn?: (left: T, right: T) => number
): T[] => {
  const copy = [...values];

  const sortMethod = "sort" as const;

  // ES2022 has no toSorted; sort a private copy to preserve the readonly input.
  return copy[sortMethod](compareFn);
};
