import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useControlledValue } from "../use-controlled-value";
import type { UseControlledValueOptions } from "../use-controlled-value";

describe(useControlledValue, () => {
  it("updates uncontrolled state and emits the new value", () => {
    const onChange = vi.fn<(value: string) => void>();

    const options: UseControlledValueOptions<string> = {
      defaultValue: "first",
      onChange,
    };

    const { result } = renderHook(() => useControlledValue(options));

    expect(result.current.value).toBe("first");
    expect(result.current.isControlled).toBeFalsy();

    act(() => {
      result.current.setValue("second");
    });
    act(() => {
      result.current.setValue("second");
    });

    expect(result.current.value).toBe("second");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("second");
  });

  it("uses the controlled value and reports controlled state", () => {
    const onChange = vi.fn<(value: string) => void>();

    const options: UseControlledValueOptions<string> = {
      defaultValue: "fallback",
      onChange,
      value: "controlled",
    };

    const { result } = renderHook(() => useControlledValue(options));

    expect(result.current.value).toBe("controlled");
    expect(result.current.isControlled).toBeTruthy();
  });

  it("emits requested changes while controlled", () => {
    const onChange = vi.fn<(value: string) => void>();

    const options: UseControlledValueOptions<string> = {
      defaultValue: "fallback",
      onChange,
      value: "controlled",
    };

    const { result } = renderHook(() => useControlledValue(options));

    act(() => {
      result.current.setValue("requested");
    });

    expect(result.current.value).toBe("controlled");
    expect(onChange).toHaveBeenCalledWith("requested");
  });

  it("restores the internal fallback when control is removed", () => {
    const onChange = vi.fn<(value: string) => void>();

    const options: UseControlledValueOptions<string> = {
      defaultValue: "fallback",
      onChange,
      value: "controlled",
    };

    const { result, rerender } = renderHook(
      (currentOptions: UseControlledValueOptions<string>) =>
        useControlledValue(currentOptions),
      { initialProps: options }
    );

    rerender({ defaultValue: "fallback", onChange, value: undefined });

    expect(result.current.value).toBe("fallback");
    expect(result.current.isControlled).toBeFalsy();
  });

  it("keeps the first default when a later uncontrolled default changes", () => {
    const { result, rerender } = renderHook(
      (options: UseControlledValueOptions<number>) =>
        useControlledValue(options),
      { initialProps: { defaultValue: 1 } }
    );

    rerender({ defaultValue: 2 });

    expect(result.current.value).toBe(1);
  });
});
