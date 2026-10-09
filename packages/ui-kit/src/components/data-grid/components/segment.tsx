import { ToggleGroup, type ToggleGroupProps } from '../../toggle-group/public.js';

export interface SegmentProps
  extends Omit<ToggleGroupProps, 'value' | 'defaultValue' | 'onValueChange' | 'multiple'> {
  /** The chosen item's value. Leave it out to let the group keep its own state. */
  value?: string;
  /** Called with the chosen value, or `undefined` when the chosen item is pressed again. */
  onValueChange?: (value: string | undefined) => void;
}

/**
 * A single-choice segmented control: `ToggleGroup` in its joined, outlined look, with its array
 * value narrowed to one. The grid reads and writes one value everywhere it uses a segmented
 * control (the page-size selector, the view switch), and an array that is
 * always zero or one long is a trap for each of those callers.
 */
export function Segment({ value, onValueChange, ...props }: SegmentProps) {
  return (
    <ToggleGroup
      spacing={0}
      variant="outline"
      {...props}
      value={value === undefined ? undefined : [value]}
      onValueChange={(next) => onValueChange?.(next[0])}
    />
  );
}
