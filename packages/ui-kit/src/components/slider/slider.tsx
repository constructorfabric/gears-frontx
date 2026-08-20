import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cx } from 'class-variance-authority';

import styles from './slider.module.css';

export interface SliderProps<Value extends number | readonly number[] = number | readonly number[]>
  extends Omit<SliderPrimitive.Root.Props<Value>, 'className'> {
  className?: string;
}

/*
 * No variant/size axis — upstream ships none either (a single visual
 * treatment), so this stays a plain `cx` composition like checkbox.tsx/
 * radio-group.tsx rather than inventing a CVA axis nothing calls for.
 *
 * One Thumb per entry in the resolved value, mirroring upstream's intent:
 * an uncontrolled range slider's `defaultValue={[10, 20]}` needs two
 * thumbs without the consumer wiring them by hand. `index` is passed to
 * each Thumb (upstream's own translation omits it) because Base UI's docs
 * call it out as required for correct SSR of a multi-thumb range slider —
 * free correctness a single-thumb slider doesn't even notice (index
 * defaults to 0 there).
 *
 * Deviation from upstream's own thumb-count derivation: its
 * `Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue
 * : [min, max]` falls through BOTH `Array.isArray` checks for a plain
 * scalar `defaultValue={50}` (the single-value case, and Base UI's own
 * supported `Value = number` shape) straight to the `[min, max]`
 * fallback — silently rendering two thumbs for a slider that should have
 * one. Resolving `value ?? defaultValue` first and wrapping a defined
 * scalar in a one-element array fixes that; the `[min, max]` fallback is
 * kept for the genuinely empty case (neither prop given at all), where
 * upstream's choice to show a full range is a reasonable default rather
 * than a bug.
 */
export function Slider<Value extends number | readonly number[] = number | readonly number[]>({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderProps<Value>) {
  const resolved = value ?? defaultValue;
  const values = Array.isArray(resolved) ? resolved : resolved !== undefined ? [resolved] : [min, max];
  return (
    <SliderPrimitive.Root
      className={cx(styles.root, className)}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className={styles.control}>
        <SliderPrimitive.Track className={styles.track}>
          <SliderPrimitive.Indicator className={styles.range} />
        </SliderPrimitive.Track>
        {Array.from({ length: values.length }, (_, index) => (
          <SliderPrimitive.Thumb key={index} index={index} className={styles.thumb} />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
