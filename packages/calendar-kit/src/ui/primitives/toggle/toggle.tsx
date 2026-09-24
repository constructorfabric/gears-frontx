import { Switch as UiSwitch } from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import { useId } from "react";
import type { KeyboardEventHandler, ReactNode } from "react";

import { isPresentNode, textFromNode } from "../react-node-text";

import styles from "./toggle.module.css";

type ToggleType = "toggle-only" | "toggle-first" | "text-first";

type ToggleSize = "m" | "s";

type ToggleLabelPosition = "after" | "before" | "none";

interface ToggleProps {
  readonly type?: ToggleType;
  readonly size?: ToggleSize;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly required?: boolean;
  readonly label?: ReactNode;
  readonly className?: string;
}

const TRACK_SIZE_CLASS: Readonly<Record<ToggleSize, string>> = {
  m: styles.sizeM,
  s: styles.sizeS,
};

const SWITCH_SIZE: Readonly<Record<ToggleSize, "default" | "sm">> = {
  m: "default",
  s: "sm",
};

const LABEL_POSITION: Readonly<Record<ToggleType, ToggleLabelPosition>> = {
  "text-first": "before",
  "toggle-first": "after",
  "toggle-only": "none",
};

interface ToggleLabelProps {
  readonly disabled: boolean;
  readonly label: ReactNode;
  readonly labelId: string;
  readonly required: boolean;
}

const ToggleLabel = ({
  labelId,
  label,
  disabled,
  required,
}: ToggleLabelProps) => (
  <span
    id={labelId}
    className={clsx(styles.label, disabled && styles.labelDisabled)}
  >
    {label}
    {required ? (
      <span aria-hidden="true" className={styles.requiredMark}>
        *
      </span>
    ) : null}
  </span>
);

const Toggle = ({
  checked,
  onCheckedChange,
  disabled = false,
  invalid = false,
  required = false,
  label,
  className,
  type = "toggle-first",
  size = "m",
}: ToggleProps) => {
  const trackId = useId();
  const labelId = useId();
  const hasLabel = isPresentNode(label);

  const labelPosition = hasLabel ? LABEL_POSITION[type] : "none";

  const labelContent = (
    <ToggleLabel
      labelId={labelId}
      label={label}
      disabled={disabled}
      required={required}
    />
  );

  const handleKeyDown = (
    event: Parameters<KeyboardEventHandler<HTMLSpanElement>>[0]
  ) => {
    // Base UI's switch has no Space activation; the calendar contract is Space toggles, Enter inert.
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    const { preventBaseUIHandler } = event as Parameters<
      KeyboardEventHandler<HTMLSpanElement>
    >[0] & {
      preventBaseUIHandler?: () => void;
    };
    preventBaseUIHandler?.();

    if (event.key === " " && !disabled) {
      event.preventDefault();
      onCheckedChange(!checked);
    }
  };

  const switchControl = (
    <UiSwitch
      id={trackId}
      checked={checked}
      disabled={disabled}
      required={required}
      aria-invalid={invalid ? true : undefined}
      aria-labelledby={
        hasLabel && labelPosition !== "none" ? labelId : undefined
      }
      aria-label={
        hasLabel && labelPosition === "none" ? textFromNode(label) : undefined
      }
      onCheckedChange={onCheckedChange}
      onKeyDown={handleKeyDown}
      size={SWITCH_SIZE[size]}
      className={clsx(
        styles.track,
        TRACK_SIZE_CLASS[size],
        checked && styles.trackChecked,
        invalid && styles.trackInvalid,
        disabled && styles.trackDisabled
      )}
    />
  );

  return (
    <div className={clsx(styles.root, className)}>
      {labelPosition === "before" ? (
        <label className={styles.labelControl} htmlFor={trackId}>
          {labelContent}
        </label>
      ) : null}
      {switchControl}
      {labelPosition === "after" ? (
        <label className={styles.labelControl} htmlFor={trackId}>
          {labelContent}
        </label>
      ) : null}
    </div>
  );
};

Toggle.displayName = "Toggle";

export { Toggle };
