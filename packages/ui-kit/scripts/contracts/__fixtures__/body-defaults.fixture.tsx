// Fixture for extract.test.ts and compile.test.ts: defaults a wrapper gives
// a prop other than as a destructured default.
//
//   - `Coalesced` reads its `variant` only as `variant ?? 'ghost'`;
//   - `CoalescedRaw` reads it that way and also as its own value, which is
//     noted, and `CoalescedComputed` coalesces to a constant, a fallback chain
//     that records nothing: neither states a default;
//   - `AttributeFirst` writes literal attributes on its element before the
//     rest spread, for props the rest carries; `AttributeAfter` writes one
//     after the spread, where it overrides the caller and is no default;
//   - `TwoElements` spreads the rest on one of two returned elements;
//   - `OmitKeyof` removes the reused axis with `Omit<BaseProps, keyof Hidden>`,
//     keys the checker lists, and `OmitGeneric` with a type parameter, keys
//     nothing can list.
import { cva, type VariantProps } from 'class-variance-authority';

const baseVariants = cva('base', {
  variants: { variant: { default: 'v-default', ghost: 'v-ghost', solid: 'v-solid' } },
  defaultVariants: { variant: 'default' },
});

export interface BaseProps extends VariantProps<typeof baseVariants> {
  label?: string;
  size?: number;
  disabled?: boolean;
}

export function Base({ variant, label, size, disabled }: BaseProps) {
  return (
    <button className={baseVariants({ variant })} data-size={size} disabled={disabled}>
      {label}
    </button>
  );
}

const FALLBACK = 'solid';

export function Coalesced({ variant, ...props }: BaseProps) {
  return <Base variant={variant ?? 'ghost'} {...props} />;
}

export function CoalescedRaw({ variant, ...props }: BaseProps) {
  return <Base variant={variant ?? 'ghost'} data-raw={variant} {...props} />;
}

export function CoalescedComputed({ variant, ...props }: BaseProps) {
  return <Base variant={variant ?? FALLBACK} {...props} />;
}

export function AttributeFirst(props: BaseProps) {
  return <Base variant="ghost" size={2} disabled {...props} />;
}

export function AttributeFirstBound({ label, ...props }: BaseProps) {
  return <Base variant="ghost" size={2} disabled label={label} {...props} />;
}

export function AttributeAfter({ label, ...props }: BaseProps) {
  return <Base {...props} variant="ghost" label={label} />;
}

export function TwoElements({ label, ...props }: BaseProps & { inline?: boolean }) {
  if (props.inline) return <Base variant="ghost" {...props} />;
  return <span>{label}</span>;
}

interface Hidden {
  variant?: unknown;
}

export type OmitKeyofProps = Omit<BaseProps, keyof Hidden>;

export function OmitKeyof({ label }: OmitKeyofProps) {
  return <span>{label}</span>;
}

export function OmitGeneric<K extends keyof BaseProps>(props: Omit<BaseProps, K>) {
  return <span data-count={Object.keys(props).length} />;
}
