'use client';

import { OTPField as OTPFieldPrimitive } from '@base-ui/react/otp-field';
import { cx } from 'class-variance-authority';
import { type ComponentProps, createContext, useContext, useId } from 'react';

import styles from './input-otp.module.css';

/*
 * Deviation from upstream (see input-otp.md's "Deviation from upstream"
 * section for the full rationale): upstream wraps the third-party
 * `input-otp` package, whose `OTPInput` renders ONE shared, visually
 * hidden native input, with each visible "slot" a plain decorative <div>
 * reading its character/active/caret state from React context
 * (`OTPInputContext`). This port builds on Base UI's `OTPField` instead —
 * it renders one REAL `<input>` PER SLOT (Base UI derives each input's
 * position from render order via a composite list, not a context read),
 * so `InputOtpSlot` below IS that input, not a context-driven display
 * div. The exported part names mirror upstream's (`InputOtp`/
 * `InputOtpGroup`/`InputOtpSlot`/`InputOtpSeparator` for upstream's
 * `InputOTP`/`InputOTPGroup`/`InputOTPSlot`/`InputOTPSeparator`) as
 * closely as the primitive allows.
 */

export interface InputOtpProps extends Omit<OTPFieldPrimitive.Root.Props, 'className'> {
  className?: string;
}

// The id of the hidden text that names every slot, when the root was given
// an `aria-label` (see InputOtp).
const InputOtpLabelContext = createContext<string | undefined>(undefined);

/*
 * Base UI's OTPField names its inputs from a `<label>` or Field.Label only:
 * an `aria-label` on the root stays on the root, and the first input
 * ignores one of its own, so `<InputOtp aria-label="Verification code">`
 * left every slot unnamed (axe `label`). With an `aria-label` and no
 * `aria-labelledby`, the root renders that text in a hidden span and every
 * slot points at it through `aria-labelledby`. A slot's own
 * `aria-labelledby` or non-empty `aria-label` still wins (Base UI ignores
 * an `aria-label` on the first slot, so leave that one to the root). Name
 * the field one way: an `aria-label` on the root takes over from a
 * `<label htmlFor>` naming it.
 */
export function InputOtp({ className, children, ...props }: InputOtpProps) {
  const labelId = useId();
  const ariaLabel = props['aria-label'];
  const labelled =
    typeof ariaLabel === 'string' && ariaLabel !== '' && props['aria-labelledby'] === undefined;
  return (
    <InputOtpLabelContext.Provider value={labelled ? labelId : undefined}>
      <OTPFieldPrimitive.Root className={cx(styles.root, className)} {...props}>
        {children}
        {labelled ? (
          <span id={labelId} hidden>
            {ariaLabel}
          </span>
        ) : null}
      </OTPFieldPrimitive.Root>
    </InputOtpLabelContext.Provider>
  );
}

// No Base UI primitive backs this part (upstream's own `InputOTPGroup` is
// also a plain `<div>`) — purely a visual grouping of a run of slots, so
// a caret-blink separator can sit between groups without one running the
// full length of the code.
export type InputOtpGroupProps = ComponentProps<'div'>;

export function InputOtpGroup({ className, ...props }: InputOtpGroupProps) {
  return <div className={cx(styles.group, className)} {...props} />;
}

export interface InputOtpSlotProps extends Omit<OTPFieldPrimitive.Input.Props, 'className'> {
  className?: string;
}

export function InputOtpSlot({ className, ...props }: InputOtpSlotProps) {
  const labelId = useContext(InputOtpLabelContext);
  return (
    <OTPFieldPrimitive.Input
      className={cx(styles.slot, className)}
      aria-labelledby={props['aria-label'] ? undefined : labelId}
      {...props}
    />
  );
}

export interface InputOtpSeparatorProps
  extends Omit<OTPFieldPrimitive.Separator.Props, 'className'> {
  className?: string;
}

// Base UI's OTPField namespace exports a `Separator` part of its own (see
// @base-ui/react/otp-field's index.parts.ts re-exporting
// @base-ui/react/separator) — used directly here rather than a plain
// decorative div, since it already carries `role="separator"` and
// `data-orientation`. Defaults to a dash glyph (upstream's own default,
// there via a lucide MinusIcon) only when the consumer renders no
// children of their own.
export function InputOtpSeparator({ className, children, ...props }: InputOtpSeparatorProps) {
  return (
    <OTPFieldPrimitive.Separator className={cx(styles.separator, className)} {...props}>
      {children ?? <span aria-hidden="true">-</span>}
    </OTPFieldPrimitive.Separator>
  );
}
