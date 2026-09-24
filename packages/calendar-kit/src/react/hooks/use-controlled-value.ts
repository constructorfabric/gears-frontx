import { useCallback, useMemo, useState } from "react";

export interface UseControlledValueOptions<Value> {
  readonly value?: Value;
  readonly defaultValue: Value;
  readonly onChange?: (value: Value) => void;
}

export interface UseControlledValueResult<Value> {
  readonly value: Value;
  readonly setValue: (value: Value) => void;
  readonly isControlled: boolean;
}

export const useControlledValue = <Value>({
  value,
  defaultValue,
  onChange,
}: UseControlledValueOptions<Value>): UseControlledValueResult<Value> => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);

  const isControlled = value !== undefined;

  const currentValue = isControlled ? value : uncontrolledValue;

  const setValue = useCallback(
    (nextValue: Value): void => {
      if (Object.is(currentValue, nextValue)) {
        return;
      }

      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }

      onChange?.(nextValue);
    },
    [currentValue, isControlled, onChange]
  );

  // SAFETY: consumers memoise on this identity.
  return useMemo(
    () => ({
      isControlled,
      setValue,
      value: currentValue,
    }),
    [currentValue, isControlled, setValue]
  );
};
