import { Input as InputPrimitive } from '@base-ui/react/input';
import { cx } from 'class-variance-authority';
import { Children, type ReactNode } from 'react';

import styles from './input.module.css';

export interface InputProps extends Omit<InputPrimitive.Props, 'className'> {
  className?: string;
  /**
   * Leading icon slot — decorative only: rendered aria-hidden with pointer
   * events off, so it never carries the field's name or steals a click.
   * Semantics stay on the input itself — a search field is `type="search"`
   * plus a magnifier passed here.
   */
  icon?: ReactNode;
  /**
   * Trailing slot for live content — an icon-button (clear, reveal
   * password) or a small static adornment. Rendered after the <input> in
   * the DOM, so tab order is field first, then slot. The input clears a
   * compact icon-button's width (32px, size="sm") of end padding; anything
   * wider is the consumer's padding to extend.
   */
  end?: ReactNode;
}

/*
 * An <input> is a replaced element — no ::before to draw into, and a
 * background-image can't read the theme's color tokens — so the slots need
 * a presentational wrapper. Only a slotted input pays for it: with neither
 * prop this stays a bare <input>, and the consumer className stays on the
 * input either way, so styling targets the same element regardless. Field
 * wiring is unaffected — the primitive is still the control Field talks to.
 */
export function Input({ className, icon, end, disabled, ...props }: InputProps) {
  // `icon != null`/`end != null` are true for `icon={false}`/`end={false}` —
  // a valid ReactNode that renders nothing — which is exactly what
  // `icon={cond && <Icon/>}` passes when `cond` is false. Same predicate as
  // Button's `hasLabel`, applied to a slot instead of children: it answers
  // "is this renderable" rather than "is this set".
  const hasIcon = Children.toArray(icon).some((child) => child !== '');
  const hasEnd = Children.toArray(end).some((child) => child !== '');
  const input = (
    <InputPrimitive
      className={cx(
        styles.input,
        hasIcon && styles.hasIcon,
        hasEnd && styles.hasEnd,
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
  if (!hasIcon && !hasEnd) {
    return input;
  }
  return (
    <span className={styles.wrap}>
      {hasIcon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {input}
      {/*
       * `inert` removes `end` from the tab order and blocks activation —
       * dimming alone (see input.module.css) stops nothing for a keyboard
       * user, since a Button inside `end` keeps its tab stop and still
       * fires on Enter/Space. Only wired from this direct `disabled` prop:
       * a Field-driven disable (`<Field disabled>`) reaches the rendered
       * <input> through Base UI's own FieldControl, deeper than this
       * component's props, so it can't be observed here — see input.md.
       */}
      {hasEnd && (
        <span className={styles.end} inert={disabled}>
          {end}
        </span>
      )}
    </span>
  );
}
